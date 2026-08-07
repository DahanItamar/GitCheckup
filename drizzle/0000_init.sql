CREATE TABLE "repos" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"github_id" bigint NOT NULL,
	"owner" text NOT NULL,
	"name" text NOT NULL,
	"stars" integer NOT NULL,
	"is_archived" boolean DEFAULT false NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "repos_github_id_unique" UNIQUE("github_id")
);
--> statement-breakpoint
CREATE TABLE "scores" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"repo_id" bigint NOT NULL,
	"total" smallint NOT NULL,
	"grade" text NOT NULL,
	"categories" jsonb NOT NULL,
	"tips" jsonb NOT NULL,
	"rubric_version" smallint NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scores_total_range" CHECK ("scores"."total" between 0 and 100),
	CONSTRAINT "scores_grade_valid" CHECK ("scores"."grade" in ('A+','A','B','C','D','F'))
);
--> statement-breakpoint
ALTER TABLE "scores" ADD CONSTRAINT "scores_repo_id_repos_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "repos_slug_idx" ON "repos" USING btree (lower("owner"),lower("name"));--> statement-breakpoint
CREATE INDEX "scores_latest_idx" ON "scores" USING btree ("repo_id","fetched_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "scores_trending_idx" ON "scores" USING btree ("fetched_at" DESC NULLS LAST,"total" DESC NULLS LAST);