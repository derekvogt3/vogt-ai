import { Hono } from 'hono';
import { z } from 'zod';
import { eq, and, asc } from 'drizzle-orm';
import { db } from '../db.js';
import { apps, types, fields } from '../schema.js';
import { getUserId, getAppForUser, getTypeForApp, getFieldForType } from './route-helpers.js';

const fieldTypeEnum = z.enum([
  'text', 'rich_text', 'number', 'boolean', 'date',
  'select', 'multi_select', 'url', 'email', 'relation',
]);

const createAppSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  icon: z.string().max(50).optional(),
});

const updateAppSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  icon: z.string().max(50).optional(),
});

const createTypeSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  icon: z.string().max(50).optional(),
});

const updateTypeSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  icon: z.string().max(50).optional(),
});

const createFieldSchema = z.object({
  name: z.string().min(1).max(255),
  type: fieldTypeEnum,
  config: z.record(z.unknown()).default({}),
  required: z.boolean().default(false),
});

const updateFieldSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  config: z.record(z.unknown()).optional(),
  required: z.boolean().optional(),
});

const reorderFieldsSchema = z.object({
  fieldIds: z.array(z.string().uuid()),
});

export const appRoutes = new Hono();

// ============ APP CRUD ============

appRoutes.post('/', async (c) => {
  const userId = getUserId(c);
  const body = createAppSchema.parse(await c.req.json());

  const [app] = await db
    .insert(apps)
    .values({ ...body, userId })
    .returning();

  return c.json({ app }, 201);
});

appRoutes.get('/', async (c) => {
  const userId = getUserId(c);
  const result = await db
    .select()
    .from(apps)
    .where(eq(apps.userId, userId))
    .orderBy(asc(apps.createdAt));

  return c.json({ apps: result });
});

appRoutes.get('/:appId', async (c) => {
  const userId = getUserId(c);
  const app = await getAppForUser(c.req.param('appId'), userId);

  const appTypes = await db
    .select()
    .from(types)
    .where(eq(types.appId, app.id))
    .orderBy(asc(types.position));

  return c.json({ app, types: appTypes });
});

appRoutes.put('/:appId', async (c) => {
  const userId = getUserId(c);
  const app = await getAppForUser(c.req.param('appId'), userId);
  const body = updateAppSchema.parse(await c.req.json());

  const [updated] = await db
    .update(apps)
    .set({ ...body, updatedAt: new Date() })
    .where(eq(apps.id, app.id))
    .returning();

  return c.json({ app: updated });
});

appRoutes.delete('/:appId', async (c) => {
  const userId = getUserId(c);
  const app = await getAppForUser(c.req.param('appId'), userId);

  await db.delete(apps).where(eq(apps.id, app.id));
  return c.json({ success: true });
});

// ============ TYPE CRUD ============

appRoutes.post('/:appId/types', async (c) => {
  const userId = getUserId(c);
  const app = await getAppForUser(c.req.param('appId'), userId);
  const body = createTypeSchema.parse(await c.req.json());

  // Auto-assign position as next in sequence
  const existing = await db
    .select()
    .from(types)
    .where(eq(types.appId, app.id));
  const position = existing.length;

  const [type] = await db
    .insert(types)
    .values({ ...body, appId: app.id, position })
    .returning();

  return c.json({ type }, 201);
});

appRoutes.get('/:appId/types/:typeId', async (c) => {
  const userId = getUserId(c);
  const app = await getAppForUser(c.req.param('appId'), userId);
  const type = await getTypeForApp(c.req.param('typeId'), app.id);

  const typeFields = await db
    .select()
    .from(fields)
    .where(eq(fields.typeId, type.id))
    .orderBy(asc(fields.position));

  return c.json({ type, fields: typeFields });
});

appRoutes.put('/:appId/types/:typeId', async (c) => {
  const userId = getUserId(c);
  const app = await getAppForUser(c.req.param('appId'), userId);
  const type = await getTypeForApp(c.req.param('typeId'), app.id);
  const body = updateTypeSchema.parse(await c.req.json());

  const [updated] = await db
    .update(types)
    .set({ ...body, updatedAt: new Date() })
    .where(eq(types.id, type.id))
    .returning();

  return c.json({ type: updated });
});

appRoutes.delete('/:appId/types/:typeId', async (c) => {
  const userId = getUserId(c);
  const app = await getAppForUser(c.req.param('appId'), userId);
  const type = await getTypeForApp(c.req.param('typeId'), app.id);

  await db.delete(types).where(eq(types.id, type.id));
  return c.json({ success: true });
});

// ============ FIELD CRUD ============

appRoutes.post('/:appId/types/:typeId/fields', async (c) => {
  const userId = getUserId(c);
  const app = await getAppForUser(c.req.param('appId'), userId);
  const type = await getTypeForApp(c.req.param('typeId'), app.id);
  const body = createFieldSchema.parse(await c.req.json());

  // Auto-assign position
  const existing = await db
    .select()
    .from(fields)
    .where(eq(fields.typeId, type.id));
  const position = existing.length;

  const [field] = await db
    .insert(fields)
    .values({ ...body, typeId: type.id, position })
    .returning();

  return c.json({ field }, 201);
});

appRoutes.put('/:appId/types/:typeId/fields/reorder', async (c) => {
  const userId = getUserId(c);
  const app = await getAppForUser(c.req.param('appId'), userId);
  const type = await getTypeForApp(c.req.param('typeId'), app.id);
  const { fieldIds } = reorderFieldsSchema.parse(await c.req.json());

  // Update each field's position based on its index in the array
  await Promise.all(
    fieldIds.map((fieldId, index) =>
      db
        .update(fields)
        .set({ position: index })
        .where(and(eq(fields.id, fieldId), eq(fields.typeId, type.id)))
    )
  );

  const updatedFields = await db
    .select()
    .from(fields)
    .where(eq(fields.typeId, type.id))
    .orderBy(asc(fields.position));

  return c.json({ fields: updatedFields });
});

appRoutes.put('/:appId/types/:typeId/fields/:fieldId', async (c) => {
  const userId = getUserId(c);
  const app = await getAppForUser(c.req.param('appId'), userId);
  const type = await getTypeForApp(c.req.param('typeId'), app.id);
  const field = await getFieldForType(c.req.param('fieldId'), type.id);
  const body = updateFieldSchema.parse(await c.req.json());

  const [updated] = await db
    .update(fields)
    .set(body)
    .where(eq(fields.id, field.id))
    .returning();

  return c.json({ field: updated });
});

appRoutes.delete('/:appId/types/:typeId/fields/:fieldId', async (c) => {
  const userId = getUserId(c);
  const app = await getAppForUser(c.req.param('appId'), userId);
  const type = await getTypeForApp(c.req.param('typeId'), app.id);
  const field = await getFieldForType(c.req.param('fieldId'), type.id);

  await db.delete(fields).where(eq(fields.id, field.id));
  return c.json({ success: true });
});

