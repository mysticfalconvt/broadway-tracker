CREATE TABLE "cover_choices" (
	"user_id" text NOT NULL,
	"show_id" uuid NOT NULL,
	"image_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "cover_choices_user_id_show_id_pk" PRIMARY KEY("user_id","show_id")
);
--> statement-breakpoint
ALTER TABLE "cover_choices" ADD CONSTRAINT "cover_choices_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cover_choices" ADD CONSTRAINT "cover_choices_show_id_shows_id_fk" FOREIGN KEY ("show_id") REFERENCES "public"."shows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cover_choices" ADD CONSTRAINT "cover_choices_image_id_show_images_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."show_images"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
--> statement-breakpoint
-- Anything already chosen under the old flag becomes a choice by the person who
-- uploaded it, which is exactly what the flag meant. Done before the drop, so
-- nobody loses a cover they had set.
INSERT INTO "cover_choices" ("user_id", "show_id", "image_id")
SELECT "uploaded_by_user_id", "show_id", "id" FROM "show_images" WHERE "is_cover" = true
ON CONFLICT DO NOTHING;
--> statement-breakpoint
ALTER TABLE "show_images" DROP COLUMN "is_cover";