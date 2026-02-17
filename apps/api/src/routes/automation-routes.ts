import { Hono } from 'hono';
import { z } from 'zod';
import { eq, and, desc, sql } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import { db } from '../db.js';
import { automations, automationRuns } from '../schema.js';
import { getUserId, getAppForUser } from './route-helpers.js';
import { runAutomation } from '../automation-runner.js';

export const automationRoutes = new Hono();

const createSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  typeId: z.string().uuid(),
  trigger: z.enum(['record_created', 'record_updated', 'record_deleted', 'manual']),
  triggerConfig: z.record(z.unknown()).optional(),
  code: z.string().min(1),
  enabled: z.boolean().optional(),
});

const updateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  trigger: z.enum(['record_created', 'record_updated', 'record_deleted', 'manual']).optional(),
  triggerConfig: z.record(z.unknown()).optional(),
  code: z.string().min(1).optional(),
  enabled: z.boolean().optional(),
});

async function getAutomationForApp(automationId: string, appId: string) {
  const [automation] = await db
    .select()
    .from(automations)
    .where(and(eq(automations.id, automationId), eq(automations.appId, appId)))
    .limit(1);
  if (!automation) throw new HTTPException(404, { message: 'Automation not found' });
  return automation;
}

// Create automation
automationRoutes.post('/:appId/automations', async (c) => {
  const userId = getUserId(c);
  const app = await getAppForUser(c.req.param('appId'), userId);
  const body = createSchema.parse(await c.req.json());

  const [automation] = await db
    .insert(automations)
    .values({
      appId: app.id,
      typeId: body.typeId,
      name: body.name,
      description: body.description ?? null,
      trigger: body.trigger,
      triggerConfig: body.triggerConfig ?? {},
      code: body.code,
      enabled: body.enabled ?? true,
      createdBy: userId,
    })
    .returning();

  return c.json({ automation }, 201);
});

// List automations for app (optionally filter by typeId)
automationRoutes.get('/:appId/automations', async (c) => {
  const userId = getUserId(c);
  const app = await getAppForUser(c.req.param('appId'), userId);
  const typeId = c.req.query('typeId');

  let query = db
    .select()
    .from(automations)
    .where(eq(automations.appId, app.id))
    .orderBy(desc(automations.createdAt));

  if (typeId) {
    query = db
      .select()
      .from(automations)
      .where(and(eq(automations.appId, app.id), eq(automations.typeId, typeId)))
      .orderBy(desc(automations.createdAt));
  }

  const result = await query;
  return c.json({ automations: result });
});

// Get single automation
automationRoutes.get('/:appId/automations/:automationId', async (c) => {
  const userId = getUserId(c);
  const app = await getAppForUser(c.req.param('appId'), userId);
  const automation = await getAutomationForApp(c.req.param('automationId'), app.id);

  return c.json({ automation });
});

// Update automation
automationRoutes.put('/:appId/automations/:automationId', async (c) => {
  const userId = getUserId(c);
  const app = await getAppForUser(c.req.param('appId'), userId);
  await getAutomationForApp(c.req.param('automationId'), app.id);

  const body = updateSchema.parse(await c.req.json());
  const updateData: Record<string, unknown> = { updatedAt: new Date() };

  if (body.name !== undefined) updateData.name = body.name;
  if (body.description !== undefined) updateData.description = body.description;
  if (body.trigger !== undefined) updateData.trigger = body.trigger;
  if (body.triggerConfig !== undefined) updateData.triggerConfig = body.triggerConfig;
  if (body.code !== undefined) updateData.code = body.code;
  if (body.enabled !== undefined) updateData.enabled = body.enabled;

  const [updated] = await db
    .update(automations)
    .set(updateData)
    .where(eq(automations.id, c.req.param('automationId')))
    .returning();

  return c.json({ automation: updated });
});

// Delete automation
automationRoutes.delete('/:appId/automations/:automationId', async (c) => {
  const userId = getUserId(c);
  const app = await getAppForUser(c.req.param('appId'), userId);
  await getAutomationForApp(c.req.param('automationId'), app.id);

  await db.delete(automations).where(eq(automations.id, c.req.param('automationId')));
  return c.json({ success: true });
});

// Manual trigger (for testing)
automationRoutes.post('/:appId/automations/:automationId/run', async (c) => {
  const userId = getUserId(c);
  const app = await getAppForUser(c.req.param('appId'), userId);
  const automation = await getAutomationForApp(c.req.param('automationId'), app.id);

  const runId = await runAutomation(automation, null);

  return c.json({ runId });
});

// List runs for an automation (paginated)
automationRoutes.get('/:appId/automations/:automationId/runs', async (c) => {
  const userId = getUserId(c);
  const app = await getAppForUser(c.req.param('appId'), userId);
  await getAutomationForApp(c.req.param('automationId'), app.id);

  const page = Math.max(1, parseInt(c.req.query('page') || '1', 10));
  const pageSize = Math.min(50, Math.max(1, parseInt(c.req.query('pageSize') || '20', 10)));
  const offset = (page - 1) * pageSize;

  const [countResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(automationRuns)
    .where(eq(automationRuns.automationId, c.req.param('automationId')));

  const runs = await db
    .select()
    .from(automationRuns)
    .where(eq(automationRuns.automationId, c.req.param('automationId')))
    .orderBy(desc(automationRuns.createdAt))
    .limit(pageSize)
    .offset(offset);

  return c.json({
    runs,
    total: countResult.count,
    page,
    pageSize,
  });
});
