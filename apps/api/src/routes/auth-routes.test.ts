import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { jwt } from 'hono/jwt';
import { HTTPException } from 'hono/http-exception';
import { ZodError } from 'zod';

const TEST_JWT_SECRET = 'test-secret-key-that-is-at-least-32-characters';

// Queue to control what db queries return
let selectResults: any[][] = [];
let insertResults: any[][] = [];
let updateResults: any[][] = [];

vi.mock('../env.js', () => ({
  env: {
    DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
    JWT_SECRET: TEST_JWT_SECRET,
    CORS_ORIGIN: 'http://localhost:5173',
    PORT: 3000,
  },
}));

vi.mock('../db.js', () => {
  function chainSelect() {
    return {
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve(selectResults.shift() ?? []),
        }),
      }),
    };
  }
  function chainInsert() {
    return {
      values: () => ({
        returning: () => Promise.resolve(insertResults.shift() ?? []),
      }),
    };
  }
  function chainUpdate() {
    return {
      set: () => ({
        where: () => Promise.resolve(updateResults.shift() ?? []),
      }),
    };
  }
  return {
    db: {
      select: chainSelect,
      insert: chainInsert,
      update: chainUpdate,
    },
  };
});

const { authRoutes } = await import('./auth-routes.js');

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

  app.route('/api/auth', authRoutes);
  return app;
}

function post(path: string, body: any, cookie?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (cookie) headers['Cookie'] = cookie;
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

describe('POST /api/auth/register', () => {
  beforeEach(() => {
    selectResults = [];
    insertResults = [];
    updateResults = [];
  });

  it('returns 201 and sets auth cookie on successful registration with invite code', async () => {
    const app = createApp();
    // 1st select: find invite code (valid, unused)
    selectResults.push([{
      id: 'invite-id',
      code: 'TESTCODE',
      createdBy: 'admin-id',
      usedBy: null,
      expiresAt: null,
      createdAt: new Date(),
    }]);
    // 2nd select: check existing user (none)
    selectResults.push([]);
    // insert: create user
    insertResults.push([{
      id: '123e4567-e89b-12d3-a456-426614174000',
      email: 'test@example.com',
      role: 'user',
    }]);
    // update: mark invite code as used
    updateResults.push([]);

    const res = await app.request(
      post('/api/auth/register', {
        email: 'test@example.com',
        password: 'password123',
        inviteCode: 'TESTCODE',
      })
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.user.email).toBe('test@example.com');
    expect(body.user.id).toBeDefined();
    expect(body.user.role).toBe('user');

    const setCookie = res.headers.get('set-cookie');
    expect(setCookie).toContain('auth_token=');
    expect(setCookie).toContain('HttpOnly');
  });

  it('returns 400 when invite code is missing', async () => {
    const app = createApp();
    const res = await app.request(
      post('/api/auth/register', { email: 'test@example.com', password: 'password123' })
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when invite code is invalid', async () => {
    const app = createApp();
    // 1st select: invite code not found
    selectResults.push([]);

    const res = await app.request(
      post('/api/auth/register', {
        email: 'test@example.com',
        password: 'password123',
        inviteCode: 'BADCODE',
      })
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Invalid or already used invite code');
  });

  it('returns 409 when email already exists', async () => {
    const app = createApp();
    // 1st select: valid invite code
    selectResults.push([{
      id: 'invite-id',
      code: 'TESTCODE',
      createdBy: 'admin-id',
      usedBy: null,
      expiresAt: null,
      createdAt: new Date(),
    }]);
    // 2nd select: user already exists
    selectResults.push([{ id: 'existing-id' }]);

    const res = await app.request(
      post('/api/auth/register', {
        email: 'existing@example.com',
        password: 'password123',
        inviteCode: 'TESTCODE',
      })
    );

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('Email already registered');
  });

  it('returns 400 for invalid email', async () => {
    const app = createApp();
    const res = await app.request(
      post('/api/auth/register', { email: 'not-an-email', password: 'password123', inviteCode: 'TESTCODE' })
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 for short password', async () => {
    const app = createApp();
    const res = await app.request(
      post('/api/auth/register', { email: 'test@example.com', password: 'short', inviteCode: 'TESTCODE' })
    );
    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/login', () => {
  beforeEach(() => {
    selectResults = [];
    insertResults = [];
  });

  it('returns 200 and sets auth cookie on successful login', async () => {
    const app = createApp();
    const bcrypt = await import('bcryptjs');
    const hash = await bcrypt.default.hash('password123', 4);

    selectResults.push([{
      id: '123e4567-e89b-12d3-a456-426614174000',
      email: 'test@example.com',
      passwordHash: hash,
      role: 'user',
      createdAt: new Date(),
    }]);

    const res = await app.request(
      post('/api/auth/login', { email: 'test@example.com', password: 'password123' })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.email).toBe('test@example.com');
    expect(body.user.role).toBe('user');

    const setCookie = res.headers.get('set-cookie');
    expect(setCookie).toContain('auth_token=');
    expect(setCookie).toContain('HttpOnly');
  });

  it('returns 401 for wrong password', async () => {
    const app = createApp();
    const bcrypt = await import('bcryptjs');
    const hash = await bcrypt.default.hash('correct-password', 4);

    selectResults.push([{
      id: '123e4567-e89b-12d3-a456-426614174000',
      email: 'test@example.com',
      passwordHash: hash,
      role: 'user',
      createdAt: new Date(),
    }]);

    const res = await app.request(
      post('/api/auth/login', { email: 'test@example.com', password: 'wrong-password' })
    );

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Invalid email or password');
  });

  it('returns 401 for nonexistent email', async () => {
    const app = createApp();
    selectResults.push([]); // no user found

    const res = await app.request(
      post('/api/auth/login', { email: 'nobody@example.com', password: 'password123' })
    );

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Invalid email or password');
  });
});

describe('POST /api/auth/logout', () => {
  it('clears auth_token cookie', async () => {
    const app = createApp();

    const res = await app.request(post('/api/auth/logout', {}));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    const setCookie = res.headers.get('set-cookie');
    expect(setCookie).toContain('auth_token=');
    expect(setCookie).toContain('Max-Age=0');
  });
});

describe('GET /api/auth/me', () => {
  beforeEach(() => {
    selectResults = [];
    insertResults = [];
  });

  it('returns 401 without auth token', async () => {
    const app = createApp();
    const res = await app.request(
      new Request('http://localhost/api/auth/me', { method: 'GET' })
    );
    expect(res.status).toBe(401);
  });

  it('returns user data with valid auth token', async () => {
    const app = createApp();
    const { sign } = await import('hono/jwt');

    const now = Math.floor(Date.now() / 1000);
    const token = await sign(
      { sub: '123e4567-e89b-12d3-a456-426614174000', email: 'test@example.com', role: 'user', iat: now, exp: now + 3600 },
      TEST_JWT_SECRET,
      'HS256'
    );

    selectResults.push([{
      id: '123e4567-e89b-12d3-a456-426614174000',
      email: 'test@example.com',
      role: 'user',
      createdAt: new Date('2024-01-01'),
    }]);

    const res = await app.request(
      new Request('http://localhost/api/auth/me', {
        method: 'GET',
        headers: { Cookie: `auth_token=${token}` },
      })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.email).toBe('test@example.com');
    expect(body.user.id).toBe('123e4567-e89b-12d3-a456-426614174000');
    expect(body.user.role).toBe('user');
  });
});
