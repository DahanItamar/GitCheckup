CREATE TABLE "repo_aliases" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"repo_id" bigint NOT NULL,
	"owner" text NOT NULL,
	"name" text NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "repo_aliases" ADD CONSTRAINT "repo_aliases_repo_id_repos_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "repo_aliases_slug_idx" ON "repo_aliases" USING btree (lower("owner"),lower("name"));