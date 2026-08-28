CREATE TABLE "outing_attendees" (
	"outing_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"invited_by_user_id" text,
	"attendance_status" text DEFAULT 'invited' NOT NULL,
	"rating" smallint,
	"favorite" boolean DEFAULT false NOT NULL,
	"review" text,
	"review_visibility" text DEFAULT 'private' NOT NULL,
	"private_notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "outing_attendees_outing_id_user_id_pk" PRIMARY KEY("outing_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "outings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"show_id" uuid NOT NULL,
	"production_id" uuid,
	"created_by_user_id" text NOT NULL,
	"date_precision" text DEFAULT 'exact' NOT NULL,
	"occurred_on" date,
	"occurred_month" smallint,
	"occurred_year" smallint,
	"approximate_date" text,
	"starts_at" timestamp,
	"venue" text,
	"city" text,
	"country" text,
	"shared_notes" text,
	"visibility" text DEFAULT 'private' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "library_entries" ADD COLUMN "favorite" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "library_entries" SET "status" = 'seen', "favorite" = true WHERE "status" = 'favorite';--> statement-breakpoint
ALTER TABLE "outing_attendees" ADD CONSTRAINT "outing_attendees_outing_id_outings_id_fk" FOREIGN KEY ("outing_id") REFERENCES "public"."outings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outing_attendees" ADD CONSTRAINT "outing_attendees_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outing_attendees" ADD CONSTRAINT "outing_attendees_invited_by_user_id_user_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outings" ADD CONSTRAINT "outings_show_id_shows_id_fk" FOREIGN KEY ("show_id") REFERENCES "public"."shows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outings" ADD CONSTRAINT "outings_production_id_productions_id_fk" FOREIGN KEY ("production_id") REFERENCES "public"."productions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outings" ADD CONSTRAINT "outings_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "outing_attendees_user_id_idx" ON "outing_attendees" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "outings_show_id_idx" ON "outings" USING btree ("show_id");--> statement-breakpoint
CREATE INDEX "outings_created_by_user_id_idx" ON "outings" USING btree ("created_by_user_id");