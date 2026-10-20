import { neon } from '@neondatabase/serverless';
import { drizzle as drizzleNeon } from 'drizzle-orm/neon-http';
import * as schema from './schema';

async function createTestDb() {
  const { PGlite } = await import('@electric-sql/pglite');
  const { drizzle: drizzlePglite } = await import('drizzle-orm/pglite');
  const { migrate } = await import('drizzle-orm/pglite/migrator');

  const client = new PGlite();
  const testDb = drizzlePglite(client, { schema });
  await migrate(testDb, { migrationsFolder: './drizzle' });
  return testDb;
}

export const db =
  process.env.NODE_ENV === 'test'
    ? await createTestDb()
    : drizzleNeon(neon(process.env.DATABASE_URL!), { schema });
