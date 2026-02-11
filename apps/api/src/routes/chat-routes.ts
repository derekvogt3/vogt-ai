import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';
import Anthropic from '@anthropic-ai/sdk';
import { env } from '../env.js';

const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

const chatRequestSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().min(1),
      })
    )
    .min(1),
});

export const chatRoutes = new Hono();

chatRoutes.post('/', async (c) => {
  const body = chatRequestSchema.parse(await c.req.json());

  return streamSSE(c, async (stream) => {
    try {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 4096,
        messages: body.messages,
        stream: true,
      });

      for await (const event of response) {
        if (
          event.type === 'content_block_delta' &&
          event.delta.type === 'text_delta'
        ) {
          await stream.writeSSE({
            data: JSON.stringify({ type: 'token', content: event.delta.text }),
          });
        }
      }

      await stream.writeSSE({
        data: JSON.stringify({ type: 'done' }),
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown error';
      await stream.writeSSE({
        data: JSON.stringify({ type: 'error', message }),
      });
    }
  });
});
