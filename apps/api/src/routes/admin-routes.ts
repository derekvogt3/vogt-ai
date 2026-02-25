import { Hono } from 'hono';
import { z } from 'zod';
import { eq, and, sql } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import crypto from 'crypto';
import { db } from '../db.js';
import { users, inviteCodes, services, userServices } from '../schema.js';
import { requireAdmin } from '../middleware/require-admin.js';

export const adminRoutes = new Hono();

// All admin routes require admin role
adminRoutes.use('*', requireAdmin);

// ===================== USERS =====================

// GET /users — list all users with their service assignments
adminRoutes.get('/users', async (c) => {
  const allUsers = await db
    .select({
      id: users.id,
      email: users.email,
      role: users.role,
      createdAt: users.createdAt,
    })
    .from(users)
    .orderBy(users.createdAt);

  // Get service assignments for each user
  const assignments = await db
    .select({
      userId: userServices.userId,
      serviceId: services.id,
      serviceName: services.name,
      serviceSlug: services.slug,
    })
    .from(userServices)
    .innerJoin(services, eq(userServices.serviceId, services.id));

  const assignmentMap = new Map<string, Array<{ id: string; name: string; slug: string }>>();
  for (const a of assignments) {
    if (!assignmentMap.has(a.userId)) assignmentMap.set(a.userId, []);
    assignmentMap.get(a.userId)!.push({ id: a.serviceId, name: a.serviceName, slug: a.serviceSlug });
  }

  return c.json({
    users: allUsers.map((u) => ({
      ...u,
      services: assignmentMap.get(u.id) ?? [],
    })),
  });
});

// DELETE /users/:id — delete a user and their service assignments
adminRoutes.delete('/users/:id', async (c) => {
  const id = c.req.param('id');
  const payload = c.get('jwtPayload');

  if (id === payload.sub) {
    throw new HTTPException(400, { message: 'Cannot delete your own account' });
  }

  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.id, id)).limit(1);
  if (!existing) {
    throw new HTTPException(404, { message: 'User not found' });
  }

  await db.delete(userServices).where(eq(userServices.userId, id));
  await db.delete(users).where(eq(users.id, id));

  return c.json({ success: true });
});

// PATCH /users/:id/role — change user role
const roleSchema = z.object({
  role: z.enum(['admin', 'user']),
});

adminRoutes.patch('/users/:id/role', async (c) => {
  const id = c.req.param('id');
  const body = roleSchema.parse(await c.req.json());

  // Last-admin guard: prevent demoting the only admin
  if (body.role === 'user') {
    const [{ adminCount }] = await db
      .select({ adminCount: sql<number>`count(*)::int` })
      .from(users)
      .where(eq(users.role, 'admin'));

    if (adminCount <= 1) {
      throw new HTTPException(400, { message: 'Cannot demote the last admin' });
    }
  }

  const [updated] = await db
    .update(users)
    .set({ role: body.role })
    .where(eq(users.id, id))
    .returning({ id: users.id, email: users.email, role: users.role });

  if (!updated) {
    throw new HTTPException(404, { message: 'User not found' });
  }

  return c.json({ user: updated });
});

// ===================== INVITE CODES =====================

// POST /invite-codes — generate a new invite code
const inviteCodeSchema = z.object({
  expiresInDays: z.number().int().min(1).max(365).optional(),
});

adminRoutes.post('/invite-codes', async (c) => {
  const body = inviteCodeSchema.parse(await c.req.json().catch(() => ({})));
  const payload = c.get('jwtPayload');

  const code = crypto.randomBytes(6).toString('hex').toUpperCase(); // 12 chars like "A3B9F2E1C4D7"
  const expiresAt = body.expiresInDays
    ? new Date(Date.now() + body.expiresInDays * 24 * 60 * 60 * 1000)
    : null;

  const [invite] = await db
    .insert(inviteCodes)
    .values({
      code,
      createdBy: payload.sub,
      expiresAt,
    })
    .returning();

  return c.json({ inviteCode: invite }, 201);
});

// GET /invite-codes — list all invite codes
adminRoutes.get('/invite-codes', async (c) => {
  const codes = await db
    .select({
      id: inviteCodes.id,
      code: inviteCodes.code,
      createdBy: inviteCodes.createdBy,
      usedBy: inviteCodes.usedBy,
      usedAt: inviteCodes.usedAt,
      expiresAt: inviteCodes.expiresAt,
      createdAt: inviteCodes.createdAt,
    })
    .from(inviteCodes)
    .orderBy(sql`${inviteCodes.createdAt} DESC`);

  // Enrich with user emails
  const userIds = new Set([
    ...codes.map((c) => c.createdBy),
    ...codes.filter((c) => c.usedBy).map((c) => c.usedBy!),
  ]);

  const userRows = userIds.size > 0
    ? await db
        .select({ id: users.id, email: users.email })
        .from(users)
        .where(sql`${users.id} = ANY(${sql.raw(`ARRAY[${[...userIds].map((id) => `'${id}'`).join(',')}]::uuid[]`)})`)
    : [];

  const emailMap = new Map(userRows.map((u) => [u.id, u.email]));

  return c.json({
    inviteCodes: codes.map((code) => ({
      ...code,
      createdByEmail: emailMap.get(code.createdBy) ?? null,
      usedByEmail: code.usedBy ? emailMap.get(code.usedBy) ?? null : null,
    })),
  });
});

// DELETE /invite-codes/:id — revoke an unused invite code
adminRoutes.delete('/invite-codes/:id', async (c) => {
  const id = c.req.param('id');

  // Only delete if unused
  const [deleted] = await db
    .delete(inviteCodes)
    .where(and(eq(inviteCodes.id, id), sql`${inviteCodes.usedBy} IS NULL`))
    .returning({ id: inviteCodes.id });

  if (!deleted) {
    throw new HTTPException(404, { message: 'Invite code not found or already used' });
  }

  return c.json({ success: true });
});

// ===================== SERVICES =====================

// GET /services — list all services
adminRoutes.get('/services', async (c) => {
  const allServices = await db
    .select()
    .from(services)
    .orderBy(services.name);

  return c.json({ services: allServices });
});

// ===================== USER SERVICE ACCESS =====================

// POST /users/:userId/services/:serviceId — grant service access
adminRoutes.post('/users/:userId/services/:serviceId', async (c) => {
  const userId = c.req.param('userId');
  const serviceId = c.req.param('serviceId');
  const payload = c.get('jwtPayload');

  // Check user exists
  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new HTTPException(404, { message: 'User not found' });

  // Check service exists
  const [service] = await db.select({ id: services.id }).from(services).where(eq(services.id, serviceId)).limit(1);
  if (!service) throw new HTTPException(404, { message: 'Service not found' });

  // Check not already assigned
  const [existing] = await db
    .select({ id: userServices.id })
    .from(userServices)
    .where(and(eq(userServices.userId, userId), eq(userServices.serviceId, serviceId)))
    .limit(1);

  if (existing) {
    return c.json({ message: 'Service already assigned' });
  }

  await db.insert(userServices).values({
    userId,
    serviceId,
    grantedBy: payload.sub,
  });

  return c.json({ success: true }, 201);
});

// DELETE /users/:userId/services/:serviceId — revoke service access
adminRoutes.delete('/users/:userId/services/:serviceId', async (c) => {
  const userId = c.req.param('userId');
  const serviceId = c.req.param('serviceId');

  const [deleted] = await db
    .delete(userServices)
    .where(and(eq(userServices.userId, userId), eq(userServices.serviceId, serviceId)))
    .returning({ id: userServices.id });

  if (!deleted) {
    throw new HTTPException(404, { message: 'Service assignment not found' });
  }

  return c.json({ success: true });
});
