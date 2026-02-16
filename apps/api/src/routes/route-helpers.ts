import { eq, and } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import { db } from '../db.js';
import { apps, types, fields } from '../schema.js';

export async function getAppForUser(appId: string, userId: string) {
  const [app] = await db
    .select()
    .from(apps)
    .where(and(eq(apps.id, appId), eq(apps.userId, userId)))
    .limit(1);
  if (!app) throw new HTTPException(404, { message: 'App not found' });
  return app;
}

export async function getTypeForApp(typeId: string, appId: string) {
  const [type] = await db
    .select()
    .from(types)
    .where(and(eq(types.id, typeId), eq(types.appId, appId)))
    .limit(1);
  if (!type) throw new HTTPException(404, { message: 'Type not found' });
  return type;
}

export async function getFieldForType(fieldId: string, typeId: string) {
  const [field] = await db
    .select()
    .from(fields)
    .where(and(eq(fields.id, fieldId), eq(fields.typeId, typeId)))
    .limit(1);
  if (!field) throw new HTTPException(404, { message: 'Field not found' });
  return field;
}

export function getUserId(c: any): string {
  return c.get('jwtPayload').sub;
}
