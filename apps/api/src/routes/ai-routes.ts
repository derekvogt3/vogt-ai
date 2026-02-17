import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';
import Anthropic from '@anthropic-ai/sdk';
import { env } from '../env.js';
import { getUserId, getAppForUser } from './route-helpers.js';
import { aiTools, executeTool } from './ai-tools.js';
import { buildSystemPrompt } from './ai-system-prompt.js';

const chatSchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(['user', 'assistant']),
      content: z.string().min(1),
    }),
  ),
});

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
