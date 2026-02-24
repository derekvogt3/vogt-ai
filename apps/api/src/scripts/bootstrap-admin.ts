/**
 * Bootstrap script — promotes a user to admin and seeds the RLC Controls service.
 *
 * Usage:
 *   pnpm --filter @vogt-ai/api tsx src/scripts/bootstrap-admin.ts <email>
 *
 * Run this once after deploying the new schema to set up the first admin
 * and register the initial services.
 */

import { db } from '../db.js';
import { users, services, userServices } from '../schema.js';
import { eq, sql } from 'drizzle-orm';

const email = process.argv[2];

if (!email) {
  console.error('Usage: tsx src/scripts/bootstrap-admin.ts <email>');
  process.exit(1);
}

async function bootstrap() {
  console.log(`\n🔧 Bootstrapping admin for ${email}...\n`);

  // 1. Promote user to admin
  const [user] = await db
    .update(users)
    .set({ role: 'admin' })
    .where(eq(users.email, email))
    .returning({ id: users.id, email: users.email, role: users.role });

  if (!user) {
    console.error(`❌ User not found with email: ${email}`);
    console.error('   Register an account first, then run this script.');
    process.exit(1);
  }

  console.log(`✅ Promoted ${user.email} to admin`);

  // 2. Seed the RLC Controls service
  const [rlcService] = await db
    .insert(services)
    .values({
      slug: 'rlc-controls',
      name: 'RL Controls',
      description: 'Search 12,500+ indexed documents from the Hitachi Rail Dropbox',
      icon: '🔍',
      route: '/rlc',
    })
    .onConflictDoNothing({ target: services.slug })
    .returning();

  if (rlcService) {
    console.log(`✅ Created service: ${rlcService.name} (${rlcService.slug})`);
  } else {
    console.log('ℹ️  RLC Controls service already exists');
  }

  // Get the service ID (whether just created or existing)
  const [existingService] = await db
    .select({ id: services.id, name: services.name })
    .from(services)
    .where(eq(services.slug, 'rlc-controls'))
    .limit(1);

  // 3. Grant admin access to the RLC service
  if (existingService) {
    await db
      .insert(userServices)
      .values({
        userId: user.id,
        serviceId: existingService.id,
        grantedBy: user.id,
      })
      .onConflictDoNothing();

    console.log(`✅ Granted ${user.email} access to ${existingService.name}`);
  }

  console.log('\n🎉 Bootstrap complete!\n');
  process.exit(0);
}

bootstrap().catch((err) => {
  console.error('Bootstrap failed:', err);
  process.exit(1);
});
