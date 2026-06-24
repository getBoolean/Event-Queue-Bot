DROP INDEX `event_occurrence_room_ping_occurrence_id_index`;--> statement-breakpoint
ALTER TABLE `event_occurrence_room_ping` ADD `guild_id` text REFERENCES guild(guild_id);--> statement-breakpoint
UPDATE `event_occurrence_room_ping` SET `guild_id` = (SELECT `guild_id` FROM `event_occurrence` WHERE `event_occurrence`.`id` = `event_occurrence_room_ping`.`occurrence_id`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_event_occurrence_room_ping` (
	`guild_id` text NOT NULL,
	`occurrence_id` integer NOT NULL,
	`event_queue_id` integer NOT NULL,
	`handled_at` integer NOT NULL,
	PRIMARY KEY(`occurrence_id`, `event_queue_id`),
	FOREIGN KEY (`guild_id`) REFERENCES `guild`(`guild_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`occurrence_id`) REFERENCES `event_occurrence`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`event_queue_id`) REFERENCES `event_queue`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_event_occurrence_room_ping`(`guild_id`, `occurrence_id`, `event_queue_id`, `handled_at`) SELECT `guild_id`, `occurrence_id`, `event_queue_id`, `handled_at` FROM `event_occurrence_room_ping`;--> statement-breakpoint
DROP TABLE `event_occurrence_room_ping`;--> statement-breakpoint
ALTER TABLE `__new_event_occurrence_room_ping` RENAME TO `event_occurrence_room_ping`;--> statement-breakpoint
CREATE INDEX `event_occurrence_room_ping_guild_id_occurrence_id_index` ON `event_occurrence_room_ping` (`guild_id`,`occurrence_id`);--> statement-breakpoint
DROP INDEX `event_occurrence_room_pull_occurrence_id_index`;--> statement-breakpoint
ALTER TABLE `event_occurrence_room_pull` ADD `guild_id` text REFERENCES guild(guild_id);--> statement-breakpoint
UPDATE `event_occurrence_room_pull` SET `guild_id` = (SELECT `guild_id` FROM `event_occurrence` WHERE `event_occurrence`.`id` = `event_occurrence_room_pull`.`occurrence_id`);--> statement-breakpoint
CREATE TABLE `__new_event_occurrence_room_pull` (
	`guild_id` text NOT NULL,
	`occurrence_id` integer NOT NULL,
	`event_queue_id` integer NOT NULL,
	`handled_at` integer NOT NULL,
	PRIMARY KEY(`occurrence_id`, `event_queue_id`),
	FOREIGN KEY (`guild_id`) REFERENCES `guild`(`guild_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`occurrence_id`) REFERENCES `event_occurrence`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`event_queue_id`) REFERENCES `event_queue`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_event_occurrence_room_pull`(`guild_id`, `occurrence_id`, `event_queue_id`, `handled_at`) SELECT `guild_id`, `occurrence_id`, `event_queue_id`, `handled_at` FROM `event_occurrence_room_pull`;--> statement-breakpoint
DROP TABLE `event_occurrence_room_pull`;--> statement-breakpoint
ALTER TABLE `__new_event_occurrence_room_pull` RENAME TO `event_occurrence_room_pull`;--> statement-breakpoint
CREATE INDEX `event_occurrence_room_pull_guild_id_occurrence_id_index` ON `event_occurrence_room_pull` (`guild_id`,`occurrence_id`);--> statement-breakpoint
PRAGMA foreign_keys=ON;
