ALTER TABLE "productions" ADD COLUMN "scope" text DEFAULT 'catalog' NOT NULL;--> statement-breakpoint
ALTER TABLE "productions" ADD COLUMN "local_key" text;--> statement-breakpoint
ALTER TABLE "productions" ADD CONSTRAINT "productions_local_key_unique" UNIQUE("local_key");