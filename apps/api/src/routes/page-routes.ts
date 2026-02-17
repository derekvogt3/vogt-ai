import { Hono } from 'hono';
import { z } from 'zod';
import { eq, and, asc, desc } from 'drizzle-orm';
import { db } from '../db.js';
import { pages, pageVersions } from '../schema.js';
import { getUserId, getAppForUser, getPageForApp } from './route-helpers.js';

const createPageSchema = z.object({
  name: z.string().min(1).max(255),
  slug: z.string().min(1).max(255).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
  description: z.string().optional(),
});

const updatePageSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  slug: z.string().min(1).max(255).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens').optional(),
  description: z.string().optional(),
  config: z.record(z.unknown()).optional(),
  published: z.boolean().optional(),
  isHome: z.boolean().optional(),
});

export const pageRoutes = new Hono();

// Create page
pageRoutes.post('/:appId/pages', async (c) => {
  const userId = getUserId(c);
  const app = await getAppForUser(c.req.param('appId'), userId);
  const body = createPageSchema.parse(await c.req.json());

  // Auto-assign position
  const existing = await db
    .select()
    .from(pages)
    .where(eq(pages.appId, app.id));
  const position = existing.length;

  const [page] = await db
    .insert(pages)
    .values({ ...body, appId: app.id, position })
    .returning();

  return c.json({ page }, 201);
});

// List pages for app
pageRoutes.get('/:appId/pages', async (c) => {
  const userId = getUserId(c);
  const app = await getAppForUser(c.req.param('appId'), userId);

  const result = await db
    .select()
    .from(pages)
    .where(eq(pages.appId, app.id))
    .orderBy(asc(pages.position));

  return c.json({ pages: result });
});

// Get page by slug (MUST be before /:pageId to avoid param conflict)
pageRoutes.get('/:appId/pages/by-slug/:slug', async (c) => {
  const userId = getUserId(c);
  const app = await getAppForUser(c.req.param('appId'), userId);

  const [page] = await db
    .select()
    .from(pages)
    .where(and(eq(pages.appId, app.id), eq(pages.slug, c.req.param('slug'))))
    .limit(1);

  if (!page) {
    return c.json({ error: 'Page not found' }, 404);
  }

  return c.json({ page });
});

// Get page by ID
pageRoutes.get('/:appId/pages/:pageId', async (c) => {
  const userId = getUserId(c);
  const app = await getAppForUser(c.req.param('appId'), userId);
  const page = await getPageForApp(c.req.param('pageId'), app.id);

  return c.json({ page });
});

// Update page (auto-creates version)
pageRoutes.put('/:appId/pages/:pageId', async (c) => {
  const userId = getUserId(c);
  const app = await getAppForUser(c.req.param('appId'), userId);
  const page = await getPageForApp(c.req.param('pageId'), app.id);
  const body = updatePageSchema.parse(await c.req.json());

  // Auto-create version snapshot before updating
  if (body.config) {
    await db.insert(pageVersions).values({
      pageId: page.id,
      config: page.config,
      createdBy: userId,
    });
  }

  const [updated] = await db
    .update(pages)
    .set({ ...body, updatedAt: new Date() })
    .where(eq(pages.id, page.id))
    .returning();

  return c.json({ page: updated });
});

// Delete page
pageRoutes.delete('/:appId/pages/:pageId', async (c) => {
  const userId = getUserId(c);
  const app = await getAppForUser(c.req.param('appId'), userId);
  const page = await getPageForApp(c.req.param('pageId'), app.id);

  await db.delete(pages).where(eq(pages.id, page.id));
  return c.json({ success: true });
});

// List page versions
pageRoutes.get('/:appId/pages/:pageId/versions', async (c) => {
  const userId = getUserId(c);
  const app = await getAppForUser(c.req.param('appId'), userId);
  const page = await getPageForApp(c.req.param('pageId'), app.id);

  const versions = await db
    .select()
    .from(pageVersions)
    .where(eq(pageVersions.pageId, page.id))
    .orderBy(desc(pageVersions.createdAt));

  return c.json({ versions });
});

// Restore a page version
pageRoutes.post('/:appId/pages/:pageId/versions/:versionId/restore', async (c) => {
  const userId = getUserId(c);
  const app = await getAppForUser(c.req.param('appId'), userId);
  const page = await getPageForApp(c.req.param('pageId'), app.id);

  const [version] = await db
    .select()
    .from(pageVersions)
    .where(
      and(
        eq(pageVersions.id, c.req.param('versionId')),
        eq(pageVersions.pageId, page.id),
      ),
    )
    .limit(1);

  if (!version) {
    return c.json({ error: 'Version not found' }, 404);
  }

  // Create a version of the current config before restoring
  await db.insert(pageVersions).values({
    pageId: page.id,
    config: page.config,
    createdBy: userId,
    note: 'Auto-saved before restore',
  });

  // Restore
  const [updated] = await db
    .update(pages)
    .set({ config: version.config, updatedAt: new Date() })
    .where(eq(pages.id, page.id))
    .returning();

  return c.json({ page: updated });
});
