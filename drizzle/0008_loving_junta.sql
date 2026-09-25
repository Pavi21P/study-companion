CREATE TABLE `folder_guest_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`share_id` text NOT NULL,
	`version_id` text NOT NULL,
	`answers_json` text NOT NULL,
	`score` integer NOT NULL,
	`question_count` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`share_id`) REFERENCES `folder_shares`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`version_id`) REFERENCES `quiz_versions`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "folder_attempt_id" CHECK(length("folder_guest_attempts"."id") = 64),
	CONSTRAINT "folder_attempt_count" CHECK("folder_guest_attempts"."question_count" BETWEEN 1 AND 500),
	CONSTRAINT "folder_attempt_score" CHECK("folder_guest_attempts"."score" BETWEEN 0 AND "folder_guest_attempts"."question_count"),
	CONSTRAINT "folder_attempt_answers" CHECK(json_valid("folder_guest_attempts"."answers_json") AND json_type("folder_guest_attempts"."answers_json") = 'array' AND json_array_length("folder_guest_attempts"."answers_json") = "folder_guest_attempts"."question_count")
);
--> statement-breakpoint
CREATE INDEX `idx_folder_guest_attempts_share` ON `folder_guest_attempts` (`share_id`);