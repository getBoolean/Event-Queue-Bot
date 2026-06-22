PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_event` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`guild_id` text NOT NULL,
	`name` text NOT NULL,
	`room_count` integer NOT NULL,
	`room_queues_channel_id` text NOT NULL,
	`sub_queues_channel_id` text NOT NULL,
	`room_length_ms` integer,
	`room_scheduling` text DEFAULT 'parallel' NOT NULL,
	`create_offset_ms` integer DEFAULT 86400000 NOT NULL,
	`lock_offset_ms` integer DEFAULT 0 NOT NULL,
	`cleanup_offset_ms` integer DEFAULT 3600000 NOT NULL,
	`announcement_channel_id` text,
	`announcement_message` text,
	`room_ping_message` text,
	`max_rooms_per_user` integer DEFAULT 0 NOT NULL,
	`max_subs_per_user` integer DEFAULT 0 NOT NULL,
	`parent_sub_mutually_exclusive` integer DEFAULT true NOT NULL,
	`room_category_id` text,
	`role_in_room_queue` integer DEFAULT false NOT NULL,
	`role_on_room_pull` integer DEFAULT false NOT NULL,
	`role_in_sub_queue` integer DEFAULT false NOT NULL,
	`role_on_sub_pull` integer DEFAULT false NOT NULL,
	`create_discord_event` integer DEFAULT true NOT NULL,
	`discord_event_description` text,
	FOREIGN KEY (`guild_id`) REFERENCES `guild`(`guild_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_event`("id", "guild_id", "name", "room_count", "room_queues_channel_id", "sub_queues_channel_id", "room_length_ms", "room_scheduling", "create_offset_ms", "lock_offset_ms", "cleanup_offset_ms", "announcement_channel_id", "announcement_message", "room_ping_message", "max_rooms_per_user", "max_subs_per_user", "parent_sub_mutually_exclusive", "room_category_id", "role_in_room_queue", "role_on_room_pull", "role_in_sub_queue", "role_on_sub_pull", "create_discord_event", "discord_event_description") SELECT "id", "guild_id", "name", "room_count", "room_queues_channel_id", "sub_queues_channel_id", "room_length_ms", "room_scheduling", "create_offset_ms", "lock_offset_ms", "cleanup_offset_ms", "announcement_channel_id", "announcement_message", "room_ping_message", "max_rooms_per_user", "max_subs_per_user", "parent_sub_mutually_exclusive", "room_category_id", "role_in_room_queue", "role_on_room_pull", "role_in_sub_queue", "role_on_sub_pull", "create_discord_event", "discord_event_description" FROM `event`;--> statement-breakpoint
DROP TABLE `event`;--> statement-breakpoint
ALTER TABLE `__new_event` RENAME TO `event`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `event_guild_id_index` ON `event` (`guild_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `event_name_guild_id_unique` ON `event` (`name`,`guild_id`);