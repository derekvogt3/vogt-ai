import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { jwt, sign } from 'hono/jwt';
import { HTTPException } from 'hono/http-exception';
import { ZodError } from 'zod';

const TEST_JWT_SECRET = 'test-secret-key-that-is-at-least-32-characters';
const TEST_USER_ID = '123e4567-e89b-12d3-a456-426614174000';
const TEST_APP_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const TEST_TYPE_ID = '11111111-2222-3333-4444-555555555555';
const TEST_FIELD_ID_1 = 'f1111111-aaaa-bbbb-cccc-dddddddddddd';
const TEST_FIELD_ID_2 = 'f2222222-aaaa-bbbb-cccc-dddddddddddd';
const TEST_RECORD_ID = 'rrrrrrrr-aaaa-bbbb-cccc-dddddddddddd';

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
          const result = selectResults.shift() ?? [];
          return {
            limit: () => Promise.resolve(result),
            orderBy: () => ({
              limit: (n: number) => ({
                offset: () => Promise.resolve(result),
              }),
              then: (resolve: any) => resolve(result),
            }),
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

const { recordRoutes } = await import('./record-routes.js');

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
    const jwtMiddleware = jwt({
      secret: TEST_JWT_SECRET,
      alg: 'HS256',
      cookie: 'auth_token',
    });
    return jwtMiddleware(c, next);
  });

  app.route('/api/apps', recordRoutes);
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

const mockApp = { id: TEST_APP_ID, userId: TEST_USER_ID, name: 'My App' };
const mockType = { id: TEST_TYPE_ID, appId: TEST_APP_ID, name: 'Contact' };
const mockFields = [
  { id: TEST_FIELD_ID_1, typeId: TEST_TYPE_ID, name: 'Full Name', type: 'text', config: {}, position: 0, required: true, createdAt: new Date() },
  { id: TEST_FIELD_ID_2, typeId: TEST_TYPE_ID, name: 'Age', type: 'number', config: {}, position: 1, required: false, createdAt: new Date() },
];

function setupOwnershipChecks() {
  selectResults.push([mockApp]);  // getAppForUser
  selectResults.push([mockType]); // getTypeForApp
}

// --- Tests ---

describe('POST /api/apps/:appId/types/:typeId/records', () => {
  beforeEach(() => {
    selectResults = [];
    insertResults = [];
    updateResults = [];
    deleteCount = 0;
  });

  it('creates a record with valid data', async () => {
    const app = createApp();
    const token = await getAuthToken();

    setupOwnershipChecks();
    selectResults.push(mockFields); // getFieldsForType

    const recordData = { [TEST_FIELD_ID_1]: 'John Doe', [TEST_FIELD_ID_2]: 30 };
    const newRecord = {
      id: TEST_RECORD_ID,
      typeId: TEST_TYPE_ID,
      data: recordData,
      createdBy: TEST_USER_ID,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    insertResults.push([newRecord]);

    const res = await app.request(
      jsonRequest('POST', `/api/apps/${TEST_APP_ID}/types/${TEST_TYPE_ID}/records`, {
        data: recordData,
      }, `auth_token=${token}`)
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.record.data[TEST_FIELD_ID_1]).toBe('John Doe');
    expect(body.record.data[TEST_FIELD_ID_2]).toBe(30);
  });

  it('returns 400 when required field is missing', async () => {
    const app = createApp();
    const token = await getAuthToken();

    setupOwnershipChecks();
    selectResults.push(mockFields); // getFieldsForType

    const res = await app.request(
      jsonRequest('POST', `/api/apps/${TEST_APP_ID}/types/${TEST_TYPE_ID}/records`, {
        data: { [TEST_FIELD_ID_2]: 25 }, // missing required Full Name
      }, `auth_token=${token}`)
    );

    expect(res.status).toBe(400);
  });

  it('returns 400 when field has wrong type', async () => {
    const app = createApp();
    const token = await getAuthToken();

    setupOwnershipChecks();
    selectResults.push(mockFields); // getFieldsForType

    const res = await app.request(
      jsonRequest('POST', `/api/apps/${TEST_APP_ID}/types/${TEST_TYPE_ID}/records`, {
        data: { [TEST_FIELD_ID_1]: 'John', [TEST_FIELD_ID_2]: 'not a number' },
      }, `auth_token=${token}`)
    );

    expect(res.status).toBe(400);
  });

  it('returns 404 for another users app', async () => {
    const app = createApp();
    const token = await getAuthToken();

    selectResults.push([]); // getAppForUser returns empty — not found

    const res = await app.request(
      jsonRequest('POST', `/api/apps/${TEST_APP_ID}/types/${TEST_TYPE_ID}/records`, {
        data: { [TEST_FIELD_ID_1]: 'John' },
      }, `auth_token=${token}`)
    );

    expect(res.status).toBe(404);
  });
});

describe('GET /api/apps/:appId/types/:typeId/records', () => {
  beforeEach(() => {
    selectResults = [];
    insertResults = [];
    updateResults = [];
    deleteCount = 0;
  });

  it('returns paginated records', async () => {
    const app = createApp();
    const token = await getAuthToken();

    setupOwnershipChecks();
    // count query
    selectResults.push([{ count: 2 }]);
    // records query
    const recordsList = [
      { id: TEST_RECORD_ID, typeId: TEST_TYPE_ID, data: { [TEST_FIELD_ID_1]: 'Alice' }, createdBy: TEST_USER_ID, createdAt: new Date(), updatedAt: new Date() },
      { id: 'rrrrrrrr-2222-3333-4444-555555555555', typeId: TEST_TYPE_ID, data: { [TEST_FIELD_ID_1]: 'Bob' }, createdBy: TEST_USER_ID, createdAt: new Date(), updatedAt: new Date() },
    ];
    selectResults.push(recordsList);

    const res = await app.request(
      jsonRequest('GET', `/api/apps/${TEST_APP_ID}/types/${TEST_TYPE_ID}/records?page=1&pageSize=10`, undefined, `auth_token=${token}`)
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.records).toHaveLength(2);
    expect(body.total).toBe(2);
    expect(body.page).toBe(1);
    expect(body.pageSize).toBe(10);
  });
});

describe('GET /api/apps/:appId/types/:typeId/records/:recordId', () => {
  beforeEach(() => {
    selectResults = [];
    insertResults = [];
    updateResults = [];
    deleteCount = 0;
  });

  it('returns a single record', async () => {
    const app = createApp();
    const token = await getAuthToken();

    setupOwnershipChecks();
    // getRecordForType
    const record = {
      id: TEST_RECORD_ID,
      typeId: TEST_TYPE_ID,
      data: { [TEST_FIELD_ID_1]: 'Alice', [TEST_FIELD_ID_2]: 28 },
      createdBy: TEST_USER_ID,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    selectResults.push([record]);

    const res = await app.request(
      jsonRequest('GET', `/api/apps/${TEST_APP_ID}/types/${TEST_TYPE_ID}/records/${TEST_RECORD_ID}`, undefined, `auth_token=${token}`)
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.record.data[TEST_FIELD_ID_1]).toBe('Alice');
  });

  it('returns 404 for non-existent record', async () => {
    const app = createApp();
    const token = await getAuthToken();

    setupOwnershipChecks();
    selectResults.push([]); // getRecordForType — not found

    const res = await app.request(
      jsonRequest('GET', `/api/apps/${TEST_APP_ID}/types/${TEST_TYPE_ID}/records/${TEST_RECORD_ID}`, undefined, `auth_token=${token}`)
    );

    expect(res.status).toBe(404);
  });
});

describe('PUT /api/apps/:appId/types/:typeId/records/:recordId', () => {
  beforeEach(() => {
    selectResults = [];
    insertResults = [];
    updateResults = [];
    deleteCount = 0;
  });

  it('updates record with partial data merge', async () => {
    const app = createApp();
    const token = await getAuthToken();

    setupOwnershipChecks();
    // getRecordForType (existing record)
    const existing = {
      id: TEST_RECORD_ID,
      typeId: TEST_TYPE_ID,
      data: { [TEST_FIELD_ID_1]: 'Alice', [TEST_FIELD_ID_2]: 28 },
      createdBy: TEST_USER_ID,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    selectResults.push([existing]);
    // getFieldsForType
    selectResults.push(mockFields);

    const updatedRecord = {
      ...existing,
      data: { [TEST_FIELD_ID_1]: 'Alice Smith', [TEST_FIELD_ID_2]: 28 },
      updatedAt: new Date(),
    };
    updateResults.push([updatedRecord]);

    const res = await app.request(
      jsonRequest('PUT', `/api/apps/${TEST_APP_ID}/types/${TEST_TYPE_ID}/records/${TEST_RECORD_ID}`, {
        data: { [TEST_FIELD_ID_1]: 'Alice Smith' },
      }, `auth_token=${token}`)
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.record.data[TEST_FIELD_ID_1]).toBe('Alice Smith');
    expect(body.record.data[TEST_FIELD_ID_2]).toBe(28);
  });
});

describe('DELETE /api/apps/:appId/types/:typeId/records/:recordId', () => {
  beforeEach(() => {
    selectResults = [];
    insertResults = [];
    updateResults = [];
    deleteCount = 0;
  });

  it('deletes a record', async () => {
    const app = createApp();
    const token = await getAuthToken();

    setupOwnershipChecks();
    // getRecordForType
    selectResults.push([{
      id: TEST_RECORD_ID,
      typeId: TEST_TYPE_ID,
      data: {},
      createdBy: TEST_USER_ID,
      createdAt: new Date(),
      updatedAt: new Date(),
    }]);

    const res = await app.request(
      jsonRequest('DELETE', `/api/apps/${TEST_APP_ID}/types/${TEST_TYPE_ID}/records/${TEST_RECORD_ID}`, undefined, `auth_token=${token}`)
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(deleteCount).toBe(1);
  });
});
