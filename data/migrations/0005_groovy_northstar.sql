CREATE TABLE `event_room_channel` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`guild_id` text NOT NULL,
	`event_id` integer NOT NULL,
	`room_index` integer NOT NULL,
	`suffix` text,
	`channel_id` text NOT NULL,
	FOREIGN KEY (`guild_id`) REFERENCES `guild`(`guild_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`event_id`) REFERENCES `event`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `event_room_channel_guild_id_index` ON `event_room_channel` (`guild_id`);--> statement-breakpoint
CREATE INDEX `event_room_channel_event_id_index` ON `event_room_channel` (`event_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `event_room_channel_event_id_room_index_suffix_unique` ON `event_room_channel` (`event_id`,`room_index`,`suffix`);--> statement-breakpoint
CREATE TABLE `event_room_channel_template` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`guild_id` text NOT NULL,
	`event_id` integer NOT NULL,
	`suffix` text NOT NULL,
	`slowmode_seconds` integer,
	FOREIGN KEY (`guild_id`) REFERENCES `guild`(`guild_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`event_id`) REFERENCES `event`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `event_room_channel_template_guild_id_index` ON `event_room_channel_template` (`guild_id`);--> statement-breakpoint
CREATE INDEX `event_room_channel_template_event_id_index` ON `event_room_channel_template` (`event_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `event_room_channel_template_event_id_suffix_unique` ON `event_room_channel_template` (`event_id`,`suffix`);--> statement-breakpoint
ALTER TABLE `event_queue` ADD `auto_created_role_id` text;--> statement-breakpoint
ALTER TABLE `event` ADD `room_category_id` text;--> statement-breakpoint
ALTER TABLE `event` ADD `moderator_role_id` text;