// One-off: give all links that were saved before accounts existed to one account.
//
//   npx tsx scripts/claim-links.ts <e-mailadres>              shows what would happen
//   npx tsx scripts/claim-links.ts <e-mailadres> --bevestig   does it
//
// Uses DATABASE_URL from .env.local; check the host it prints before confirming.
import { config } from 'dotenv';

config({ path: '.env.local' });

async function main() {
  const [email, flag] = process.argv.slice(2);
  if (!email || !process.env.DATABASE_URL) {
    console.error('Gebruik: npx tsx scripts/claim-links.ts <e-mailadres> [--bevestig]  (DATABASE_URL moet in .env.local staan)');
    process.exit(1);
  }

  // Imported here, after .env.local is loaded: lib/db.ts connects as soon as it is imported.
  const { sql } = await import('drizzle-orm');
  const { db } = await import('@/lib/db');
  const { claimUnownedLinks, countUnownedLinks } = await import('@/lib/claimLinks');

  const found = await db.execute(sql`select id from neon_auth."user" where lower(email) = lower(${email})`);
  const userId = (found.rows[0] as { id?: unknown } | undefined)?.id;
  if (typeof userId !== 'string') {
    console.error(`Geen account gevonden voor ${email}. Maak het eerst aan in de app.`);
    process.exit(1);
  }

  console.log(`Database: ${new URL(process.env.DATABASE_URL).host}`);
  console.log(`Account:  ${email} (${userId})`);
  console.log(`Links zonder eigenaar: ${await countUnownedLinks()}`);

  if (flag !== '--bevestig') {
    console.log('Niets gewijzigd. Voeg --bevestig toe om deze links aan dit account te koppelen.');
    return;
  }
  console.log(`Gekoppeld: ${await claimUnownedLinks(userId)} links.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
