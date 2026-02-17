import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { jwt, sign } from 'hono/jwt';
import { HTTPException } from 'hono/http-exception';
import { ZodError } from 'zod';

const TEST_JWT_SECRET = 'test-secret-key-that-is-at-least-32-characters';
const TEST_USER_ID = '123e4567-e89b-12d3-a456-426614174000';
const TEST_APP_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const TEST_TYPE_ID = '11111111-2222-3333-4444-555555555555';
const TEST_FIELD_ID = 'ffffffff-aaaa-bbbb-cccc-dddddddddddd';

// Queue to control what db queries return
let selectResults: any[][] = [];
let insertResults: any[][] = [];
let updateResults: any[][] = [];
let deleteCount: number = 0;

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
        where: (condition?: any) => {
          // If there's an orderBy call, handle it
          const result = selectResults.shift() ?? [];
          return {
            limit: () => Promise.resolve(result),
            orderBy: () => Promise.resolve(result),
            then: (resolve: any) => resolve(result),
          };
        },
        orderBy: () => Promise.resolve(selectResults.shift() ?? []),
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
        where: () => ({
          returning: () => Promise.resolve(updateResults.shift() ?? []),
        }),
      }),
    };
  }
  function chainDelete() {
    return {
      where: () => {
        deleteCount++;
        return Promise.resolve();
      },
    };
  }
  return {
    db: {
      select: chainSelect,
      insert: chainInsert,
      update: chainUpdate,
      delete: chainDelete,
    },
  };
});

const { appRoutes } = await import('./app-routes.js');

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

  app.route('/api/apps', appRoutes);
  return app;
}

async function getAuthToken() {
  const now = Math.floor(Date.now() / 1000);
  return sign(
    { sub: TEST_USER_ID, email: 'test@example.com', iat: now, exp: now + 3600 },
    TEST_JWT_SECRET,
    'HS256'
  );
}

function jsonRequest(method: string, path: string, body?: any, cookie?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (cookie) headers['Cookie'] = cookie;
  return new Request(`http://localhost${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

// --- Tests ---

describe('App Routes - Auth Protection', () => {
  it('returns 401 without auth token', async () => {
    const app = createApp();
    const res = await app.request(
      new Request('http://localhost/api/apps', { method: 'GET' })
    );
    expect(res.status).toBe(401);
  });
});

describe('POST /api/apps', () => {
  beforeEach(() => {
    selectResults = [];
    insertResults = [];
    updateResults = [];
    deleteCount = 0;
  });

  it('creates an app and returns 201', async () => {
    const app = createApp();
    const token = await getAuthToken();

    const newApp = {
      id: TEST_APP_ID,
      userId: TEST_USER_ID,
      name: 'My CRM',
      description: 'A CRM app',
      icon: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    insertResults.push([newApp]);

    const res = await app.request(
      jsonRequest('POST', '/api/apps', { name: 'My CRM', description: 'A CRM app' }, `auth_token=${token}`)
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.app.name).toBe('My CRM');
    expect(body.app.description).toBe('A CRM app');
  });

  it('returns 400 for missing name', async () => {
    const app = createApp();
    const token = await getAuthToken();

    const res = await app.request(
      jsonRequest('POST', '/api/apps', { description: 'No name' }, `auth_token=${token}`)
    );

    expect(res.status).toBe(400);
  });
});

describe('GET /api/apps', () => {
  beforeEach(() => {
    selectResults = [];
    insertResults = [];
    updateResults = [];
    deleteCount = 0;
  });

  it('returns list of user apps', async () => {
    const app = createApp();
    const token = await getAuthToken();

    selectResults.push([
      { id: TEST_APP_ID, userId: TEST_USER_ID, name: 'App 1', description: null, icon: null, createdAt: new Date(), updatedAt: new Date() },
    ]);

    const res = await app.request(
      jsonRequest('GET', '/api/apps', undefined, `auth_token=${token}`)
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.apps).toHaveLength(1);
    expect(body.apps[0].name).toBe('App 1');
  });
});

describe('GET /api/apps/:appId', () => {
  beforeEach(() => {
    selectResults = [];
    insertResults = [];
    updateResults = [];
    deleteCount = 0;
  });

  it('returns app with types', async () => {
    const app = createApp();
    const token = await getAuthToken();

    // First select: getAppForUser
    selectResults.push([{ id: TEST_APP_ID, userId: TEST_USER_ID, name: 'My App', description: null, icon: null, createdAt: new Date(), updatedAt: new Date() }]);
    // Second select: types for the app
    selectResults.push([{ id: TEST_TYPE_ID, appId: TEST_APP_ID, name: 'Contact', description: null, icon: null, position: 0, createdAt: new Date(), updatedAt: new Date() }]);

    const res = await app.request(
      jsonRequest('GET', `/api/apps/${TEST_APP_ID}`, undefined, `auth_token=${token}`)
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.app.name).toBe('My App');
    expect(body.types).toHaveLength(1);
    expect(body.types[0].name).toBe('Contact');
  });

  it('returns 404 for app owned by another user', async () => {
    const app = createApp();
    const token = await getAuthToken();

    selectResults.push([]); // no app found for this user

    const res = await app.request(
      jsonRequest('GET', `/api/apps/${TEST_APP_ID}`, undefined, `auth_token=${token}`)
    );

    expect(res.status).toBe(404);
  });
});

describe('POST /api/apps/:appId/types', () => {
  beforeEach(() => {
    selectResults = [];
    insertResults = [];
    updateResults = [];
    deleteCount = 0;
  });

  it('creates a type within an app', async () => {
    const app = createApp();
    const token = await getAuthToken();

    // getAppForUser
    selectResults.push([{ id: TEST_APP_ID, userId: TEST_USER_ID, name: 'My App' }]);
    // count existing types for position
    selectResults.push([]);
    // insert type
    insertResults.push([{ id: TEST_TYPE_ID, appId: TEST_APP_ID, name: 'Contact', description: null, icon: null, position: 0, createdAt: new Date(), updatedAt: new Date() }]);

    const res = await app.request(
      jsonRequest('POST', `/api/apps/${TEST_APP_ID}/types`, { name: 'Contact' }, `auth_token=${token}`)
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.type.name).toBe('Contact');
  });
});

describe('POST /api/apps/:appId/types/:typeId/fields', () => {
  beforeEach(() => {
    selectResults = [];
    insertResults = [];
    updateResults = [];
    deleteCount = 0;
  });

  it('creates a field within a type', async () => {
    const app = createApp();
    const token = await getAuthToken();

    // getAppForUser
    selectResults.push([{ id: TEST_APP_ID, userId: TEST_USER_ID, name: 'My App' }]);
    // getTypeForApp
    selectResults.push([{ id: TEST_TYPE_ID, appId: TEST_APP_ID, name: 'Contact' }]);
    // count existing fields for position
    selectResults.push([]);
    // insert field
    insertResults.push([{
      id: TEST_FIELD_ID,
      typeId: TEST_TYPE_ID,
      name: 'Full Name',
      type: 'text',
      config: {},
      position: 0,
      required: true,
      createdAt: new Date(),
    }]);

    const res = await app.request(
      jsonRequest('POST', `/api/apps/${TEST_APP_ID}/types/${TEST_TYPE_ID}/fields`, {
        name: 'Full Name',
        type: 'text',
        required: true,
      }, `auth_token=${token}`)
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.field.name).toBe('Full Name');
    expect(body.field.type).toBe('text');
    expect(body.field.required).toBe(true);
  });

  it('creates a relation field with config', async () => {
    const app = createApp();
    const token = await getAuthToken();

    // getAppForUser
    selectResults.push([{ id: TEST_APP_ID, userId: TEST_USER_ID, name: 'My App' }]);
    // getTypeForApp
    selectResults.push([{ id: TEST_TYPE_ID, appId: TEST_APP_ID, name: 'Contact' }]);
    // count existing fields
    selectResults.push([]);
    // insert field
    insertResults.push([{
      id: TEST_FIELD_ID,
      typeId: TEST_TYPE_ID,
      name: 'Company',
      type: 'relation',
      config: { relatedTypeId: '22222222-3333-4444-5555-666666666666' },
      position: 0,
      required: false,
      createdAt: new Date(),
    }]);

    const res = await app.request(
      jsonRequest('POST', `/api/apps/${TEST_APP_ID}/types/${TEST_TYPE_ID}/fields`, {
        name: 'Company',
        type: 'relation',
        config: { relatedTypeId: '22222222-3333-4444-5555-666666666666' },
      }, `auth_token=${token}`)
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.field.type).toBe('relation');
    expect(body.field.config.relatedTypeId).toBe('22222222-3333-4444-5555-666666666666');
  });

  it('returns 400 for invalid field type', async () => {
    const app = createApp();
    const token = await getAuthToken();

    // getAppForUser
    selectResults.push([{ id: TEST_APP_ID, userId: TEST_USER_ID, name: 'My App' }]);
    // getTypeForApp
    selectResults.push([{ id: TEST_TYPE_ID, appId: TEST_APP_ID, name: 'Contact' }]);

    const res = await app.request(
      jsonRequest('POST', `/api/apps/${TEST_APP_ID}/types/${TEST_TYPE_ID}/fields`, {
        name: 'Bad Field',
        type: 'invalid_type',
      }, `auth_token=${token}`)
    );

    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/apps/:appId', () => {
  beforeEach(() => {
    selectResults = [];
    insertResults = [];
    updateResults = [];
    deleteCount = 0;
  });

  it('deletes an app', async () => {
    const app = createApp();
    const token = await getAuthToken();

    // getAppForUser
    selectResults.push([{ id: TEST_APP_ID, userId: TEST_USER_ID, name: 'My App' }]);

    const res = await app.request(
      jsonRequest('DELETE', `/api/apps/${TEST_APP_ID}`, undefined, `auth_token=${token}`)
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(deleteCount).toBe(1);
  });
});

describe('PUT /api/apps/:appId', () => {
  beforeEach(() => {
    selectResults = [];
    insertResults = [];
    updateResults = [];
    deleteCount = 0;
  });

  it('updates an app name', async () => {
    const app = createApp();
    const token = await getAuthToken();

    // getAppForUser
    selectResults.push([{ id: TEST_APP_ID, userId: TEST_USER_ID, name: 'Old Name' }]);
    // update returning
    updateResults.push([{ id: TEST_APP_ID, userId: TEST_USER_ID, name: 'New Name', description: null, icon: null, createdAt: new Date(), updatedAt: new Date() }]);

    const res = await app.request(
      jsonRequest('PUT', `/api/apps/${TEST_APP_ID}`, { name: 'New Name' }, `auth_token=${token}`)
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.app.name).toBe('New Name');
  });
});
