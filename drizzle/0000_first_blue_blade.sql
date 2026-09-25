CREATE TABLE `courses` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "courses_title_length" CHECK(length(trim("courses"."title")) BETWEEN 1 AND 120),
	CONSTRAINT "courses_description_length" CHECK(length("courses"."description") <= 1000)
);
--> statement-breakpoint
CREATE INDEX `idx_courses_owner_created` ON `courses` (`owner_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `flashcards` (
	`id` text PRIMARY KEY NOT NULL,
	`study_set_id` text NOT NULL,
	`source_id` text NOT NULL,
	`passage_id` text NOT NULL,
	`position` integer NOT NULL,
	`front` text NOT NULL,
	`back` text NOT NULL,
	FOREIGN KEY (`study_set_id`,`source_id`) REFERENCES `study_sets`(`id`,`source_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`passage_id`,`source_id`) REFERENCES `passages`(`id`,`source_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "flashcards_position" CHECK("flashcards"."position" >= 0),
	CONSTRAINT "flashcards_text" CHECK(length(trim("flashcards"."front")) > 0 AND length(trim("flashcards"."back")) > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_flashcards_set_position` ON `flashcards` (`study_set_id`,`position`);--> statement-breakpoint
CREATE TABLE `passages` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`position` integer NOT NULL,
	`location` integer NOT NULL,
	`heading` text,
	`content` text NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "passages_position" CHECK("passages"."position" >= 0),
	CONSTRAINT "passages_location" CHECK("passages"."location" BETWEEN 1 AND 100),
	CONSTRAINT "passages_content" CHECK(length(trim("passages"."content")) > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_passages_source_position` ON `passages` (`source_id`,`position`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_passages_id_source` ON `passages` (`id`,`source_id`);--> statement-breakpoint
CREATE TABLE `question_passages` (
	`question_id` text NOT NULL,
	`passage_id` text NOT NULL,
	`source_id` text NOT NULL,
	FOREIGN KEY (`question_id`,`source_id`) REFERENCES `questions`(`id`,`source_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`passage_id`,`source_id`) REFERENCES `passages`(`id`,`source_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_question_passages_pair` ON `question_passages` (`question_id`,`passage_id`);--> statement-breakpoint
CREATE TABLE `questions` (
	`id` text PRIMARY KEY NOT NULL,
	`study_set_id` text NOT NULL,
	`source_id` text NOT NULL,
	`position` integer NOT NULL,
	`prompt` text NOT NULL,
	`options` text NOT NULL,
	`correct_index` integer NOT NULL,
	FOREIGN KEY (`study_set_id`,`source_id`) REFERENCES `study_sets`(`id`,`source_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "questions_position" CHECK("questions"."position" >= 0),
	CONSTRAINT "questions_prompt" CHECK(length(trim("questions"."prompt")) > 0),
	CONSTRAINT "questions_options_json" CHECK(json_valid("questions"."options")),
	CONSTRAINT "questions_options_array" CHECK(json_type("questions"."options") = 'array' AND json_array_length("questions"."options") BETWEEN 2 AND 6),
	CONSTRAINT "questions_correct_index" CHECK("questions"."correct_index" >= 0 AND "questions"."correct_index" < json_array_length("questions"."options"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_questions_set_position` ON `questions` (`study_set_id`,`position`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_questions_id_set` ON `questions` (`id`,`study_set_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_questions_id_source` ON `questions` (`id`,`source_id`);--> statement-breakpoint
CREATE TABLE `quiz_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`study_set_id` text NOT NULL,
	`user_id` text NOT NULL,
	`question_count` integer NOT NULL,
	`score` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`study_set_id`) REFERENCES `study_sets`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "attempts_question_count" CHECK("quiz_attempts"."question_count" > 0),
	CONSTRAINT "attempts_score" CHECK("quiz_attempts"."score" IS NULL OR "quiz_attempts"."score" BETWEEN 0 AND "quiz_attempts"."question_count"),
	CONSTRAINT "attempts_completion" CHECK(("quiz_attempts"."completed_at" IS NULL AND "quiz_attempts"."score" IS NULL) OR ("quiz_attempts"."completed_at" IS NOT NULL AND "quiz_attempts"."score" IS NOT NULL AND "quiz_attempts"."completed_at" >= "quiz_attempts"."created_at"))
);
--> statement-breakpoint
CREATE INDEX `idx_attempts_user_created` ON `quiz_attempts` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_attempts_set` ON `quiz_attempts` (`study_set_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_attempts_id_set` ON `quiz_attempts` (`id`,`study_set_id`);--> statement-breakpoint
CREATE TABLE `responses` (
	`id` text PRIMARY KEY NOT NULL,
	`attempt_id` text NOT NULL,
	`question_id` text NOT NULL,
	`study_set_id` text NOT NULL,
	`selected_index` integer NOT NULL,
	`is_correct` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`attempt_id`,`study_set_id`) REFERENCES `quiz_attempts`(`id`,`study_set_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`question_id`,`study_set_id`) REFERENCES `questions`(`id`,`study_set_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "responses_selected_index" CHECK("responses"."selected_index" BETWEEN 0 AND 5),
	CONSTRAINT "responses_correct_boolean" CHECK("responses"."is_correct" IN (0, 1))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_responses_attempt_question` ON `responses` (`attempt_id`,`question_id`);--> statement-breakpoint
CREATE TABLE `sources` (
	`id` text PRIMARY KEY NOT NULL,
	`course_id` text NOT NULL,
	`filename` text NOT NULL,
	`format` text NOT NULL,
	`object_key` text NOT NULL,
	`byte_size` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`error_message` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "sources_size" CHECK("sources"."byte_size" BETWEEN 1 AND 10485760),
	CONSTRAINT "sources_format" CHECK("sources"."format" IN ('pdf', 'pptx')),
	CONSTRAINT "sources_status" CHECK("sources"."status" IN ('pending', 'processing', 'ready', 'failed'))
);
--> statement-breakpoint
CREATE INDEX `idx_sources_course` ON `sources` (`course_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_sources_object_key` ON `sources` (`object_key`);--> statement-breakpoint
CREATE TABLE `study_sets` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`model` text,
	`prompt_version` text,
	`request_key` text NOT NULL,
	`error_message` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "study_sets_kind" CHECK("study_sets"."kind" IN ('quiz', 'flashcards')),
	CONSTRAINT "study_sets_status" CHECK("study_sets"."status" IN ('pending', 'generating', 'ready', 'failed'))
);
--> statement-breakpoint
CREATE INDEX `idx_study_sets_source` ON `study_sets` (`source_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_study_sets_request` ON `study_sets` (`request_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_study_sets_id_source` ON `study_sets` (`id`,`source_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
