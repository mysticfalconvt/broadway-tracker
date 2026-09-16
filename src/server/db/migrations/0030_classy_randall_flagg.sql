ALTER TABLE "list_items" ADD COLUMN "tier" text;--> statement-breakpoint
ALTER TABLE "lists" ADD COLUMN "kind" text DEFAULT 'list' NOT NULL;