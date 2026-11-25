ALTER TABLE "share_tokens" ADD COLUMN "kind" text DEFAULT 'shortcut' NOT NULL;--> statement-breakpoint
ALTER TABLE "share_tokens" DROP CONSTRAINT "share_tokens_pkey";--> statement-breakpoint
ALTER TABLE "share_tokens" ADD CONSTRAINT "share_tokens_user_id_kind_pk" PRIMARY KEY("user_id","kind");
