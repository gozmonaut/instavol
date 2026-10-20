import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core';

export const links = pgTable('links', {
  id: uuid('id').primaryKey().defaultRandom(),
  url: text('url').notNull(),
  title: text('title'),
  status: text('status').notNull().default('pending'),
  summary: text('summary'),
  category: text('category'),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export type LinkRow = typeof links.$inferSelect;
