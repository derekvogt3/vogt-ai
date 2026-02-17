import Anthropic from '@anthropic-ai/sdk';
import { eq, and, asc, desc, sql } from 'drizzle-orm';
import { db } from '../db.js';
import { types, fields, records, automations } from '../schema.js';
import { emitRecordEvent } from '../events.js';

// ============ TOOL DEFINITIONS ============

export const aiTools: Anthropic.Tool[] = [
  {
    name: 'create_type',
    description:
      'Create a new type (data model) in the app. Types are like database tables — e.g., Contact, Company, Deal, Task.',
    input_schema: {
      type: 'object' as const,
      properties: {
        name: {
          type: 'string',
          description: 'Name of the type, e.g. "Contact", "Company"',
        },
        description: {
          type: 'string',
          description: 'Optional description of what this type represents',
        },
        icon: {
          type: 'string',
          description: 'Optional emoji icon, e.g. "👤", "🏢"',
        },
      },
      required: ['name'],
    },
  },
  {
    name: 'update_type',
    description: 'Update an existing type (rename, change description or icon).',
    input_schema: {
      type: 'object' as const,
      properties: {
        type_id: {
          type: 'string',
          description: 'UUID of the type to update',
        },
        name: { type: 'string', description: 'New name for the type' },
        description: { type: 'string', description: 'New description' },
        icon: { type: 'string', description: 'New emoji icon' },
      },
      required: ['type_id'],
    },
  },
  {
    name: 'delete_type',
    description:
      'Delete a type and all its fields and records. This is destructive — use with caution.',
    input_schema: {
      type: 'object' as const,
      properties: {
        type_id: {
          type: 'string',
          description: 'UUID of the type to delete',
        },
      },
      required: ['type_id'],
    },
  },
  {
    name: 'create_field',
    description:
      'Add a new field to a type. Supported field types: text, rich_text, number, boolean, date, select, multi_select, url, email, relation. For "select" and "multi_select", provide options in config.options array. For "relation", provide config.relatedTypeId with the UUID of the related type.',
    input_schema: {
      type: 'object' as const,
      properties: {
        type_id: {
          type: 'string',
          description: 'UUID of the type to add the field to',
        },
        name: {
          type: 'string',
          description: 'Field name, e.g. "Full Name", "Email", "Status"',
        },
        type: {
          type: 'string',
          enum: [
            'text',
            'rich_text',
            'number',
            'boolean',
            'date',
            'select',
            'multi_select',
            'url',
            'email',
            'relation',
          ],
          description: 'The field data type',
        },
        required: {
          type: 'boolean',
          description: 'Whether this field is required. Default: false',
        },
        config: {
          type: 'object',
          description:
            'Field configuration. For select/multi_select: { "options": ["Option1", "Option2"] }. For relation: { "relatedTypeId": "<uuid>" }.',
          properties: {
            options: {
              type: 'array',
              items: { type: 'string' },
              description: 'Options for select/multi_select fields',
            },
            relatedTypeId: {
              type: 'string',
              description: 'UUID of the related type for relation fields',
            },
          },
        },
      },
      required: ['type_id', 'name', 'type'],
    },
  },
  {
    name: 'update_field',
    description:
      'Update an existing field (rename, change config, toggle required).',
    input_schema: {
      type: 'object' as const,
      properties: {
        type_id: {
          type: 'string',
          description: 'UUID of the type containing the field',
        },
        field_id: {
          type: 'string',
          description: 'UUID of the field to update',
        },
        name: { type: 'string', description: 'New name for the field' },
        required: {
          type: 'boolean',
          description: 'Whether the field is required',
        },
        config: {
          type: 'object',
          description: 'Updated config object',
        },
      },
      required: ['type_id', 'field_id'],
    },
  },
  {
    name: 'delete_field',
    description:
      'Delete a field from a type. This removes the field definition.',
    input_schema: {
      type: 'object' as const,
      properties: {
        type_id: {
          type: 'string',
          description: 'UUID of the type containing the field',
        },
        field_id: {
          type: 'string',
          description: 'UUID of the field to delete',
        },
      },
      required: ['type_id', 'field_id'],
    },
  },
  {
    name: 'create_record',
    description:
      'Create a new record (row) in a type. The data object maps field IDs to values.',
    input_schema: {
      type: 'object' as const,
      properties: {
        type_id: {
          type: 'string',
          description: 'UUID of the type to create the record in',
        },
        data: {
          type: 'object',
          description:
            'Record data as { fieldId: value } pairs. Text fields take strings, number fields take numbers, boolean fields take true/false, date fields take "YYYY-MM-DD" strings, select takes a string matching one of the options, multi_select takes an array of strings, relation takes a record UUID.',
        },
      },
      required: ['type_id', 'data'],
    },
  },
  {
    name: 'list_records',
    description: 'List records in a type. Returns paginated results.',
    input_schema: {
      type: 'object' as const,
      properties: {
        type_id: {
          type: 'string',
          description: 'UUID of the type whose records to list',
        },
        page: { type: 'number', description: 'Page number (default: 1)' },
        page_size: {
          type: 'number',
          description: 'Results per page (default: 20, max: 100)',
        },
      },
      required: ['type_id'],
    },
  },
  {
    name: 'create_automation',
    description: `Create a data automation that runs Python code in a secure sandbox when records are created, updated, or deleted, or when manually triggered.

The Python code runs in an isolated environment with these globals:
- ctx: dict with event info
  - ctx["type"]: "record_created" | "record_updated" | "record_deleted" | "manual"
  - ctx["record"]: dict of triggering record data (field_id → value)
  - ctx["record_id"]: UUID string of the triggering record
  - ctx["previous_record"]: dict of data before update (only for record_updated, else None)
- field_map: dict mapping field IDs ↔ field names
- pd: pandas is pre-imported
- Helper functions:
  - create_record(type_id, data): queue a new record (data is {field_id: value})
  - update_record(type_id, record_id, data): queue a record update
  - delete_record(type_id, record_id): queue a record deletion
  - log(msg), warn(msg), error(msg): logging (visible in run history)

Write plain Python script body. Reference field IDs (UUIDs), not names.`,
    input_schema: {
      type: 'object' as const,
      properties: {
        name: {
          type: 'string',
          description: 'Human-readable name for the automation',
        },
        description: {
          type: 'string',
          description: 'What this automation does',
        },
        type_id: {
          type: 'string',
          description: 'UUID of the type this automation triggers on',
        },
        trigger: {
          type: 'string',
          enum: ['record_created', 'record_updated', 'record_deleted', 'manual'],
          description: 'When this automation should trigger',
        },
        code: {
          type: 'string',
          description:
            'Python code to execute. Has access to ctx, field_map, pd, create_record(), update_record(), delete_record(), log().',
        },
      },
      required: ['name', 'type_id', 'trigger', 'code'],
    },
  },
  {
    name: 'list_automations',
    description: 'List automations in the app, optionally filtered by type.',
    input_schema: {
      type: 'object' as const,
      properties: {
        type_id: {
          type: 'string',
          description: 'Optional UUID of a type to filter automations by',
        },
      },
      required: [],
    },
  },
];

// ============ TOOL EXECUTOR ============

export type ToolContext = {
  appId: string;
  userId: string;
};

export type ToolResult = {
  success: boolean;
  result?: unknown;
  error?: string;
};

export async function executeTool(
  toolName: string,
  input: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolResult> {
  try {
    switch (toolName) {
      case 'create_type': {
        const existing = await db
          .select()
          .from(types)
          .where(eq(types.appId, ctx.appId));
        const position = existing.length;

        const [type] = await db
          .insert(types)
          .values({
            name: input.name as string,
            description: (input.description as string) ?? null,
            icon: (input.icon as string) ?? null,
            appId: ctx.appId,
            position,
          })
          .returning();

        return { success: true, result: type };
      }

      case 'update_type': {
        const updateData: Record<string, unknown> = { updatedAt: new Date() };
        if (input.name) updateData.name = input.name;
        if (input.description !== undefined)
          updateData.description = input.description;
        if (input.icon !== undefined) updateData.icon = input.icon;

        const [updated] = await db
          .update(types)
          .set(updateData)
          .where(
            and(
              eq(types.id, input.type_id as string),
              eq(types.appId, ctx.appId),
            ),
          )
          .returning();

        if (!updated) return { success: false, error: 'Type not found' };
        return { success: true, result: updated };
      }

      case 'delete_type': {
        const [existing] = await db
          .select()
          .from(types)
          .where(
            and(
              eq(types.id, input.type_id as string),
              eq(types.appId, ctx.appId),
            ),
          )
          .limit(1);

        if (!existing) return { success: false, error: 'Type not found' };

        await db.delete(types).where(eq(types.id, input.type_id as string));
        return { success: true, result: { deleted: existing.name } };
      }

      case 'create_field': {
        // Verify type belongs to app
        const [type] = await db
          .select()
          .from(types)
          .where(
            and(
              eq(types.id, input.type_id as string),
              eq(types.appId, ctx.appId),
            ),
          )
          .limit(1);

        if (!type) return { success: false, error: 'Type not found' };

        const existingFields = await db
          .select()
          .from(fields)
          .where(eq(fields.typeId, input.type_id as string));
        const position = existingFields.length;

        const [field] = await db
          .insert(fields)
          .values({
            typeId: input.type_id as string,
            name: input.name as string,
            type: input.type as string,
            required: (input.required as boolean) ?? false,
            config: (input.config as Record<string, unknown>) ?? {},
            position,
          })
          .returning();

        return { success: true, result: field };
      }

      case 'update_field': {
        // Verify type belongs to app
        const [type] = await db
          .select()
          .from(types)
          .where(
            and(
              eq(types.id, input.type_id as string),
              eq(types.appId, ctx.appId),
            ),
          )
          .limit(1);

        if (!type) return { success: false, error: 'Type not found' };

        const updateData: Record<string, unknown> = {};
        if (input.name) updateData.name = input.name;
        if (input.required !== undefined) updateData.required = input.required;
        if (input.config) updateData.config = input.config;

        const [updated] = await db
          .update(fields)
          .set(updateData)
          .where(
            and(
              eq(fields.id, input.field_id as string),
              eq(fields.typeId, input.type_id as string),
            ),
          )
          .returning();

        if (!updated) return { success: false, error: 'Field not found' };
        return { success: true, result: updated };
      }

      case 'delete_field': {
        // Verify type belongs to app
        const [type] = await db
          .select()
          .from(types)
          .where(
            and(
              eq(types.id, input.type_id as string),
              eq(types.appId, ctx.appId),
            ),
          )
          .limit(1);

        if (!type) return { success: false, error: 'Type not found' };

        const [existing] = await db
          .select()
          .from(fields)
          .where(
            and(
              eq(fields.id, input.field_id as string),
              eq(fields.typeId, input.type_id as string),
            ),
          )
          .limit(1);

        if (!existing) return { success: false, error: 'Field not found' };

        await db
          .delete(fields)
          .where(eq(fields.id, input.field_id as string));
        return { success: true, result: { deleted: existing.name } };
      }

      case 'create_record': {
        // Verify type belongs to app
        const [type] = await db
          .select()
          .from(types)
          .where(
            and(
              eq(types.id, input.type_id as string),
              eq(types.appId, ctx.appId),
            ),
          )
          .limit(1);

        if (!type) return { success: false, error: 'Type not found' };

        const [record] = await db
          .insert(records)
          .values({
            typeId: input.type_id as string,
            data: (input.data as Record<string, unknown>) ?? {},
            createdBy: ctx.userId,
          })
          .returning();

        emitRecordEvent({
          type: 'record_created',
          appId: ctx.appId,
          typeId: type.id,
          recordId: record.id,
          record: record.data as Record<string, unknown>,
          userId: ctx.userId,
        });

        return { success: true, result: record };
      }

      case 'list_records': {
        // Verify type belongs to app
        const [type] = await db
          .select()
          .from(types)
          .where(
            and(
              eq(types.id, input.type_id as string),
              eq(types.appId, ctx.appId),
            ),
          )
          .limit(1);

        if (!type) return { success: false, error: 'Type not found' };

        const page = (input.page as number) ?? 1;
        const pageSize = Math.min((input.page_size as number) ?? 20, 100);
        const offset = (page - 1) * pageSize;

        const [countResult] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(records)
          .where(eq(records.typeId, input.type_id as string));

        const result = await db
          .select()
          .from(records)
          .where(eq(records.typeId, input.type_id as string))
          .orderBy(desc(records.createdAt))
          .limit(pageSize)
          .offset(offset);

        return {
          success: true,
          result: {
            records: result,
            total: countResult.count,
            page,
            pageSize,
          },
        };
      }

      case 'create_automation': {
        // Verify type belongs to app
        const [type] = await db
          .select()
          .from(types)
          .where(
            and(
              eq(types.id, input.type_id as string),
              eq(types.appId, ctx.appId),
            ),
          )
          .limit(1);

        if (!type) return { success: false, error: 'Type not found' };

        const [automation] = await db
          .insert(automations)
          .values({
            appId: ctx.appId,
            typeId: input.type_id as string,
            name: input.name as string,
            description: (input.description as string) ?? null,
            trigger: input.trigger as string,
            code: input.code as string,
            createdBy: ctx.userId,
          })
          .returning();

        return { success: true, result: automation };
      }

      case 'list_automations': {
        const conditions = [eq(automations.appId, ctx.appId)];
        if (input.type_id) {
          conditions.push(eq(automations.typeId, input.type_id as string));
        }

        const result = await db
          .select()
          .from(automations)
          .where(and(...conditions))
          .orderBy(desc(automations.createdAt));

        return { success: true, result };
      }

      default:
        return { success: false, error: `Unknown tool: ${toolName}` };
    }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Tool execution failed',
    };
  }
}
