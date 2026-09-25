CREATE TABLE `folder_shares` (
	`id` text PRIMARY KEY NOT NULL,
	`folder_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`revoked_at` integer,
	FOREIGN KEY (`folder_id`) REFERENCES `folders`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "folder_share_token" CHECK(length("folder_shares"."id") = 64),
	CONSTRAINT "folder_share_revocation" CHECK("folder_shares"."revoked_at" IS NULL OR "folder_shares"."revoked_at" >= "folder_shares"."created_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_folder_shares_active` ON `folder_shares` (`folder_id`) WHERE "folder_shares"."revoked_at" IS NULL;--> statement-breakpoint
CREATE INDEX `idx_folder_shares_folder` ON `folder_shares` (`folder_id`);