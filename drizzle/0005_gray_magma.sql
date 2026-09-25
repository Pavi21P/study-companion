CREATE TABLE `folders` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`parent_id` text,
	`name` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`parent_id`,`owner_id`) REFERENCES `folders`(`id`,`owner_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "folder_name" CHECK(length(trim("folders"."name")) BETWEEN 1 AND 120),
	CONSTRAINT "folder_not_self" CHECK("folders"."parent_id" IS NULL OR "folders"."parent_id" <> "folders"."id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_folders_id_owner` ON `folders` (`id`,`owner_id`);--> statement-breakpoint
CREATE INDEX `idx_folders_owner_parent_name` ON `folders` (`owner_id`,`parent_id`,`name`,`id`);--> statement-breakpoint
-- Identity is stable; ownership cannot be reassigned through a folder update.
CREATE TRIGGER folders_identity_immutable BEFORE UPDATE OF id,owner_id ON folders
WHEN NEW.id <> OLD.id OR NEW.owner_id <> OLD.owner_id
BEGIN SELECT RAISE(ABORT, 'folder identity is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER folders_insert_cycle BEFORE INSERT ON folders
WHEN NEW.parent_id IS NOT NULL
BEGIN
 SELECT RAISE(ABORT, 'folder cycle') WHERE EXISTS (
  WITH RECURSIVE ancestors(id,parent_id) AS (
   SELECT id,parent_id FROM folders WHERE id=NEW.parent_id
   UNION SELECT f.id,f.parent_id FROM folders f JOIN ancestors a ON f.id=a.parent_id
  ) SELECT 1 FROM ancestors WHERE id=NEW.id OR parent_id=NEW.id
 );
END;
--> statement-breakpoint
CREATE TRIGGER folders_update_cycle BEFORE UPDATE OF parent_id ON folders
WHEN NEW.parent_id IS NOT NULL
BEGIN
 SELECT RAISE(ABORT, 'folder cycle') WHERE EXISTS (
  WITH RECURSIVE ancestors(id,parent_id) AS (
   SELECT id,parent_id FROM folders WHERE id=NEW.parent_id
   UNION SELECT f.id,f.parent_id FROM folders f JOIN ancestors a ON f.id=a.parent_id
  ) SELECT 1 FROM ancestors WHERE id=NEW.id
 );
END;