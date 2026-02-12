import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import { jwt } from 'hono/jwt';
import { HTTPException } from 'hono/http-exception';
import { ZodError } from 'zod';

const TEST_JWT_SECRET = 'test-secret-key-that-is-at-least-32-characters';

// Mock env module
vi.mock('../env.js', () => ({
  env: {
    ANTHROPIC_API_KEY: 'test-key',
    DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
    JWT_SECRET: TEST_JWT_SECRET,
    CORS_ORIGIN: 'http://localhost:5173',
    PORT: 3000,
  },
}));

// Mock Anthropic SDK to avoid real API calls
vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = {
      create: vi.fn().mockReturnValue({
        async *[Symbol.asyncIterator]() {
          yield {
            type: 'content_block_delta',
            delta: { type: 'text_delta', text: 'Hello' },
          };
        },
      }),
    };
  },
}));

const { chatRoutes } = await import('./chat-routes.js');

// Mirrors the global auth middleware from index.ts — protect-by-default
const PUBLIC_PATHS = new Set([
  '/api/health',
  '/api/auth/register',
  '/api/auth/login',
  '/api/auth/logout',
]);

function createApp() {
  const app = new Hono();

  app.onError((err, c) => {
    if (err instanceof HTTPException) {
      return c.json({ error: err.message }, err.status);
    }
    if (err instanceof ZodError) {
      return c.json({ error: 'Validation error', details: err.flatten() }, 400);
    }
    return c.json({ error: 'Internal server error' }, 500);
  });

  // Global JWT middleware — same pattern as index.ts
  app.use('/api/*', async (c, next) => {
    if (PUBLIC_PATHS.has(c.req.path)) {
      return next();
    }
    const jwtMiddleware = jwt({
      secret: TEST_JWT_SECRET,
      alg: 'HS256',
      cookie: 'auth_token',
    });
    return jwtMiddleware(c, next);
  });

  app.route('/api/chat', chatRoutes);

  return app;
}

describe('POST /api/chat (auth protection)', () => {
  it('returns 401 without auth token', async () => {
    const app = createApp();

    const res = await app.request(
      new Request('http://localhost/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'hello' }],
        }),
      })
    );

    expect(res.status).toBe(401);
  });

  it('allows access with valid auth token', async () => {
    const app = createApp();
    const { sign } = await import('hono/jwt');

    const now = Math.floor(Date.now() / 1000);
    const token = await sign(
      { sub: 'user-id', email: 'test@example.com', iat: now, exp: now + 3600 },
      TEST_JWT_SECRET,
      'HS256'
    );

    const res = await app.request(
      new Request('http://localhost/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `auth_token=${token}`,
        },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'hello' }],
        }),
      })
    );

    // Should succeed (200) — the SSE response starts streaming
    expect(res.status).toBe(200);
  });
});
