import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { jwt } from 'hono/jwt';
import { serveStatic } from '@hono/node-server/serve-static';
import { serve } from '@hono/node-server';
import { HTTPException } from 'hono/http-exception';
import { ZodError } from 'zod';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { env } from './env.js';
import { db } from './db.js';

import { authRoutes } from './routes/auth-routes.js';
import { appRoutes } from './routes/app-routes.js';
import { recordRoutes } from './routes/record-routes.js';
import { aiRoutes } from './routes/ai-routes.js';
import { pageRoutes } from './routes/page-routes.js';
import { automationRoutes } from './routes/automation-routes.js';
import { aiGenerateRoutes } from './routes/ai-generate-routes.js';
import { startAutomationDispatcher } from './automation-dispatcher.js';

const app = new Hono();

// CORS (credentials: true required for cookies in cross-origin dev)
app.use('/api/*', cors({ origin: env.CORS_ORIGIN, credentials: true }));

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

// JWT middleware — protect ALL /api/* by default, skip only public whitelist
const PUBLIC_PATHS = new Set([
  '/api/health',
  '/api/auth/register',
  '/api/auth/login',
  '/api/auth/logout',
]);

app.use('/api/*', async (c, next) => {
  if (PUBLIC_PATHS.has(c.req.path)) {
    return next();
  }
  const jwtMiddleware = jwt({
    secret: env.JWT_SECRET,
    alg: 'HS256',
    cookie: 'auth_token',
  });
  return jwtMiddleware(c, next);
});

// Routes (all protected by default — only PUBLIC_PATHS above are exempt)
app.get('/api/health', (c) => c.json({ status: 'ok' }));
app.route('/api/auth', authRoutes);
app.route('/api/apps', appRoutes);
app.route('/api/apps', recordRoutes);
app.route('/api/apps', aiRoutes);
app.route('/api/apps', pageRoutes);
app.route('/api/apps', automationRoutes);
app.route('/api/apps', aiGenerateRoutes);

// React SPA at /app/*
app.use(
  '/app/*',
  serveStatic({
    root: './static/app',
    rewriteRequestPath: (path) => path.replace(/^\/app/, ''),
  })
);
app.get('/app/*', serveStatic({ root: './static/app', path: 'index.html' }));
app.get('/app', serveStatic({ root: './static/app', path: 'index.html' }));

// Marketing site at / (catch-all, after API and /app routes)
app.use('*', serveStatic({ root: './static/marketing' }));
app.get('*', serveStatic({ root: './static/marketing', path: 'index.html' }));

// Run migrations and start server
await migrate(db, { migrationsFolder: './drizzle' });

// Start automation event dispatcher
startAutomationDispatcher();

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`Server running on http://localhost:${info.port}`);
});

export { app };
