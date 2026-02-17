import { Hono } from 'hono';
import { z } from 'zod';
import Anthropic from '@anthropic-ai/sdk';
import { eq, and, asc } from 'drizzle-orm';
import { env } from '../env.js';
import { db } from '../db.js';
import { types, fields } from '../schema.js';
import { getUserId, getAppForUser } from './route-helpers.js';
import { buildSchemaContext } from './ai-system-prompt.js';

export const aiGenerateRoutes = new Hono();

// ============ GENERATE AUTOMATION ============

const generateAutomationSchema = z.object({
  prompt: z.string().min(1),
  typeId: z.string().uuid(),
});

const proposeAutomationTool: Anthropic.Tool = {
  name: 'propose_automation',
  description: 'Propose an automation configuration based on the user\'s request.',
  input_schema: {
    type: 'object' as const,
    properties: {
      name: {
        type: 'string',
        description: 'Human-readable name for the automation',
      },
      trigger: {
        type: 'string',
        enum: ['record_created', 'record_updated', 'record_deleted', 'manual'],
        description: 'When this automation should trigger',
      },
      description: {
        type: 'string',
        description: 'Brief description of what this automation does',
      },
      code: {
        type: 'string',
        description: 'Python code to execute in the sandbox',
      },
      explanation: {
        type: 'string',
        description: 'Brief explanation of how the code works, for the user to review',
      },
    },
    required: ['name', 'trigger', 'description', 'code', 'explanation'],
  },
};

aiGenerateRoutes.post('/:appId/generate-automation', async (c) => {
  const userId = getUserId(c);
  const app = await getAppForUser(c.req.param('appId'), userId);
  const body = generateAutomationSchema.parse(await c.req.json());

  const schemaContext = await buildSchemaContext(app.id);

  const systemPrompt = `You are an AI that generates data automations. You work within an app-building platform.

${schemaContext}

The user wants to create an automation for type ID: ${body.typeId}

Automation sandbox environment:
- ctx["type"]: "record_created" | "record_updated" | "record_deleted" | "manual"
- ctx["record"]: dict of triggering record data (field_id → value)
- ctx["record_id"]: UUID string of the triggering record
- ctx["previous_record"]: dict of data before update (only for record_updated, else None)
- field_map: dict mapping field IDs ↔ field names
- pd: pandas is pre-imported
- Helpers: create_record(type_id, data), update_record(type_id, record_id, data), delete_record(type_id, record_id), log(msg), warn(msg), error(msg)

Rules:
- The code MUST reference field IDs (UUIDs from the schema above), NOT field names.
- Write clean, readable Python with comments.
- Always log key actions with log() so users can debug from run history.
- Call propose_automation exactly once with your recommendation.`;

  const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 4096,
    system: systemPrompt,
    tools: [proposeAutomationTool],
    tool_choice: { type: 'tool', name: 'propose_automation' },
    messages: [{ role: 'user', content: body.prompt }],
  });

  // Extract the tool use block
  const toolBlock = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
  );

  if (!toolBlock) {
    return c.json({ error: 'AI failed to generate automation proposal' }, 500);
  }

  const proposal = toolBlock.input as {
    name: string;
    trigger: string;
    description: string;
    code: string;
    explanation: string;
  };

  return c.json({ automation: proposal });
});

// ============ GENERATE SCHEMA ============

const generateSchemaSchema = z.object({
  prompt: z.string().min(1),
});

const proposeSchemaTool: Anthropic.Tool = {
  name: 'propose_schema',
  description: 'Propose a data model schema based on the user\'s request.',
  input_schema: {
    type: 'object' as const,
    properties: {
      types: {
        type: 'array',
        description: 'Array of types (data models) to create',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Type name, e.g. "Contact"' },
            description: { type: 'string', description: 'What this type represents' },
            icon: { type: 'string', description: 'Emoji icon, e.g. "👤"' },
            fields: {
              type: 'array',
              description: 'Fields for this type',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string', description: 'Field name' },
                  type: {
                    type: 'string',
                    enum: [
                      'text', 'rich_text', 'number', 'boolean', 'date',
                      'select', 'multi_select', 'url', 'email', 'relation',
                    ],
                    description: 'Field data type',
                  },
                  required: { type: 'boolean', description: 'Whether the field is required' },
                  config: {
                    type: 'object',
                    description: 'For select/multi_select: { "options": [...] }. For relation: { "relatedTypeName": "TypeName" }.',
                    properties: {
                      options: {
                        type: 'array',
                        items: { type: 'string' },
                        description: 'Options for select/multi_select fields',
                      },
                      relatedTypeName: {
                        type: 'string',
                        description: 'Name of the related type (will be resolved to ID during creation)',
                      },
                    },
                  },
                },
                required: ['name', 'type', 'required'],
              },
            },
          },
          required: ['name', 'description', 'icon', 'fields'],
        },
      },
    },
    required: ['types'],
  },
};

aiGenerateRoutes.post('/:appId/generate-schema', async (c) => {
  const userId = getUserId(c);
  const app = await getAppForUser(c.req.param('appId'), userId);
  const body = generateSchemaSchema.parse(await c.req.json());

  const schemaContext = await buildSchemaContext(app.id);

  const systemPrompt = `You are an AI that designs data models for applications. You work within an app-building platform.

${schemaContext}

Design a data model based on the user's request. Use appropriate field types:
- email for email addresses, url for URLs
- select for status/category dropdowns (provide sensible options)
- boolean for yes/no flags, date for dates, number for quantities/amounts
- relation for links between types (use relatedTypeName to reference other types in your proposal)
- Set fields as required when they represent essential data (e.g., a Contact's name)

Give types descriptive names, emoji icons, and clear descriptions.
Call propose_schema exactly once with your recommendation.`;

  const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 4096,
    system: systemPrompt,
    tools: [proposeSchemaTool],
    tool_choice: { type: 'tool', name: 'propose_schema' },
    messages: [{ role: 'user', content: body.prompt }],
  });

  const toolBlock = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
  );

  if (!toolBlock) {
    return c.json({ error: 'AI failed to generate schema proposal' }, 500);
  }

  const proposal = toolBlock.input as {
    types: Array<{
      name: string;
      description: string;
      icon: string;
      fields: Array<{
        name: string;
        type: string;
        required: boolean;
        config?: Record<string, unknown>;
      }>;
    }>;
  };

  return c.json({ schema: proposal });
});

// ============ EXECUTE SCHEMA ============

const fieldTypeEnum = z.enum([
  'text', 'rich_text', 'number', 'boolean', 'date',
  'select', 'multi_select', 'url', 'email', 'relation',
]);

const executeSchemaSchema = z.object({
  types: z.array(
    z.object({
      name: z.string().min(1),
      description: z.string().default(''),
      icon: z.string().default('📋'),
      fields: z.array(
        z.object({
          name: z.string().min(1),
          type: fieldTypeEnum,
          required: z.boolean().default(false),
          config: z.record(z.unknown()).optional(),
        }),
      ),
    }),
  ),
});

aiGenerateRoutes.post('/:appId/execute-schema', async (c) => {
  const userId = getUserId(c);
  const app = await getAppForUser(c.req.param('appId'), userId);
  const body = executeSchemaSchema.parse(await c.req.json());

  // Get current type count for positioning
  const existingTypes = await db
    .select()
    .from(types)
    .where(eq(types.appId, app.id));
  let typePosition = existingTypes.length;

  // Phase 1: Create all types first (so we can resolve relation references)
  const createdTypes: Array<typeof types.$inferSelect> = [];
  const nameToIdMap: Record<string, string> = {};

  for (const typeDef of body.types) {
    const [created] = await db
      .insert(types)
      .values({
        name: typeDef.name,
        description: typeDef.description || null,
        icon: typeDef.icon || null,
        appId: app.id,
        position: typePosition++,
      })
      .returning();

    createdTypes.push(created);
    nameToIdMap[typeDef.name] = created.id;
  }

  // Phase 2: Create fields for each type, resolving relatedTypeName → actual ID
  for (let i = 0; i < body.types.length; i++) {
    const typeDef = body.types[i];
    const createdType = createdTypes[i];

    for (let fieldPos = 0; fieldPos < typeDef.fields.length; fieldPos++) {
      const fieldDef = typeDef.fields[fieldPos];

      // Resolve relation config
      let config = fieldDef.config ?? {};
      if (fieldDef.type === 'relation' && config.relatedTypeName) {
        const relatedId = nameToIdMap[config.relatedTypeName as string];
        if (relatedId) {
          config = { relatedTypeId: relatedId };
        } else {
          // Skip relation fields that reference unknown types
          continue;
        }
      }

      await db.insert(fields).values({
        typeId: createdType.id,
        name: fieldDef.name,
        type: fieldDef.type,
        required: fieldDef.required,
        config,
        position: fieldPos,
      });
    }
  }

  return c.json({
    types: createdTypes.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      icon: t.icon,
      appId: t.appId,
      position: t.position,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    })),
  });
});
