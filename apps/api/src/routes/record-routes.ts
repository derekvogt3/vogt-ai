import { Hono } from 'hono';
import { z } from 'zod';
import { eq, and, desc, sql } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import { db } from '../db.js';
import { fields, records } from '../schema.js';
import { getUserId, getAppForUser, getTypeForApp } from './route-helpers.js';
import { buildRecordSchema } from './record-validation.js';

export const recordRoutes = new Hono();

async function getFieldsForType(typeId: string) {
  return db.select().from(fields).where(eq(fields.typeId, typeId));
}

async function getRecordForType(recordId: string, typeId: string) {
  const [record] = await db
    .select()
    .from(records)
    .where(and(eq(records.id, recordId), eq(records.typeId, typeId)))
    .limit(1);
  if (!record) throw new HTTPException(404, { message: 'Record not found' });
  return record;
}

// Create record
recordRoutes.post('/:appId/types/:typeId/records', async (c) => {
  const userId = getUserId(c);
  const app = await getAppForUser(c.req.param('appId'), userId);
  const type = await getTypeForApp(c.req.param('typeId'), app.id);

  const typeFields = await getFieldsForType(type.id);
  const schema = buildRecordSchema(typeFields);
  const body = await c.req.json();
  const data = schema.parse(body.data ?? {});

  const [record] = await db
    .insert(records)
    .values({ typeId: type.id, data, createdBy: userId })
    .returning();

  return c.json({ record }, 201);
});

// List records (paginated)
recordRoutes.get('/:appId/types/:typeId/records', async (c) => {
  const userId = getUserId(c);
  const app = await getAppForUser(c.req.param('appId'), userId);
  const type = await getTypeForApp(c.req.param('typeId'), app.id);

  const page = Math.max(1, parseInt(c.req.query('page') || '1', 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(c.req.query('pageSize') || '50', 10)));
  const offset = (page - 1) * pageSize;

  const [countResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(records)
    .where(eq(records.typeId, type.id));

  const result = await db
    .select()
    .from(records)
    .where(eq(records.typeId, type.id))
    .orderBy(desc(records.createdAt))
    .limit(pageSize)
    .offset(offset);

  return c.json({
    records: result,
    total: countResult.count,
    page,
    pageSize,
  });
});

// Get single record
recordRoutes.get('/:appId/types/:typeId/records/:recordId', async (c) => {
  const userId = getUserId(c);
  const app = await getAppForUser(c.req.param('appId'), userId);
  const type = await getTypeForApp(c.req.param('typeId'), app.id);
  const record = await getRecordForType(c.req.param('recordId'), type.id);

  return c.json({ record });
});

// Update record (partial merge)
recordRoutes.put('/:appId/types/:typeId/records/:recordId', async (c) => {
  const userId = getUserId(c);
  const app = await getAppForUser(c.req.param('appId'), userId);
  const type = await getTypeForApp(c.req.param('typeId'), app.id);
  const existing = await getRecordForType(c.req.param('recordId'), type.id);

  const typeFields = await getFieldsForType(type.id);
  const partialSchema = buildRecordSchema(typeFields, true);
  const body = await c.req.json();
  const updates = partialSchema.parse(body.data ?? {});

  const mergedData = { ...(existing.data as Record<string, unknown>), ...updates };

  const [updated] = await db
    .update(records)
    .set({ data: mergedData, updatedAt: new Date() })
    .where(eq(records.id, existing.id))
    .returning();

  return c.json({ record: updated });
});

// Delete record
recordRoutes.delete('/:appId/types/:typeId/records/:recordId', async (c) => {
  const userId = getUserId(c);
  const app = await getAppForUser(c.req.param('appId'), userId);
  const type = await getTypeForApp(c.req.param('typeId'), app.id);
  const record = await getRecordForType(c.req.param('recordId'), type.id);

  await db.delete(records).where(eq(records.id, record.id));
  return c.json({ success: true });
});
