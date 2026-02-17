import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';
import Anthropic from '@anthropic-ai/sdk';
import { eq, asc } from 'drizzle-orm';
import { env } from '../env.js';
import { db } from '../db.js';
import { types, fields } from '../schema.js';
import { getUserId, getAppForUser } from './route-helpers.js';
import { aiTools, executeTool } from './ai-tools.js';

const chatSchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(['user', 'assistant']),
      content: z.string().min(1),
    }),
  ),
});

// ============ SYSTEM PROMPT BUILDER ============

async function buildSystemPrompt(appId: string): Promise<string> {
  const appTypes = await db
    .select()
    .from(types)
    .where(eq(types.appId, appId))
    .orderBy(asc(types.position));

  const typeFieldsMap: Record<string, (typeof fields.$inferSelect)[]> = {};
  for (const type of appTypes) {
    const typeFields = await db
      .select()
      .from(fields)
      .where(eq(fields.typeId, type.id))
      .orderBy(asc(fields.position));
    typeFieldsMap[type.id] = typeFields;
  }

  let schemaDescription: string;
  if (appTypes.length === 0) {
    schemaDescription =
      'This app currently has no types defined. It is a blank slate.';
  } else {
    schemaDescription = 'Current app schema:\n';
    for (const type of appTypes) {
      schemaDescription += `\nType: "${type.name}" (id: ${type.id})`;
      if (type.description) schemaDescription += ` — ${type.description}`;
      schemaDescription += '\n';

      const tf = typeFieldsMap[type.id] || [];
      if (tf.length === 0) {
        schemaDescription += '  Fields: none\n';
      } else {
        for (const f of tf) {
          schemaDescription += `  - "${f.name}" (id: ${f.id}, type: ${f.type}`;
          if (f.required) schemaDescription += ', required';
          if (f.type === 'relation') {
            const relatedTypeId = (f.config as Record<string, unknown>)
              ?.relatedTypeId as string | undefined;
            const relatedType = appTypes.find((t) => t.id === relatedTypeId);
            if (relatedType)
              schemaDescription += `, relates to "${relatedType.name}"`;
          }
          if (f.type === 'select' || f.type === 'multi_select') {
            const options = (f.config as Record<string, unknown>)?.options as
              | string[]
              | undefined;
            if (options?.length)
              schemaDescription += `, options: [${options.join(', ')}]`;
          }
          schemaDescription += ')\n';
        }
      }
    }
  }

  return `You are an AI schema assistant that helps users design data models for their applications. You work within an app-building platform.

${schemaDescription}

Your capabilities:
- Create, update, and delete types (data models like Contact, Company, Deal)
- Create, update, and delete fields on types (text, number, boolean, date, select, multi_select, url, email, relation)
- Create records (rows of data) in types
- List records in a type

Guidelines:
- When the user asks you to create a data model (e.g. "build me a CRM"), create types and their fields systematically.
- For relation fields, you MUST first create both types, then add the relation field referencing the target type's ID from the tool result.
- Use appropriate field types: email fields for emails, url for URLs, select for status/category dropdowns, boolean for yes/no flags, date for dates, number for quantities/amounts.
- Always give types and fields clear, descriptive names.
- Set fields as required when they represent essential data (e.g., a Contact's name).
- For select fields, provide sensible default options.
- After making changes, briefly summarize what you created so the user knows what happened.
- Be conversational but efficient. Execute tools to accomplish the user's request.`;
}

// ============ CHAT ROUTE ============

export const aiRoutes = new Hono();

const MAX_ITERATIONS = 25;

aiRoutes.post('/:appId/chat', async (c) => {
  const userId = getUserId(c);
  const app = await getAppForUser(c.req.param('appId'), userId);
  const body = chatSchema.parse(await c.req.json());

  const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const systemPrompt = await buildSystemPrompt(app.id);

  return streamSSE(c, async (stream) => {
    let eventId = 0;

    // Convert simple messages to Anthropic format
    let messages: Anthropic.MessageParam[] = body.messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    try {
      // Agentic loop — keeps running until Claude gives a final response with no tool calls
      for (let i = 0; i < MAX_ITERATIONS; i++) {
        const response = await anthropic.messages.create({
          model: 'claude-sonnet-4-5-20250929',
          max_tokens: 4096,
          system: systemPrompt,
          tools: aiTools,
          messages,
        });

        // Process each content block
        const toolUseBlocks: Anthropic.ToolUseBlock[] = [];

        for (const block of response.content) {
          if (block.type === 'text') {
            await stream.writeSSE({
              event: 'text_delta',
              data: JSON.stringify({ text: block.text }),
              id: String(eventId++),
            });
          } else if (block.type === 'tool_use') {
            toolUseBlocks.push(block);

            await stream.writeSSE({
              event: 'tool_use_start',
              data: JSON.stringify({
                tool_use_id: block.id,
                name: block.name,
                input: block.input,
              }),
              id: String(eventId++),
            });
          }
        }

        // If no tool calls or end_turn, we're done
        if (toolUseBlocks.length === 0 || response.stop_reason === 'end_turn') {
          break;
        }

        // Execute each tool and collect results
        const toolResults: Anthropic.ToolResultBlockParam[] = [];

        for (const toolBlock of toolUseBlocks) {
          const result = await executeTool(
            toolBlock.name,
            toolBlock.input as Record<string, unknown>,
            { appId: app.id, userId },
          );

          await stream.writeSSE({
            event: 'tool_result',
            data: JSON.stringify({
              tool_use_id: toolBlock.id,
              name: toolBlock.name,
              ...result,
            }),
            id: String(eventId++),
          });

          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolBlock.id,
            content: JSON.stringify(result),
          });
        }

        // Append assistant response + tool results for next iteration
        messages = [
          ...messages,
          { role: 'assistant', content: response.content },
          { role: 'user', content: toolResults },
        ];
      }
    } catch (err) {
      await stream.writeSSE({
        event: 'error',
        data: JSON.stringify({
          error: err instanceof Error ? err.message : 'An error occurred',
        }),
        id: String(eventId++),
      });
    }

    // Signal stream complete
    await stream.writeSSE({
      event: 'message_done',
      data: JSON.stringify({}),
      id: String(eventId++),
    });
  });
});
