import { HTTPException } from 'hono/http-exception';
import type { Context, Next } from 'hono';
import { eq, and } from 'drizzle-orm';
import { db } from '../db.js';
import { services, userServices } from '../schema.js';

export function requireService(serviceSlug: string) {
  return async (c: Context, next: Next) => {
    const payload = c.get('jwtPayload');
    if (!payload) {
      throw new HTTPException(401, { message: 'Authentication required' });
    }

    // Admins bypass service access checks
    if (payload.role === 'admin') {
      return next();
    }

    const userId = payload.sub;

    const rows = await db
      .select({ id: userServices.id })
      .from(userServices)
      .innerJoin(services, eq(userServices.serviceId, services.id))
      .where(
        and(
          eq(userServices.userId, userId),
          eq(services.slug, serviceSlug),
          eq(services.enabled, true),
        ),
      )
      .limit(1);

    if (rows.length === 0) {
      throw new HTTPException(403, { message: 'Service access required' });
    }

    return next();
  };
}
