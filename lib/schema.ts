import { pgTable, uuid, text, timestamp, integer } from 'drizzle-orm/pg-core';

export const links = pgTable('links', {
  id: uuid('id').primaryKey().defaultRandom(),
  url: text('url').notNull(),
  title: text('title'),
  status: text('status').notNull().default('pending'),
  summary: text('summary'),
  category: text('category'),
  errorMessage: text('error_message'),
  imageUrl: text('image_url'),
  byline: text('byline'),
  publishedAt: timestamp('published_at'),
  // Only set when the article text was saved, so it also tells whether there is a reader view.
  readingMinutes: integer('reading_minutes'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export type LinkRow = typeof links.$inferSelect;

// The cleaned article for the reader view; kept apart so the list doesn't load it.
export const linkContents = pgTable('link_contents', {
  linkId: uuid('link_id')
    .primaryKey()
    .references(() => links.id, { onDelete: 'cascade' }),
  html: text('html').notNull(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// At most one row (id 1): the password set in the app. Without it, SITE_PASSWORD is used.
export const sitePassword = pgTable('site_password', {
  id: integer('id').primaryKey(),
  passwordHash: text('password_hash').notNull(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});
