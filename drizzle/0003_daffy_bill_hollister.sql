CREATE TABLE `quiz_shares` (
	`id` text PRIMARY KEY NOT NULL,
	`version_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`revoked_at` integer,
	FOREIGN KEY (`version_id`) REFERENCES `quiz_versions`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "quiz_share_token_length" CHECK(length("quiz_shares"."id") = 64),
	CONSTRAINT "quiz_share_revocation" CHECK("quiz_shares"."revoked_at" IS NULL OR "quiz_shares"."revoked_at" >= "quiz_shares"."created_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_quiz_shares_active_version` ON `quiz_shares` (`version_id`) WHERE "quiz_shares"."revoked_at" IS NULL;--> statement-breakpoint
CREATE INDEX `idx_quiz_shares_version` ON `quiz_shares` (`version_id`);