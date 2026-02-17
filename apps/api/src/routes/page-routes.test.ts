import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { jwt, sign } from 'hono/jwt';
import { HTTPException } from 'hono/http-exception';
import { ZodError } from 'zod';

const TEST_JWT_SECRET = 'test-secret-key-that-is-at-least-32-characters';
const TEST_USER_ID = '123e4567-e89b-12d3-a456-426614174000';
const TEST_APP_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const TEST_PAGE_ID = 'b0b0b0b0-c1c1-d2d2-e3e3-f4f4f4f4f4f4';
const TEST_VERSION_ID = 'a1a1a1a1-b2b2-c3c3-d4d4-e5e5e5e5e5e5';

// Queue to control what db queries return
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

const { pageRoutes } = await import('./page-routes.js');

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

  app.route('/api/apps', pageRoutes);
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

const DEFAULT_CONFIG = {
  root: { id: 'root', type: 'Container', props: { padding: 'md', maxWidth: '5xl' }, children: [] },
};

const MOCK_PAGE = {
  id: TEST_PAGE_ID,
  appId: TEST_APP_ID,
  name: 'Dashboard',
  slug: 'dashboard',
  description: null,
  config: DEFAULT_CONFIG,
  isHome: false,
  published: false,
  position: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
};

// --- Tests ---

describe('Page Routes - Auth Protection', () => {
  it('returns 401 without auth token', async () => {
    const app = createApp();
    const res = await app.request(
      jsonRequest('GET', `/api/apps/${TEST_APP_ID}/pages`),
    );
    expect(res.status).toBe(401);
  });
});

describe('POST /api/apps/:appId/pages', () => {
  beforeEach(() => {
    selectResults = [];
    insertResults = [];
    updateResults = [];
    deleteCount = 0;
  });

  it('creates a new page', async () => {
    const app = createApp();
    const token = await getAuthToken();

    // getAppForUser
    selectResults.push([{ id: TEST_APP_ID, userId: TEST_USER_ID, name: 'My App' }]);
    // count existing pages for position
    selectResults.push([]);
    // insert page
    insertResults.push([MOCK_PAGE]);

    const res = await app.request(
      jsonRequest(
        'POST',
        `/api/apps/${TEST_APP_ID}/pages`,
        { name: 'Dashboard', slug: 'dashboard' },
        `auth_token=${token}`,
      ),
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.page.name).toBe('Dashboard');
    expect(body.page.slug).toBe('dashboard');
  });

  it('returns 404 for app owned by another user', async () => {
    const app = createApp();
    const token = await getAuthToken();

    // getAppForUser — not found
    selectResults.push([]);

    const res = await app.request(
      jsonRequest(
        'POST',
        `/api/apps/${TEST_APP_ID}/pages`,
        { name: 'Dashboard', slug: 'dashboard' },
        `auth_token=${token}`,
      ),
    );

    expect(res.status).toBe(404);
  });

  it('returns 400 for invalid slug', async () => {
    const app = createApp();
    const token = await getAuthToken();

    // getAppForUser
    selectResults.push([{ id: TEST_APP_ID, userId: TEST_USER_ID, name: 'My App' }]);

    const res = await app.request(
      jsonRequest(
        'POST',
        `/api/apps/${TEST_APP_ID}/pages`,
        { name: 'Dashboard', slug: 'Invalid Slug!' },
        `auth_token=${token}`,
      ),
    );

    expect(res.status).toBe(400);
  });
});

describe('GET /api/apps/:appId/pages', () => {
  beforeEach(() => {
    selectResults = [];
    insertResults = [];
    updateResults = [];
    deleteCount = 0;
  });

  it('lists pages for an app', async () => {
    const app = createApp();
    const token = await getAuthToken();

    // getAppForUser
    selectResults.push([{ id: TEST_APP_ID, userId: TEST_USER_ID, name: 'My App' }]);
    // list pages
    selectResults.push([MOCK_PAGE]);

    const res = await app.request(
      jsonRequest(
        'GET',
        `/api/apps/${TEST_APP_ID}/pages`,
        undefined,
        `auth_token=${token}`,
      ),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pages).toHaveLength(1);
    expect(body.pages[0].name).toBe('Dashboard');
  });
});

describe('GET /api/apps/:appId/pages/by-slug/:slug', () => {
  beforeEach(() => {
    selectResults = [];
    insertResults = [];
    updateResults = [];
    deleteCount = 0;
  });

  it('gets a page by slug', async () => {
    const app = createApp();
    const token = await getAuthToken();

    // getAppForUser
    selectResults.push([{ id: TEST_APP_ID, userId: TEST_USER_ID, name: 'My App' }]);
    // find by slug
    selectResults.push([MOCK_PAGE]);

    const res = await app.request(
      jsonRequest(
        'GET',
        `/api/apps/${TEST_APP_ID}/pages/by-slug/dashboard`,
        undefined,
        `auth_token=${token}`,
      ),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.page.slug).toBe('dashboard');
  });

  it('returns 404 for non-existent slug', async () => {
    const app = createApp();
    const token = await getAuthToken();

    // getAppForUser
    selectResults.push([{ id: TEST_APP_ID, userId: TEST_USER_ID, name: 'My App' }]);
    // find by slug — empty
    selectResults.push([]);

    const res = await app.request(
      jsonRequest(
        'GET',
        `/api/apps/${TEST_APP_ID}/pages/by-slug/nonexistent`,
        undefined,
        `auth_token=${token}`,
      ),
    );

    expect(res.status).toBe(404);
  });
});

describe('GET /api/apps/:appId/pages/:pageId', () => {
  beforeEach(() => {
    selectResults = [];
    insertResults = [];
    updateResults = [];
    deleteCount = 0;
  });

  it('gets a page by ID', async () => {
    const app = createApp();
    const token = await getAuthToken();

    // getAppForUser
    selectResults.push([{ id: TEST_APP_ID, userId: TEST_USER_ID, name: 'My App' }]);
    // getPageForApp
    selectResults.push([MOCK_PAGE]);

    const res = await app.request(
      jsonRequest(
        'GET',
        `/api/apps/${TEST_APP_ID}/pages/${TEST_PAGE_ID}`,
        undefined,
        `auth_token=${token}`,
      ),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.page.id).toBe(TEST_PAGE_ID);
  });
});

describe('PUT /api/apps/:appId/pages/:pageId', () => {
  beforeEach(() => {
    selectResults = [];
    insertResults = [];
    updateResults = [];
    deleteCount = 0;
  });

  it('updates a page and creates a version when config changes', async () => {
    const app = createApp();
    const token = await getAuthToken();

    const newConfig = {
      root: { id: 'root', type: 'Container', props: { padding: 'lg' }, children: [] },
    };

    // getAppForUser
    selectResults.push([{ id: TEST_APP_ID, userId: TEST_USER_ID, name: 'My App' }]);
    // getPageForApp
    selectResults.push([MOCK_PAGE]);
    // insert version (auto-created when config changes)
    insertResults.push([{ id: TEST_VERSION_ID }]);
    // update page
    updateResults.push([{ ...MOCK_PAGE, config: newConfig }]);

    const res = await app.request(
      jsonRequest(
        'PUT',
        `/api/apps/${TEST_APP_ID}/pages/${TEST_PAGE_ID}`,
        { config: newConfig },
        `auth_token=${token}`,
      ),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.page.config.root.props.padding).toBe('lg');
  });

  it('updates page without creating version when only name changes', async () => {
    const app = createApp();
    const token = await getAuthToken();

    // getAppForUser
    selectResults.push([{ id: TEST_APP_ID, userId: TEST_USER_ID, name: 'My App' }]);
    // getPageForApp
    selectResults.push([MOCK_PAGE]);
    // update page (no version insert because no config change)
    updateResults.push([{ ...MOCK_PAGE, name: 'New Name' }]);

    const res = await app.request(
      jsonRequest(
        'PUT',
        `/api/apps/${TEST_APP_ID}/pages/${TEST_PAGE_ID}`,
        { name: 'New Name' },
        `auth_token=${token}`,
      ),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.page.name).toBe('New Name');
  });
});

describe('DELETE /api/apps/:appId/pages/:pageId', () => {
  beforeEach(() => {
    selectResults = [];
    insertResults = [];
    updateResults = [];
    deleteCount = 0;
  });

  it('deletes a page', async () => {
    const app = createApp();
    const token = await getAuthToken();

    // getAppForUser
    selectResults.push([{ id: TEST_APP_ID, userId: TEST_USER_ID, name: 'My App' }]);
    // getPageForApp
    selectResults.push([MOCK_PAGE]);

    const res = await app.request(
      jsonRequest(
        'DELETE',
        `/api/apps/${TEST_APP_ID}/pages/${TEST_PAGE_ID}`,
        undefined,
        `auth_token=${token}`,
      ),
    );

    expect(res.status).toBe(200);
    expect(deleteCount).toBe(1);
  });
});

describe('GET /api/apps/:appId/pages/:pageId/versions', () => {
  beforeEach(() => {
    selectResults = [];
    insertResults = [];
    updateResults = [];
    deleteCount = 0;
  });

  it('lists versions for a page', async () => {
    const app = createApp();
    const token = await getAuthToken();

    const mockVersion = {
      id: TEST_VERSION_ID,
      pageId: TEST_PAGE_ID,
      config: DEFAULT_CONFIG,
      createdBy: TEST_USER_ID,
      note: null,
      createdAt: new Date(),
    };

    // getAppForUser
    selectResults.push([{ id: TEST_APP_ID, userId: TEST_USER_ID, name: 'My App' }]);
    // getPageForApp
    selectResults.push([MOCK_PAGE]);
    // list versions
    selectResults.push([mockVersion]);

    const res = await app.request(
      jsonRequest(
        'GET',
        `/api/apps/${TEST_APP_ID}/pages/${TEST_PAGE_ID}/versions`,
        undefined,
        `auth_token=${token}`,
      ),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.versions).toHaveLength(1);
  });
});

describe('POST /api/apps/:appId/pages/:pageId/versions/:versionId/restore', () => {
  beforeEach(() => {
    selectResults = [];
    insertResults = [];
    updateResults = [];
    deleteCount = 0;
  });

  it('restores a previous version', async () => {
    const app = createApp();
    const token = await getAuthToken();

    const oldConfig = {
      root: { id: 'root', type: 'Container', props: { padding: 'sm' }, children: [] },
    };

    const mockVersion = {
      id: TEST_VERSION_ID,
      pageId: TEST_PAGE_ID,
      config: oldConfig,
      createdBy: TEST_USER_ID,
      note: null,
      createdAt: new Date(),
    };

    // getAppForUser
    selectResults.push([{ id: TEST_APP_ID, userId: TEST_USER_ID, name: 'My App' }]);
    // getPageForApp
    selectResults.push([MOCK_PAGE]);
    // find version
    selectResults.push([mockVersion]);
    // insert auto-save version (current config before restore)
    insertResults.push([{ id: 'auto-save-version-id' }]);
    // update page with restored config
    updateResults.push([{ ...MOCK_PAGE, config: oldConfig }]);

    const res = await app.request(
      jsonRequest(
        'POST',
        `/api/apps/${TEST_APP_ID}/pages/${TEST_PAGE_ID}/versions/${TEST_VERSION_ID}/restore`,
        undefined,
        `auth_token=${token}`,
      ),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.page.config.root.props.padding).toBe('sm');
  });

  it('returns 404 for non-existent version', async () => {
    const app = createApp();
    const token = await getAuthToken();

    // getAppForUser
    selectResults.push([{ id: TEST_APP_ID, userId: TEST_USER_ID, name: 'My App' }]);
    // getPageForApp
    selectResults.push([MOCK_PAGE]);
    // find version — not found
    selectResults.push([]);

    const res = await app.request(
      jsonRequest(
        'POST',
        `/api/apps/${TEST_APP_ID}/pages/${TEST_PAGE_ID}/versions/${TEST_VERSION_ID}/restore`,
        undefined,
        `auth_token=${token}`,
      ),
    );

    expect(res.status).toBe(404);
  });
});
