ALTER TABLE "library_entries" ALTER COLUMN "visibility" SET DEFAULT 'friends';--> statement-breakpoint
ALTER TABLE "lists" ALTER COLUMN "visibility" SET DEFAULT 'friends';--> statement-breakpoint
ALTER TABLE "outing_attendees" ALTER COLUMN "review_visibility" SET DEFAULT 'friends';--> statement-breakpoint
ALTER TABLE "outings" ALTER COLUMN "visibility" SET DEFAULT 'friends';--> statement-breakpoint
ALTER TABLE "show_images" ALTER COLUMN "visibility" SET DEFAULT 'friends';--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "profile_visibility" SET DEFAULT 'friends';