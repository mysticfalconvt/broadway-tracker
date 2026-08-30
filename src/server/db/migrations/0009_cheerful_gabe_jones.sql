CREATE TABLE "castings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"production_id" uuid NOT NULL,
	"role" text NOT NULL,
	"kind" text DEFAULT 'performer' NOT NULL,
	"is_principal" boolean DEFAULT false NOT NULL,
	"started_on" date,
	"ended_on" date,
	"created_by_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "people" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"note" text,
	"match_key" text NOT NULL,
	"created_by_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "people_match_key_unique" UNIQUE("match_key")
);
--> statement-breakpoint
ALTER TABLE "castings" ADD CONSTRAINT "castings_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "castings" ADD CONSTRAINT "castings_production_id_productions_id_fk" FOREIGN KEY ("production_id") REFERENCES "public"."productions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "castings" ADD CONSTRAINT "castings_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "castings_production_idx" ON "castings" USING btree ("production_id");--> statement-breakpoint
CREATE INDEX "castings_person_idx" ON "castings" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "people_name_idx" ON "people" USING btree ("name");