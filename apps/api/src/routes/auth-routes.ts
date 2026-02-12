import { Hono } from 'hono';
import { z } from 'zod';
import { sign } from 'hono/jwt';
import { setCookie, deleteCookie } from 'hono/cookie';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { HTTPException } from 'hono/http-exception';
import { db } from '../db.js';
import { users } from '../schema.js';
import { env } from '../env.js';

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const authRoutes = new Hono();

async function setAuthCookie(c: any, userId: string, email: string) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: userId,
    email,
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
    .values({ email: body.email, passwordHash })
    .returning({ id: users.id, email: users.email });

  await setAuthCookie(c, newUser.id, newUser.email);
  return c.json({ user: { id: newUser.id, email: newUser.email } }, 201);
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

  await setAuthCookie(c, user.id, user.email);
  return c.json({ user: { id: user.id, email: user.email } });
});

authRoutes.post('/logout', (c) => {
  deleteCookie(c, 'auth_token', { path: '/' });
  return c.json({ success: true });
});

authRoutes.get('/me', async (c) => {
  const payload = c.get('jwtPayload');

  const [user] = await db
    .select({ id: users.id, email: users.email, createdAt: users.createdAt })
    .from(users)
    .where(eq(users.id, payload.sub))
    .limit(1);

  if (!user) {
    throw new HTTPException(404, { message: 'User not found' });
  }

  return c.json({ user });
});
