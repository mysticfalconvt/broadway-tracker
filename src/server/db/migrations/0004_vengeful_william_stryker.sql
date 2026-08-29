CREATE TABLE "show_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"show_id" uuid NOT NULL,
	"uploaded_by_user_id" text NOT NULL,
	"object_key" text NOT NULL,
	"visibility" text DEFAULT 'private' NOT NULL,
	"review_status" text DEFAULT 'pending' NOT NULL,
	"reviewed_by_user_id" text,
	"reviewed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "show_images_object_key_unique" UNIQUE("object_key")
);
--> statement-breakpoint
ALTER TABLE "show_images" ADD CONSTRAINT "show_images_show_id_shows_id_fk" FOREIGN KEY ("show_id") REFERENCES "public"."shows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "show_images" ADD CONSTRAINT "show_images_uploaded_by_user_id_user_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "show_images" ADD CONSTRAINT "show_images_reviewed_by_user_id_user_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "show_images_show_idx" ON "show_images" USING btree ("show_id");--> statement-breakpoint
CREATE INDEX "show_images_uploader_idx" ON "show_images" USING btree ("uploaded_by_user_id");