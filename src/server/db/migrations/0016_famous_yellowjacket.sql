ALTER TABLE "user" ADD COLUMN "digest_cadence" text DEFAULT 'monthly' NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "last_active_at" timestamp;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "last_digest_at" timestamp;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "digest_token" uuid DEFAULT gen_random_uuid() NOT NULL;