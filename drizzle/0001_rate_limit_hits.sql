CREATE TABLE "rate_limit_hits" (
	"bucket_key" text PRIMARY KEY NOT NULL,
	"hits" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "rate_limit_expiry_idx" ON "rate_limit_hits" USING btree ("expires_at");