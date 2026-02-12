import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serveStatic } from '@hono/node-server/serve-static';
import { serve } from '@hono/node-server';
import { HTTPException } from 'hono/http-exception';
import { ZodError } from 'zod';
import { env } from './env.js';
import { chatRoutes } from './routes/chat-routes.js';

const app = new Hono();

// CORS (for local dev where frontend runs on a different port)
app.use('/api/*', cors({ origin: env.CORS_ORIGIN }));

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

// API Routes
app.get('/api/health', (c) => c.json({ status: 'ok' }));
app.route('/api/chat', chatRoutes);

// Serve static frontend files (production: built React app copied to ./static)
app.use('*', serveStatic({ root: './static' }));

// SPA fallback: serve index.html for any non-API, non-static route
app.get('*', serveStatic({ root: './static', path: 'index.html' }));

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`Server running on http://localhost:${info.port}`);
});
