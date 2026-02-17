import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { jwt, sign } from 'hono/jwt';
import { HTTPException } from 'hono/http-exception';
import { ZodError } from 'zod';

const TEST_JWT_SECRET = 'test-secret-key-that-is-at-least-32-characters';
const TEST_USER_ID = '123e4567-e89b-12d3-a456-426614174000';
const TEST_APP_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const TEST_TYPE_ID = 'b0b0b0b0-c1c1-d2d2-e3e3-f4f4f4f4f4f4';
const TEST_AUTOMATION_ID = 'c0c0c0c0-d1d1-e2e2-f3f3-040404040404';
const TEST_RUN_ID = 'd0d0d0d0-e1e1-f2f2-0303-141414141414';

let selectResults: unknown[][] = [];
let insertResults: unknown[][] = [];
let updateResults: unknown[][] = [];
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
        where: () => {
          const result = selectResults.shift() ?? [];
          return {
            limit: () => Promise.resolve(result),
            orderBy: () => ({
              limit: () => ({
                offset: () => Promise.resolve(result),
              }),
              then: (resolve: (v: unknown) => void) => resolve(result),
            }),
            then: (resolve: (v: unknown) => void) => resolve(result),
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

// Mock the automation runner so manual trigger doesn't actually call E2B
vi.mock('../automation-runner.js', () => ({
  runAutomation: vi.fn().mockResolvedValue('mock-run-id'),
}));

const { automationRoutes } = await import('./automation-routes.js');

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

  app.route('/api/apps', automationRoutes);
  return app;
}

async function getAuthToken() {
  const now = Math.floor(Date.now() / 1000);
  return sign(
    {
      sub: TEST_USER_ID,
      email: 'test@example.com',
      iat: now,
      exp: now + 3600,
    },
    TEST_JWT_SECRET,
    'HS256',
  );
}

function jsonRequest(method: string, path: string, body?: unknown, cookie?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (cookie) headers['Cookie'] = cookie;
  return new Request(`http://localhost${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

const MOCK_AUTOMATION = {
  id: TEST_AUTOMATION_ID,
  appId: TEST_APP_ID,
  typeId: TEST_TYPE_ID,
  name: 'Log on create',
  description: 'Logs when a record is created',
  trigger: 'record_created',
  triggerConfig: {},
  code: 'log("Record created: " + str(ctx["record_id"]))',
  enabled: true,
  createdBy: TEST_USER_ID,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const MOCK_RUN = {
  id: TEST_RUN_ID,
  automationId: TEST_AUTOMATION_ID,
  status: 'success',
  triggerEvent: 'record_created',
  triggerRecordId: null,
  logs: [{ timestamp: '2025-01-01T00:00:00Z', level: 'info', message: 'Record created' }],
  error: null,
  durationMs: 150,
  createdAt: new Date(),
};

// --- Tests ---

describe('Automation Routes - Auth Protection', () => {
  it('returns 401 without auth token', async () => {
    const app = createApp();
    const res = await app.request(
      jsonRequest('GET', `/api/apps/${TEST_APP_ID}/automations`),
    );
    expect(res.status).toBe(401);
  });
});

describe('POST /api/apps/:appId/automations', () => {
  beforeEach(() => {
    selectResults = [];
    insertResults = [];
    updateResults = [];
    deleteCount = 0;
  });

  it('creates a new automation', async () => {
    const app = createApp();
    const token = await getAuthToken();

    // getAppForUser
    selectResults.push([{ id: TEST_APP_ID, userId: TEST_USER_ID, name: 'My App' }]);
    // insert automation
    insertResults.push([MOCK_AUTOMATION]);

    const res = await app.request(
      jsonRequest(
        'POST',
        `/api/apps/${TEST_APP_ID}/automations`,
        {
          name: 'Log on create',
          typeId: TEST_TYPE_ID,
          trigger: 'record_created',
          code: 'log("hello")',
        },
        `auth_token=${token}`,
      ),
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.automation.name).toBe('Log on create');
    expect(body.automation.trigger).toBe('record_created');
  });

  it('returns 404 for app owned by another user', async () => {
    const app = createApp();
    const token = await getAuthToken();

    // getAppForUser — not found
    selectResults.push([]);

    const res = await app.request(
      jsonRequest(
        'POST',
        `/api/apps/${TEST_APP_ID}/automations`,
        {
          name: 'Test',
          typeId: TEST_TYPE_ID,
          trigger: 'record_created',
          code: 'log("hello")',
        },
        `auth_token=${token}`,
      ),
    );

    expect(res.status).toBe(404);
  });

  it('returns 400 for invalid trigger', async () => {
    const app = createApp();
    const token = await getAuthToken();

    selectResults.push([{ id: TEST_APP_ID, userId: TEST_USER_ID, name: 'My App' }]);

    const res = await app.request(
      jsonRequest(
        'POST',
        `/api/apps/${TEST_APP_ID}/automations`,
        {
          name: 'Test',
          typeId: TEST_TYPE_ID,
          trigger: 'invalid_trigger',
          code: 'log("hello")',
        },
        `auth_token=${token}`,
      ),
    );

    expect(res.status).toBe(400);
  });

  it('returns 400 for missing code', async () => {
    const app = createApp();
    const token = await getAuthToken();

    selectResults.push([{ id: TEST_APP_ID, userId: TEST_USER_ID, name: 'My App' }]);

    const res = await app.request(
      jsonRequest(
        'POST',
        `/api/apps/${TEST_APP_ID}/automations`,
        {
          name: 'Test',
          typeId: TEST_TYPE_ID,
          trigger: 'record_created',
        },
        `auth_token=${token}`,
      ),
    );

    expect(res.status).toBe(400);
  });
});

describe('GET /api/apps/:appId/automations', () => {
  beforeEach(() => {
    selectResults = [];
    insertResults = [];
    updateResults = [];
    deleteCount = 0;
  });

  it('lists automations for an app', async () => {
    const app = createApp();
    const token = await getAuthToken();

    // getAppForUser
    selectResults.push([{ id: TEST_APP_ID, userId: TEST_USER_ID, name: 'My App' }]);
    // list automations
    selectResults.push([MOCK_AUTOMATION]);

    const res = await app.request(
      jsonRequest(
        'GET',
        `/api/apps/${TEST_APP_ID}/automations`,
        undefined,
        `auth_token=${token}`,
      ),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.automations).toHaveLength(1);
    expect(body.automations[0].name).toBe('Log on create');
  });
});

describe('GET /api/apps/:appId/automations/:automationId', () => {
  beforeEach(() => {
    selectResults = [];
    insertResults = [];
    updateResults = [];
    deleteCount = 0;
  });

  it('gets a single automation', async () => {
    const app = createApp();
    const token = await getAuthToken();

    // getAppForUser
    selectResults.push([{ id: TEST_APP_ID, userId: TEST_USER_ID, name: 'My App' }]);
    // getAutomationForApp
    selectResults.push([MOCK_AUTOMATION]);

    const res = await app.request(
      jsonRequest(
        'GET',
        `/api/apps/${TEST_APP_ID}/automations/${TEST_AUTOMATION_ID}`,
        undefined,
        `auth_token=${token}`,
      ),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.automation.id).toBe(TEST_AUTOMATION_ID);
  });

  it('returns 404 for non-existent automation', async () => {
    const app = createApp();
    const token = await getAuthToken();

    // getAppForUser
    selectResults.push([{ id: TEST_APP_ID, userId: TEST_USER_ID, name: 'My App' }]);
    // getAutomationForApp — not found
    selectResults.push([]);

    const res = await app.request(
      jsonRequest(
        'GET',
        `/api/apps/${TEST_APP_ID}/automations/${TEST_AUTOMATION_ID}`,
        undefined,
        `auth_token=${token}`,
      ),
    );

    expect(res.status).toBe(404);
  });
});

describe('PUT /api/apps/:appId/automations/:automationId', () => {
  beforeEach(() => {
    selectResults = [];
    insertResults = [];
    updateResults = [];
    deleteCount = 0;
  });

  it('updates an automation', async () => {
    const app = createApp();
    const token = await getAuthToken();

    // getAppForUser
    selectResults.push([{ id: TEST_APP_ID, userId: TEST_USER_ID, name: 'My App' }]);
    // getAutomationForApp
    selectResults.push([MOCK_AUTOMATION]);
    // update
    updateResults.push([{ ...MOCK_AUTOMATION, name: 'Updated name', enabled: false }]);

    const res = await app.request(
      jsonRequest(
        'PUT',
        `/api/apps/${TEST_APP_ID}/automations/${TEST_AUTOMATION_ID}`,
        { name: 'Updated name', enabled: false },
        `auth_token=${token}`,
      ),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.automation.name).toBe('Updated name');
    expect(body.automation.enabled).toBe(false);
  });
});

describe('DELETE /api/apps/:appId/automations/:automationId', () => {
  beforeEach(() => {
    selectResults = [];
    insertResults = [];
    updateResults = [];
    deleteCount = 0;
  });

  it('deletes an automation', async () => {
    const app = createApp();
    const token = await getAuthToken();

    // getAppForUser
    selectResults.push([{ id: TEST_APP_ID, userId: TEST_USER_ID, name: 'My App' }]);
    // getAutomationForApp
    selectResults.push([MOCK_AUTOMATION]);

    const res = await app.request(
      jsonRequest(
        'DELETE',
        `/api/apps/${TEST_APP_ID}/automations/${TEST_AUTOMATION_ID}`,
        undefined,
        `auth_token=${token}`,
      ),
    );

    expect(res.status).toBe(200);
    expect(deleteCount).toBe(1);
  });
});

describe('POST /api/apps/:appId/automations/:automationId/run', () => {
  beforeEach(() => {
    selectResults = [];
    insertResults = [];
    updateResults = [];
    deleteCount = 0;
  });

  it('manually triggers an automation', async () => {
    const app = createApp();
    const token = await getAuthToken();

    // getAppForUser
    selectResults.push([{ id: TEST_APP_ID, userId: TEST_USER_ID, name: 'My App' }]);
    // getAutomationForApp
    selectResults.push([MOCK_AUTOMATION]);

    const res = await app.request(
      jsonRequest(
        'POST',
        `/api/apps/${TEST_APP_ID}/automations/${TEST_AUTOMATION_ID}/run`,
        undefined,
        `auth_token=${token}`,
      ),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.runId).toBe('mock-run-id');
  });
});

describe('GET /api/apps/:appId/automations/:automationId/runs', () => {
  beforeEach(() => {
    selectResults = [];
    insertResults = [];
    updateResults = [];
    deleteCount = 0;
  });

  it('lists runs for an automation', async () => {
    const app = createApp();
    const token = await getAuthToken();

    // getAppForUser
    selectResults.push([{ id: TEST_APP_ID, userId: TEST_USER_ID, name: 'My App' }]);
    // getAutomationForApp
    selectResults.push([MOCK_AUTOMATION]);
    // count runs
    selectResults.push([{ count: 1 }]);
    // list runs
    selectResults.push([MOCK_RUN]);

    const res = await app.request(
      jsonRequest(
        'GET',
        `/api/apps/${TEST_APP_ID}/automations/${TEST_AUTOMATION_ID}/runs`,
        undefined,
        `auth_token=${token}`,
      ),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.runs).toHaveLength(1);
    expect(body.runs[0].status).toBe('success');
    expect(body.total).toBe(1);
  });
});
