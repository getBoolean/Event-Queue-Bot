CREATE TABLE `event_winner` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`guild_id` text NOT NULL,
	`event_id` integer NOT NULL,
	`room_index` integer NOT NULL,
	`user_id` text NOT NULL,
	`role_id` text NOT NULL,
	`declared_at` integer NOT NULL,
	FOREIGN KEY (`guild_id`) REFERENCES `guild`(`guild_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`event_id`) REFERENCES `event`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `event_winner_guild_id_index` ON `event_winner` (`guild_id`);--> statement-breakpoint
CREATE INDEX `event_winner_event_id_index` ON `event_winner` (`event_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `event_winner_event_id_room_index_user_id_unique` ON `event_winner` (`event_id`,`room_index`,`user_id`);--> statement-breakpoint
ALTER TABLE `event` ADD `winner_role_id` text;