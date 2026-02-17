import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { jwt, sign } from 'hono/jwt';
import { HTTPException } from 'hono/http-exception';
import { ZodError } from 'zod';

const TEST_JWT_SECRET = 'test-secret-key-that-is-at-least-32-characters';
const TEST_USER_ID = '123e4567-e89b-12d3-a456-426614174000';
const TEST_APP_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const TEST_TYPE_ID = '11111111-2222-3333-4444-555555555555';

// Queue to control what db queries return
let selectResults: unknown[][] = [];
let insertResults: unknown[][] = [];
let updateResults: unknown[][] = [];
let deleteCount: number = 0;

// Queue to control Anthropic SDK responses
let anthropicResponses: unknown[] = [];

vi.mock('../env.js', () => ({
  env: {
    DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
    JWT_SECRET: TEST_JWT_SECRET,
    ANTHROPIC_API_KEY: 'test-anthropic-key',
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
            orderBy: () => Promise.resolve(result),
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

vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class MockAnthropic {
      constructor() {}
      messages = {
        create: () => Promise.resolve(anthropicResponses.shift()),
      };
    },
  };
});

const { aiRoutes } = await import('./ai-routes.js');

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
      return c.json(
        { error: 'Validation error', details: err.flatten() },
        400,
      );
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

  app.route('/api/apps', aiRoutes);
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

function jsonRequest(
  method: string,
  path: string,
  body?: unknown,
  cookie?: string,
) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (cookie) headers['Cookie'] = cookie;
  return new Request(`http://localhost${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function parseSSEEvents(res: Response): Promise<Record<string, unknown>[]> {
  const text = await res.text();
  const events: Record<string, unknown>[] = [];
  const lines = text.split('\n');
  let currentEvent = '';

  for (const line of lines) {
    if (line.startsWith('event: ')) {
      currentEvent = line.slice(7).trim();
    } else if (line.startsWith('data: ') && currentEvent) {
      try {
        const data = JSON.parse(line.slice(6));
        events.push({ type: currentEvent, ...data });
      } catch {
        // skip
      }
      currentEvent = '';
    }
  }
  return events;
}

// --- Tests ---

describe('AI Routes - Auth Protection', () => {
  it('returns 401 without auth token', async () => {
    const app = createApp();
    const res = await app.request(
      jsonRequest('POST', `/api/apps/${TEST_APP_ID}/chat`, {
        messages: [{ role: 'user', content: 'Hello' }],
      }),
    );
    expect(res.status).toBe(401);
  });
});

describe('POST /api/apps/:appId/chat', () => {
  beforeEach(() => {
    selectResults = [];
    insertResults = [];
    updateResults = [];
    deleteCount = 0;
    anthropicResponses = [];
  });

  it('returns 404 for app owned by another user', async () => {
    const app = createApp();
    const token = await getAuthToken();

    // getAppForUser returns nothing
    selectResults.push([]);

    const res = await app.request(
      jsonRequest(
        'POST',
        `/api/apps/${TEST_APP_ID}/chat`,
        { messages: [{ role: 'user', content: 'Hello' }] },
        `auth_token=${token}`,
      ),
    );

    expect(res.status).toBe(404);
  });

  it('returns 400 for invalid message format', async () => {
    const app = createApp();
    const token = await getAuthToken();

    // getAppForUser
    selectResults.push([
      { id: TEST_APP_ID, userId: TEST_USER_ID, name: 'My App' },
    ]);

    const res = await app.request(
      jsonRequest(
        'POST',
        `/api/apps/${TEST_APP_ID}/chat`,
        { messages: [{ role: 'invalid', content: 'Hello' }] },
        `auth_token=${token}`,
      ),
    );

    expect(res.status).toBe(400);
  });

  it('streams text response when no tools are called', async () => {
    const app = createApp();
    const token = await getAuthToken();

    // getAppForUser
    selectResults.push([
      { id: TEST_APP_ID, userId: TEST_USER_ID, name: 'My App' },
    ]);
    // buildSystemPrompt: list types for the app (empty app)
    selectResults.push([]);

    // Anthropic returns text-only response
    anthropicResponses.push({
      content: [{ type: 'text', text: 'Hello! How can I help?' }],
      stop_reason: 'end_turn',
    });

    const res = await app.request(
      jsonRequest(
        'POST',
        `/api/apps/${TEST_APP_ID}/chat`,
        { messages: [{ role: 'user', content: 'Hello' }] },
        `auth_token=${token}`,
      ),
    );

    expect(res.status).toBe(200);

    const events = await parseSSEEvents(res);
    const textEvents = events.filter((e) => e.type === 'text_delta');
    const doneEvents = events.filter((e) => e.type === 'message_done');

    expect(textEvents.length).toBe(1);
    expect(textEvents[0].text).toBe('Hello! How can I help?');
    expect(doneEvents.length).toBe(1);
  });

  it('executes tool call and streams results', async () => {
    const app = createApp();
    const token = await getAuthToken();

    // getAppForUser
    selectResults.push([
      { id: TEST_APP_ID, userId: TEST_USER_ID, name: 'My App' },
    ]);
    // buildSystemPrompt: list types (empty app)
    selectResults.push([]);

    // First Anthropic response: tool call to create_type
    anthropicResponses.push({
      content: [
        {
          type: 'tool_use',
          id: 'toolu_123',
          name: 'create_type',
          input: { name: 'Contact', description: 'A contact record' },
        },
      ],
      stop_reason: 'tool_use',
    });

    // Tool execution: count existing types for position
    selectResults.push([]);
    // Tool execution: insert type
    insertResults.push([
      {
        id: TEST_TYPE_ID,
        appId: TEST_APP_ID,
        name: 'Contact',
        description: 'A contact record',
        icon: null,
        position: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    // Second Anthropic response: text summary (no more tools)
    anthropicResponses.push({
      content: [
        { type: 'text', text: 'I created a Contact type for you.' },
      ],
      stop_reason: 'end_turn',
    });

    const res = await app.request(
      jsonRequest(
        'POST',
        `/api/apps/${TEST_APP_ID}/chat`,
        { messages: [{ role: 'user', content: 'Create a Contact type' }] },
        `auth_token=${token}`,
      ),
    );

    expect(res.status).toBe(200);

    const events = await parseSSEEvents(res);

    const toolStartEvents = events.filter(
      (e) => e.type === 'tool_use_start',
    );
    const toolResultEvents = events.filter(
      (e) => e.type === 'tool_result',
    );
    const textEvents = events.filter((e) => e.type === 'text_delta');
    const doneEvents = events.filter((e) => e.type === 'message_done');

    expect(toolStartEvents.length).toBe(1);
    expect(toolStartEvents[0].name).toBe('create_type');

    expect(toolResultEvents.length).toBe(1);
    expect(toolResultEvents[0].success).toBe(true);
    expect((toolResultEvents[0].result as Record<string, unknown>).name).toBe('Contact');

    expect(textEvents.length).toBe(1);
    expect(textEvents[0].text).toBe('I created a Contact type for you.');

    expect(doneEvents.length).toBe(1);
  });

  it('handles tool execution error gracefully', async () => {
    const app = createApp();
    const token = await getAuthToken();

    // getAppForUser
    selectResults.push([
      { id: TEST_APP_ID, userId: TEST_USER_ID, name: 'My App' },
    ]);
    // buildSystemPrompt: list types
    selectResults.push([]);

    // Anthropic response: tool call to create_field on non-existent type
    anthropicResponses.push({
      content: [
        {
          type: 'tool_use',
          id: 'toolu_456',
          name: 'create_field',
          input: {
            type_id: 'nonexistent-type-id',
            name: 'Email',
            type: 'email',
          },
        },
      ],
      stop_reason: 'tool_use',
    });

    // Tool execution: verify type belongs to app → not found
    selectResults.push([]);

    // Anthropic follows up with error explanation
    anthropicResponses.push({
      content: [
        {
          type: 'text',
          text: 'The type was not found. Please create a type first.',
        },
      ],
      stop_reason: 'end_turn',
    });

    const res = await app.request(
      jsonRequest(
        'POST',
        `/api/apps/${TEST_APP_ID}/chat`,
        {
          messages: [
            { role: 'user', content: 'Add an Email field to the Contact type' },
          ],
        },
        `auth_token=${token}`,
      ),
    );

    expect(res.status).toBe(200);

    const events = await parseSSEEvents(res);

    const toolResultEvents = events.filter(
      (e) => e.type === 'tool_result',
    );
    expect(toolResultEvents.length).toBe(1);
    expect(toolResultEvents[0].success).toBe(false);
    expect(toolResultEvents[0].error).toBe('Type not found');
  });

  it('handles multiple tool calls in sequence', async () => {
    const app = createApp();
    const token = await getAuthToken();

    // getAppForUser
    selectResults.push([
      { id: TEST_APP_ID, userId: TEST_USER_ID, name: 'My App' },
    ]);
    // buildSystemPrompt: list types (empty)
    selectResults.push([]);

    // First Anthropic response: two tool calls (create type + create field)
    anthropicResponses.push({
      content: [
        {
          type: 'tool_use',
          id: 'toolu_a',
          name: 'create_type',
          input: { name: 'Task' },
        },
        {
          type: 'tool_use',
          id: 'toolu_b',
          name: 'create_field',
          input: { type_id: TEST_TYPE_ID, name: 'Title', type: 'text' },
        },
      ],
      stop_reason: 'tool_use',
    });

    // Tool exec for create_type: count existing, insert
    selectResults.push([]); // count types
    insertResults.push([
      {
        id: TEST_TYPE_ID,
        appId: TEST_APP_ID,
        name: 'Task',
        description: null,
        icon: null,
        position: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    // Tool exec for create_field: verify type, count fields, insert
    selectResults.push([
      { id: TEST_TYPE_ID, appId: TEST_APP_ID, name: 'Task' },
    ]); // verify type
    selectResults.push([]); // count fields
    insertResults.push([
      {
        id: 'ffffffff-aaaa-bbbb-cccc-dddddddddddd',
        typeId: TEST_TYPE_ID,
        name: 'Title',
        type: 'text',
        config: {},
        position: 0,
        required: false,
        createdAt: new Date(),
      },
    ]);

    // Second Anthropic response: summary text
    anthropicResponses.push({
      content: [
        { type: 'text', text: 'Created Task type with a Title field.' },
      ],
      stop_reason: 'end_turn',
    });

    const res = await app.request(
      jsonRequest(
        'POST',
        `/api/apps/${TEST_APP_ID}/chat`,
        {
          messages: [
            {
              role: 'user',
              content: 'Create a Task type with a Title field',
            },
          ],
        },
        `auth_token=${token}`,
      ),
    );

    expect(res.status).toBe(200);

    const events = await parseSSEEvents(res);

    const toolStartEvents = events.filter(
      (e) => e.type === 'tool_use_start',
    );
    const toolResultEvents = events.filter(
      (e) => e.type === 'tool_result',
    );

    expect(toolStartEvents.length).toBe(2);
    expect(toolStartEvents[0].name).toBe('create_type');
    expect(toolStartEvents[1].name).toBe('create_field');

    expect(toolResultEvents.length).toBe(2);
    expect(toolResultEvents[0].success).toBe(true);
    expect(toolResultEvents[1].success).toBe(true);
  });

  it('verifies type ownership in tool execution', async () => {
    const app = createApp();
    const token = await getAuthToken();

    // getAppForUser
    selectResults.push([
      { id: TEST_APP_ID, userId: TEST_USER_ID, name: 'My App' },
    ]);
    // buildSystemPrompt: list types
    selectResults.push([]);

    // Anthropic calls delete_type on a type not in this app
    anthropicResponses.push({
      content: [
        {
          type: 'tool_use',
          id: 'toolu_del',
          name: 'delete_type',
          input: { type_id: 'not-in-this-app' },
        },
      ],
      stop_reason: 'tool_use',
    });

    // Tool execution: type not found for this app
    selectResults.push([]);

    // Anthropic responds
    anthropicResponses.push({
      content: [{ type: 'text', text: 'That type does not exist.' }],
      stop_reason: 'end_turn',
    });

    const res = await app.request(
      jsonRequest(
        'POST',
        `/api/apps/${TEST_APP_ID}/chat`,
        {
          messages: [{ role: 'user', content: 'Delete the Projects type' }],
        },
        `auth_token=${token}`,
      ),
    );

    expect(res.status).toBe(200);

    const events = await parseSSEEvents(res);
    const toolResultEvents = events.filter(
      (e) => e.type === 'tool_result',
    );

    expect(toolResultEvents.length).toBe(1);
    expect(toolResultEvents[0].success).toBe(false);
    expect(toolResultEvents[0].error).toBe('Type not found');
    // Verify no delete was actually performed
    expect(deleteCount).toBe(0);
  });
});
