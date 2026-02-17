import { Sandbox } from '@e2b/code-interpreter';
import { eq, and, desc, sql } from 'drizzle-orm';
import { db } from './db.js';
import { automationRuns, records, types, fields } from './schema.js';
import { env } from './env.js';
import { emitRecordEvent, type RecordEvent } from './events.js';

type AutomationRow = typeof import('./schema.js').automations.$inferSelect;
type LogEntry = { timestamp: string; level: string; message: string };
type MutationAction =
  | { action: 'create_record'; type_id: string; data: Record<string, unknown> }
  | { action: 'update_record'; type_id: string; record_id: string; data: Record<string, unknown> }
  | { action: 'delete_record'; type_id: string; record_id: string };

/**
 * Run an automation's Python code in an E2B sandbox.
 * Returns the run ID.
 */
export async function runAutomation(
  automation: AutomationRow,
  event: RecordEvent | null,
): Promise<string> {
  const startTime = Date.now();
  const logs: LogEntry[] = [];

  // Insert a run record
  const [run] = await db
    .insert(automationRuns)
    .values({
      automationId: automation.id,
      status: 'running',
      triggerEvent: event?.type ?? 'manual',
      triggerRecordId: event?.recordId ?? null,
    })
    .returning();

  if (!env.E2B_API_KEY) {
    await db
      .update(automationRuns)
      .set({
        status: 'error',
        error: 'E2B_API_KEY not configured. Automations require an E2B API key.',
        durationMs: Date.now() - startTime,
      })
      .where(eq(automationRuns.id, run.id));
    return run.id;
  }

  let sandbox: Sandbox | null = null;

  try {
    // Pre-fetch type fields for context
    const typeFields = automation.typeId
      ? await db.select().from(fields).where(eq(fields.typeId, automation.typeId))
      : [];

    // Build field name mapping for the automation code
    const fieldMap = typeFields.reduce(
      (acc, f) => {
        acc[f.id] = f.name;
        acc[f.name] = f.id;
        return acc;
      },
      {} as Record<string, string>,
    );

    // Build the Python bootstrap preamble
    const bootstrap = buildBootstrap(automation, event, fieldMap);
    const fullCode = `${bootstrap}\n\n# --- User automation code ---\n${automation.code}\n\n# --- Output actions ---\nimport json as _json\nprint("__ACTIONS__:" + _json.dumps(_actions))`;

    // Create E2B sandbox and run code
    sandbox = await Sandbox.create({ apiKey: env.E2B_API_KEY });
    const execution = await sandbox.runCode(fullCode, { timeoutMs: 30000 });

    // Parse stdout for logs and actions
    const stdout = execution.logs.stdout.join('\n');
    const stderr = execution.logs.stderr.join('\n');

    // Extract log lines and actions from stdout
    const lines = stdout.split('\n');
    let actions: MutationAction[] = [];

    for (const line of lines) {
      if (line.startsWith('__LOG__:')) {
        logs.push({
          timestamp: new Date().toISOString(),
          level: 'info',
          message: line.slice('__LOG__:'.length),
        });
      } else if (line.startsWith('__WARN__:')) {
        logs.push({
          timestamp: new Date().toISOString(),
          level: 'warn',
          message: line.slice('__WARN__:'.length),
        });
      } else if (line.startsWith('__ERROR__:')) {
        logs.push({
          timestamp: new Date().toISOString(),
          level: 'error',
          message: line.slice('__ERROR__:'.length),
        });
      } else if (line.startsWith('__ACTIONS__:')) {
        try {
          actions = JSON.parse(line.slice('__ACTIONS__:'.length));
        } catch {
          // ignore parse errors
        }
      }
    }

    // Check for execution errors
    if (execution.error) {
      logs.push({
        timestamp: new Date().toISOString(),
        level: 'error',
        message: `Execution error: ${execution.error.name}: ${execution.error.value}`,
      });
      if (stderr) {
        logs.push({ timestamp: new Date().toISOString(), level: 'error', message: stderr });
      }

      await db
        .update(automationRuns)
        .set({
          status: 'error',
          logs,
          error: `${execution.error.name}: ${execution.error.value}`,
          durationMs: Date.now() - startTime,
        })
        .where(eq(automationRuns.id, run.id));
      return run.id;
    }

    // Execute queued mutation actions on the host side
    await executeActions(actions, automation, event);

    if (actions.length > 0) {
      logs.push({
        timestamp: new Date().toISOString(),
        level: 'info',
        message: `Executed ${actions.length} action(s)`,
      });
    }

    await db
      .update(automationRuns)
      .set({
        status: 'success',
        logs,
        durationMs: Date.now() - startTime,
      })
      .where(eq(automationRuns.id, run.id));

    return run.id;
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    const isTimeout = errorMessage.toLowerCase().includes('timeout');

    await db
      .update(automationRuns)
      .set({
        status: isTimeout ? 'timeout' : 'error',
        logs,
        error: errorMessage,
        durationMs: Date.now() - startTime,
      })
      .where(eq(automationRuns.id, run.id));

    return run.id;
  } finally {
    if (sandbox) {
      try {
        await sandbox.kill();
      } catch {
        // ignore cleanup errors
      }
    }
  }
}

/**
 * Build the Python bootstrap code that sets up ctx, helpers, and pandas.
 */
function buildBootstrap(
  automation: AutomationRow,
  event: RecordEvent | null,
  fieldMap: Record<string, string>,
): string {
  const eventData = event
    ? JSON.stringify({
        type: event.type,
        record: event.record,
        record_id: event.recordId,
        previous_record: event.previousRecord ?? null,
      })
    : JSON.stringify({
        type: 'manual',
        record: {},
        record_id: null,
        previous_record: null,
      });

  const fieldMapJson = JSON.stringify(fieldMap);

  return `
import pandas as pd
import json as _json

# Event context
ctx = _json.loads('''${eventData.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}''')

# Field ID <-> Name mapping
field_map = _json.loads('''${fieldMapJson.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}''')

# Action queue (mutations to execute on host)
_actions = []

def create_record(type_id, data):
    """Queue a record creation. Data keys should be field IDs."""
    _actions.append({"action": "create_record", "type_id": type_id, "data": data})

def update_record(type_id, record_id, data):
    """Queue a record update. Data keys should be field IDs."""
    _actions.append({"action": "update_record", "type_id": type_id, "record_id": record_id, "data": data})

def delete_record(type_id, record_id):
    """Queue a record deletion."""
    _actions.append({"action": "delete_record", "type_id": type_id, "record_id": record_id})

def log(msg):
    """Log a message (visible in automation run logs)."""
    print(f"__LOG__:{msg}")

def warn(msg):
    """Log a warning (visible in automation run logs)."""
    print(f"__WARN__:{msg}")

def error(msg):
    """Log an error (visible in automation run logs)."""
    print(f"__ERROR__:{msg}")
`.trim();
}

/**
 * Execute mutation actions returned by the sandbox code.
 * All actions are scoped to the automation's app.
 */
async function executeActions(
  actions: MutationAction[],
  automation: AutomationRow,
  event: RecordEvent | null,
) {
  for (const action of actions) {
    try {
      // Verify the type belongs to this automation's app
      const [type] = await db
        .select()
        .from(types)
        .where(and(eq(types.id, action.type_id), eq(types.appId, automation.appId)))
        .limit(1);

      if (!type) {
        console.error(`Automation ${automation.id}: type ${action.type_id} not found in app`);
        continue;
      }

      switch (action.action) {
        case 'create_record': {
          const [created] = await db
            .insert(records)
            .values({
              typeId: action.type_id,
              data: action.data,
              createdBy: automation.createdBy,
            })
            .returning();

          // Emit event with triggeredByAutomation flag to prevent re-entrancy
          emitRecordEvent({
            type: 'record_created',
            appId: automation.appId,
            typeId: action.type_id,
            recordId: created.id,
            record: created.data as Record<string, unknown>,
            userId: automation.createdBy,
            triggeredByAutomation: true,
          });
          break;
        }

        case 'update_record': {
          const [existing] = await db
            .select()
            .from(records)
            .where(and(eq(records.id, action.record_id), eq(records.typeId, action.type_id)))
            .limit(1);

          if (!existing) continue;

          const previousData = existing.data as Record<string, unknown>;
          const mergedData = { ...previousData, ...action.data };

          const [updated] = await db
            .update(records)
            .set({ data: mergedData, updatedAt: new Date() })
            .where(eq(records.id, action.record_id))
            .returning();

          emitRecordEvent({
            type: 'record_updated',
            appId: automation.appId,
            typeId: action.type_id,
            recordId: updated.id,
            record: updated.data as Record<string, unknown>,
            previousRecord: previousData,
            userId: automation.createdBy,
            triggeredByAutomation: true,
          });
          break;
        }

        case 'delete_record': {
          const [existing] = await db
            .select()
            .from(records)
            .where(and(eq(records.id, action.record_id), eq(records.typeId, action.type_id)))
            .limit(1);

          if (!existing) continue;

          await db.delete(records).where(eq(records.id, action.record_id));

          emitRecordEvent({
            type: 'record_deleted',
            appId: automation.appId,
            typeId: action.type_id,
            recordId: action.record_id,
            record: existing.data as Record<string, unknown>,
            userId: automation.createdBy,
            triggeredByAutomation: true,
          });
          break;
        }
      }
    } catch (err) {
      console.error(`Automation ${automation.id}: action failed:`, err);
    }
  }
}
