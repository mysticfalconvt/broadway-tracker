ALTER TABLE "venues" ADD COLUMN "latitude" double precision;--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "longitude" double precision;--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "geocoded_at" timestamp;--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "geocode_attempts" smallint DEFAULT 0 NOT NULL;