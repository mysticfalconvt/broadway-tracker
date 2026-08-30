ALTER TABLE "shows" ADD COLUMN "local_key" text;--> statement-breakpoint
ALTER TABLE "shows" ADD CONSTRAINT "shows_local_key_unique" UNIQUE("local_key");