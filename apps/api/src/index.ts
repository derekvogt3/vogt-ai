import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import { HTTPException } from 'hono/http-exception';
import { ZodError } from 'zod';
import { env } from './env.js';
import { chatRoutes } from './routes/chat-routes.js';

const app = new Hono();

// CORS
app.use('*', cors({ origin: env.CORS_ORIGIN }));

// Global error handler
app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return c.json({ error: err.message }, err.status);
  }
  if (err instanceof ZodError) {
    return c.json({ error: 'Validation error', details: err.flatten() }, 400);
  }
  console.error('Unhandled error:', err);
  return c.json({ error: 'Internal server error' }, 500);
});

// Routes
app.get('/api/health', (c) => c.json({ status: 'ok' }));
app.route('/api/chat', chatRoutes);

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`API running on http://localhost:${info.port}`);
});
