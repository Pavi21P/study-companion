CREATE TABLE `quiz_folders` (
	`quiz_id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`folder_id` text NOT NULL,
	FOREIGN KEY (`quiz_id`,`owner_id`) REFERENCES `authored_quizzes`(`id`,`owner_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`folder_id`,`owner_id`) REFERENCES `folders`(`id`,`owner_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_quiz_folders_owner_folder` ON `quiz_folders` (`owner_id`,`folder_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_authored_quizzes_id_owner` ON `authored_quizzes` (`id`,`owner_id`);