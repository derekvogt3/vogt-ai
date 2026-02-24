import { Hono } from 'hono';
import { eq, and } from 'drizzle-orm';
import { db } from '../db.js';
import { services, userServices } from '../schema.js';

export const serviceRoutes = new Hono();

// GET /mine — list services the current user has access to
serviceRoutes.get('/mine', async (c) => {
  const payload = c.get('jwtPayload');
  const userId = payload.sub;

  // Admins get all enabled services
  if (payload.role === 'admin') {
    const allServices = await db
      .select({
        id: services.id,
        slug: services.slug,
        name: services.name,
        description: services.description,
        icon: services.icon,
        route: services.route,
      })
      .from(services)
      .where(eq(services.enabled, true))
      .orderBy(services.name);

    return c.json({ services: allServices });
  }

  // Regular users get only assigned services
  const userServiceList = await db
    .select({
      id: services.id,
      slug: services.slug,
      name: services.name,
      description: services.description,
      icon: services.icon,
      route: services.route,
    })
    .from(userServices)
    .innerJoin(services, and(eq(userServices.serviceId, services.id), eq(services.enabled, true)))
    .where(eq(userServices.userId, userId))
    .orderBy(services.name);

  return c.json({ services: userServiceList });
});
