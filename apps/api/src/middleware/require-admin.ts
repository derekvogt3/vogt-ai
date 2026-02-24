import { HTTPException } from 'hono/http-exception';
import type { Context, Next } from 'hono';

export async function requireAdmin(c: Context, next: Next) {
  const payload = c.get('jwtPayload');
  if (!payload || payload.role !== 'admin') {
    throw new HTTPException(403, { message: 'Admin access required' });
  }
  return next();
}
