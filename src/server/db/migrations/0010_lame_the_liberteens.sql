CREATE TABLE "seen_performers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"outing_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"person_id" uuid NOT NULL,
	"role" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "seen_performers" ADD CONSTRAINT "seen_performers_outing_id_outings_id_fk" FOREIGN KEY ("outing_id") REFERENCES "public"."outings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seen_performers" ADD CONSTRAINT "seen_performers_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seen_performers" ADD CONSTRAINT "seen_performers_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "seen_performers_unique" ON "seen_performers" USING btree ("outing_id","user_id","person_id");--> statement-breakpoint
CREATE INDEX "seen_performers_outing_idx" ON "seen_performers" USING btree ("outing_id","user_id");