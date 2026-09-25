CREATE TABLE `guest_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`share_id` text NOT NULL,
	`version_id` text NOT NULL,
	`answers_json` text NOT NULL,
	`score` integer NOT NULL,
	`question_count` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`share_id`,`version_id`) REFERENCES `quiz_shares`(`id`,`version_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "guest_attempt_id" CHECK(length("guest_attempts"."id") = 64),
	CONSTRAINT "guest_attempt_count" CHECK("guest_attempts"."question_count" BETWEEN 1 AND 500),
	CONSTRAINT "guest_attempt_score" CHECK("guest_attempts"."score" BETWEEN 0 AND "guest_attempts"."question_count"),
	CONSTRAINT "guest_attempt_answers" CHECK(json_valid("guest_attempts"."answers_json") AND json_type("guest_attempts"."answers_json") = 'array' AND json_array_length("guest_attempts"."answers_json") = "guest_attempts"."question_count")
);
--> statement-breakpoint
CREATE INDEX `idx_guest_attempts_share` ON `guest_attempts` (`share_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_quiz_shares_id_version` ON `quiz_shares` (`id`,`version_id`);