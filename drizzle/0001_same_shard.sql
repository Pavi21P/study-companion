CREATE TABLE `authored_questions` (
	`id` text PRIMARY KEY NOT NULL,
	`quiz_id` text NOT NULL,
	`position` integer NOT NULL,
	`prompt` text DEFAULT '' NOT NULL,
	`choices` text DEFAULT '["",""]' NOT NULL,
	`correct_index` integer,
	`explanation` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`quiz_id`) REFERENCES `authored_quizzes`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "authored_question_position" CHECK(typeof("authored_questions"."position") = 'integer' AND "authored_questions"."position" BETWEEN 0 AND 499),
	CONSTRAINT "authored_question_prompt" CHECK(length("authored_questions"."prompt") <= 4000),
	CONSTRAINT "authored_question_explanation" CHECK(length("authored_questions"."explanation") <= 4000),
	CONSTRAINT "authored_question_choices_json" CHECK(json_valid("authored_questions"."choices")),
	CONSTRAINT "authored_question_choices_array" CHECK(json_type("authored_questions"."choices") = 'array' AND json_array_length("authored_questions"."choices") BETWEEN 2 AND 6),
	CONSTRAINT "authored_question_correct_index" CHECK("authored_questions"."correct_index" IS NULL OR (typeof("authored_questions"."correct_index") = 'integer' AND "authored_questions"."correct_index" >= 0 AND "authored_questions"."correct_index" < json_array_length("authored_questions"."choices")))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_authored_questions_quiz_position` ON `authored_questions` (`quiz_id`,`position`);--> statement-breakpoint
CREATE TABLE `authored_quizzes` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`title` text DEFAULT 'Untitled quiz' NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "authored_quiz_title" CHECK(length(trim("authored_quizzes"."title")) BETWEEN 1 AND 120),
	CONSTRAINT "authored_quiz_description" CHECK(length("authored_quizzes"."description") <= 1000),
	CONSTRAINT "authored_quiz_revision" CHECK(typeof("authored_quizzes"."revision") = 'integer' AND "authored_quizzes"."revision" >= 1)
);
--> statement-breakpoint
CREATE INDEX `idx_authored_quizzes_owner_updated` ON `authored_quizzes` (`owner_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `quiz_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`quiz_id` text NOT NULL,
	`draft_revision` integer NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`questions_json` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`quiz_id`) REFERENCES `authored_quizzes`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "quiz_version_revision" CHECK(typeof("quiz_versions"."draft_revision") = 'integer' AND "quiz_versions"."draft_revision" >= 1),
	CONSTRAINT "quiz_version_title" CHECK(length(trim("quiz_versions"."title")) BETWEEN 1 AND 120),
	CONSTRAINT "quiz_version_description" CHECK(length("quiz_versions"."description") <= 1000),
	CONSTRAINT "quiz_version_questions_json" CHECK(json_valid("quiz_versions"."questions_json")),
	CONSTRAINT "quiz_version_question_count" CHECK(json_type("quiz_versions"."questions_json") = 'array' AND json_array_length("quiz_versions"."questions_json") BETWEEN 1 AND 500),
	CONSTRAINT "quiz_version_snapshot_size" CHECK(length(CAST("quiz_versions"."questions_json" AS BLOB)) <= 1000000)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_quiz_versions_quiz_revision` ON `quiz_versions` (`quiz_id`,`draft_revision`);