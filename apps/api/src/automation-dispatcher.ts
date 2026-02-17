import { eq, and } from 'drizzle-orm';
import { db } from './db.js';
import { automations } from './schema.js';
import { appEvents, type RecordEvent } from './events.js';
import { runAutomation } from './automation-runner.js';

/**
 * Start listening for record events and dispatching matching automations.
 * Call once from index.ts at server startup.
 */
export function startAutomationDispatcher() {
  appEvents.on('record_event', async (event: RecordEvent) => {
    // Skip events triggered by automations to prevent infinite loops
    if (event.triggeredByAutomation) return;

    try {
      // Map event type to trigger name
      const trigger = event.type; // 'record_created' | 'record_updated' | 'record_deleted'

      // Find matching enabled automations for this app + type + trigger
      const matching = await db
        .select()
        .from(automations)
        .where(
          and(
            eq(automations.appId, event.appId),
            eq(automations.typeId, event.typeId),
            eq(automations.trigger, trigger),
            eq(automations.enabled, true),
          ),
        );

      // Run each matching automation (fire-and-forget)
      for (const automation of matching) {
        runAutomation(automation, event).catch((err) => {
          console.error(`Automation dispatcher: failed to run automation ${automation.id}:`, err);
        });
      }
    } catch (err) {
      console.error('Automation dispatcher: error finding automations:', err);
    }
  });

  console.log('Automation dispatcher started');
}
