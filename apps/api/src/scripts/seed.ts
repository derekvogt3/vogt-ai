/**
 * Seed script — promotes a user to admin and seeds platform services.
 *
 * Usage:
 *   pnpm --filter @vogt-ai/api seed <email>
 *   pnpm --filter @vogt-ai/api seed <email> --reset-password <newpass>
 *
 * Or with explicit DATABASE_URL:
 *   DATABASE_URL="postgresql://..." tsx src/scripts/seed.ts <email>
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import postgres from 'postgres';
import { users, services, userServices } from '../schema.js';

const args = process.argv.slice(2);
const resetIdx = args.indexOf('--reset-password');
let resetPassword: string | null = null;
if (resetIdx !== -1) {
  resetPassword = args[resetIdx + 1] || null;
  args.splice(resetIdx, 2);
}
const email = args[0];

if (!email) {
  console.error('Usage: tsx src/scripts/seed.ts <email>');
  process.exit(1);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('Missing DATABASE_URL env var');
  process.exit(1);
}

const client = postgres(url);
const db = drizzle(client);

// --- Service definitions ---
// Add new services here as the platform grows.

const SERVICE_DEFINITIONS = [
  {
    slug: 'rlc-controls',
    name: 'RL Controls',
    description: 'Search 12,500+ indexed documents from the Hitachi Rail Dropbox',
    icon: '🔍',
    route: '/rlc',
  },
];

async function seed() {
  console.log(`\nSeeding platform for ${email}...\n`);

  // 1. Promote user to admin (and optionally reset password)
  const updateSet: Record<string, unknown> = { role: 'admin' };
  if (resetPassword) {
    updateSet.passwordHash = await bcrypt.hash(resetPassword, 12);
  }

  const [user] = await db
    .update(users)
    .set(updateSet)
    .where(eq(users.email, email))
    .returning({ id: users.id, email: users.email, role: users.role });

  if (!user) {
    console.error(`User not found with email: ${email}`);
    console.error('Register an account first, then run this script.');
    process.exit(1);
  }

  console.log(`Promoted ${user.email} to admin`);
  if (resetPassword) {
    console.log(`Reset password for ${user.email}`);
  }

  // 2. Seed services
  for (const def of SERVICE_DEFINITIONS) {
    const [created] = await db
      .insert(services)
      .values(def)
      .onConflictDoNothing({ target: services.slug })
      .returning();

    if (created) {
      console.log(`Created service: ${created.name} (${created.slug})`);
    } else {
      console.log(`Service already exists: ${def.slug}`);
    }

    // Get the service ID (whether just created or existing)
    const [svc] = await db
      .select({ id: services.id, name: services.name })
      .from(services)
      .where(eq(services.slug, def.slug))
      .limit(1);

    // 3. Grant admin access
    if (svc) {
      await db
        .insert(userServices)
        .values({
          userId: user.id,
          serviceId: svc.id,
          grantedBy: user.id,
        })
        .onConflictDoNothing();

      console.log(`Granted ${user.email} access to ${svc.name}`);
    }
  }

  console.log('\nSeed complete!\n');
  await client.end();
  process.exit(0);
}

seed().catch(async (err) => {
  console.error('Seed failed:', err);
  await client.end();
  process.exit(1);
});
