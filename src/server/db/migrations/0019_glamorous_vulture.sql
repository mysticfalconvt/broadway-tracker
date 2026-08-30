ALTER TABLE "castings" ADD COLUMN "source" text DEFAULT 'member' NOT NULL;--> statement-breakpoint
ALTER TABLE "castings" ADD COLUMN "source_note" text;--> statement-breakpoint
ALTER TABLE "productions" ADD COLUMN "source" text DEFAULT 'member' NOT NULL;--> statement-breakpoint
ALTER TABLE "productions" ADD COLUMN "source_note" text;