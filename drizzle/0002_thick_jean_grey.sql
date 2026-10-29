CREATE TABLE "link_contents" (
	"link_id" uuid PRIMARY KEY NOT NULL,
	"html" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "links" ADD COLUMN "image_url" text;--> statement-breakpoint
ALTER TABLE "links" ADD COLUMN "byline" text;--> statement-breakpoint
ALTER TABLE "links" ADD COLUMN "published_at" timestamp;--> statement-breakpoint
ALTER TABLE "links" ADD COLUMN "reading_minutes" integer;--> statement-breakpoint
ALTER TABLE "link_contents" ADD CONSTRAINT "link_contents_link_id_links_id_fk" FOREIGN KEY ("link_id") REFERENCES "public"."links"("id") ON DELETE cascade ON UPDATE no action;