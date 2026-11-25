import { sql } from 'drizzle-orm';
import { index, pgTable, primaryKey, uuid, text, timestamp, integer, jsonb, customType } from 'drizzle-orm/pg-core';

// Neon's HTTP driver returns bytea as a '\x…' hex string, PGlite as a Uint8Array.
const bytea = customType<{ data: Buffer; driverData: Buffer | Uint8Array | string }>({
  dataType: () => 'bytea',
  fromDriver: (value) =>
    typeof value === 'string' ? Buffer.from(value.replace(/^\\x/, ''), 'hex') : Buffer.from(value),
});

export type LinkKind = 'link' | 'image' | 'note';

export type LinkNote = { id: string; text: string; createdAt: string };

// A passage the user marked in the reader: the text, plus a little text on both sides to find the right
// spot again when the same sentence occurs more than once (see lib/highlights.ts).
export type LinkHighlight = { id: string; text: string; prefix: string; suffix: string; createdAt: string };

export const links = pgTable(
  'links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // The Neon Auth user who owns this link. Only empty for links saved before accounts existed.
    userId: text('user_id'),
    // 'link' items always have a url; an uploaded image or a loose note has none.
    kind: text('kind').$type<LinkKind>().notNull().default('link'),
    url: text('url'),
    title: text('title'),
    status: text('status').notNull().default('pending'),
    summary: text('summary'),
    category: text('category'),
    // Free labels added by the user (cleaned up in lib/tags.ts).
    tags: text('tags').array().notNull().default(sql`'{}'::text[]`),
    // The user's own notes, oldest first (added and removed via /api/links/[id]/notes).
    notes: jsonb('notes').$type<LinkNote[]>().notNull().default(sql`'[]'::jsonb`),
    // Passages marked in the reader, oldest first (added and removed via /api/links/[id]/highlights).
    highlights: jsonb('highlights').$type<LinkHighlight[]>().notNull().default(sql`'[]'::jsonb`),
    errorMessage: text('error_message'),
    imageUrl: text('image_url'),
    byline: text('byline'),
    publishedAt: timestamp('published_at'),
    // Only set when the article text was saved, so it also tells whether there is a reader view.
    readingMinutes: integer('reading_minutes'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [index('links_user_id_idx').on(table.userId)],
);

export type LinkRow = typeof links.$inferSelect;

// The cleaned article for the reader view; kept apart so the list doesn't load it.
export const linkContents = pgTable('link_contents', {
  linkId: uuid('link_id')
    .primaryKey()
    .references(() => links.id, { onDelete: 'cascade' }),
  html: text('html').notNull(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// The bytes of an uploaded image or screenshot; kept apart so the list doesn't load them.
export const linkImages = pgTable('link_images', {
  linkId: uuid('link_id')
    .primaryKey()
    .references(() => links.id, { onDelete: 'cascade' }),
  mime: text('mime').notNull(),
  data: bytea('data').notNull(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// At most one row (id 1): the password set in the app. Without it, SITE_PASSWORD is used.
export const sitePassword = pgTable('site_password', {
  id: integer('id').primaryKey(),
  passwordHash: text('password_hash').notNull(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Users who signed up with the invite code. An account in Neon Auth without a row here has no access.
export const members = pgTable('members', {
  userId: text('user_id').primaryKey(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// One token per user per kind ('shortcut' for the share-menu shortcut, 'extension' for the Safari extension),
// so replacing one does not break the other. Only the SHA-256 is stored.
export const shareTokens = pgTable(
  'share_tokens',
  {
    userId: text('user_id').notNull(),
    kind: text('kind').notNull().default('shortcut'),
    tokenHash: text('token_hash').notNull().unique(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.kind] })],
);
