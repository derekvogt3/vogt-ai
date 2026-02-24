import { Hono } from 'hono';
import { z } from 'zod';
import { sign } from 'hono/jwt';
import { setCookie, deleteCookie } from 'hono/cookie';
import { eq, and, isNull } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { HTTPException } from 'hono/http-exception';
import { db } from '../db.js';
import { users, inviteCodes } from '../schema.js';
import { env } from '../env.js';

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  inviteCode: z.string().min(1, 'Invite code is required'),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const authRoutes = new Hono();

async function setAuthCookie(c: any, userId: string, email: string, role: string) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: userId,
    email,
    role,
    iat: now,
    exp: now + 60 * 60 * 24 * 7, // 7 days
  };
  const token = await sign(payload, env.JWT_SECRET, 'HS256');
  setCookie(c, 'auth_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });
}

authRoutes.post('/register', async (c) => {
  const body = registerSchema.parse(await c.req.json());

  // Validate invite code
  const [invite] = await db
    .select()
    .from(inviteCodes)
    .where(and(eq(inviteCodes.code, body.inviteCode), isNull(inviteCodes.usedBy)))
    .limit(1);

  if (!invite) {
    throw new HTTPException(400, { message: 'Invalid or already used invite code' });
  }

  // Check expiration
  if (invite.expiresAt && new Date(invite.expiresAt) < new Date()) {
    throw new HTTPException(400, { message: 'Invite code has expired' });
  }

  // Check if email already registered
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, body.email))
    .limit(1);

  if (existing.length > 0) {
    throw new HTTPException(409, { message: 'Email already registered' });
  }

  const passwordHash = await bcrypt.hash(body.password, 12);

  const [newUser] = await db
    .insert(users)
    .values({ email: body.email, passwordHash, role: 'user' })
    .returning({ id: users.id, email: users.email, role: users.role });

  // Mark invite code as used
  await db
    .update(inviteCodes)
    .set({ usedBy: newUser.id, usedAt: new Date() })
    .where(eq(inviteCodes.id, invite.id));

  await setAuthCookie(c, newUser.id, newUser.email, newUser.role);
  return c.json({ user: { id: newUser.id, email: newUser.email, role: newUser.role } }, 201);
});

authRoutes.post('/login', async (c) => {
  const body = loginSchema.parse(await c.req.json());

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, body.email))
    .limit(1);

  if (!user || !(await bcrypt.compare(body.password, user.passwordHash))) {
    throw new HTTPException(401, { message: 'Invalid email or password' });
  }

  await setAuthCookie(c, user.id, user.email, user.role);
  return c.json({ user: { id: user.id, email: user.email, role: user.role } });
});

authRoutes.post('/logout', (c) => {
  deleteCookie(c, 'auth_token', { path: '/' });
  return c.json({ success: true });
});

authRoutes.get('/me', async (c) => {
  const payload = c.get('jwtPayload');

  const [user] = await db
    .select({ id: users.id, email: users.email, role: users.role, createdAt: users.createdAt })
    .from(users)
    .where(eq(users.id, payload.sub))
    .limit(1);

  if (!user) {
    throw new HTTPException(404, { message: 'User not found' });
  }

  return c.json({ user });
});
