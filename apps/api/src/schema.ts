import { pgTable, uuid, varchar, timestamp, text, boolean, unique } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  role: varchar('role', { length: 20 }).notNull().default('user'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const inviteCodes = pgTable('invite_codes', {
  id: uuid('id').defaultRandom().primaryKey(),
  code: varchar('code', { length: 50 }).notNull().unique(),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  usedBy: uuid('used_by').references(() => users.id),
  usedAt: timestamp('used_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const services = pgTable('services', {
  id: uuid('id').defaultRandom().primaryKey(),
  slug: varchar('slug', { length: 100 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  icon: varchar('icon', { length: 50 }),
  route: varchar('route', { length: 255 }).notNull(),
  enabled: boolean('enabled').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const userServices = pgTable('user_services', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  serviceId: uuid('service_id').notNull().references(() => services.id, { onDelete: 'cascade' }),
  grantedBy: uuid('granted_by').notNull().references(() => users.id),
  grantedAt: timestamp('granted_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  unique().on(table.userId, table.serviceId),
]);