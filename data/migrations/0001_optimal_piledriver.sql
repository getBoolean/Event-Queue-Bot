CREATE TABLE `event_default` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`guild_id` text NOT NULL,
	`event_id` integer NOT NULL,
	`queue_role` text NOT NULL,
	`autopull_toggle` integer,
	`badge_toggle` integer,
	`color` text,
	`display_update_type` text,
	`dm_on_pull_toggle` integer,
	`buttons_toggles` text,
	`header` text,
	`inline_toggle` integer,
	`lock_toggle` integer,
	`member_display_type` text,
	`pull_batch_size` integer,
	`pull_message` text,
	`pull_message_display_type` text,
	`pull_message_channel_id` text,
	`rejoin_cooldown_period` integer,
	`rejoin_grace_period` integer,
	`require_message_to_join` integer,
	`role_in_queue_id` text,
	`role_on_pull_id` text,
	`size` integer,
	`time_display_type` text,
	`voice_destination_channel_id` text,
	`voice_only_toggle` integer,
	FOREIGN KEY (`guild_id`) REFERENCES `guild`(`guild_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`event_id`) REFERENCES `event`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `event_default_guild_id_index` ON `event_default` (`guild_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `event_default_event_id_queue_role_unique` ON `event_default` (`event_id`,`queue_role`);--> statement-breakpoint
CREATE TABLE `event_occurrence` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`guild_id` text NOT NULL,
	`event_id` integer NOT NULL,
	`start_time` integer NOT NULL,
	`timezone` text,
	FOREIGN KEY (`guild_id`) REFERENCES `guild`(`guild_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`event_id`) REFERENCES `event`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `event_occurrence_guild_id_index` ON `event_occurrence` (`guild_id`);--> statement-breakpoint
CREATE INDEX `event_occurrence_event_id_index` ON `event_occurrence` (`event_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `event_occurrence_event_id_start_time_unique` ON `event_occurrence` (`event_id`,`start_time`);--> statement-breakpoint
CREATE TABLE `event_queue` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`guild_id` text NOT NULL,
	`event_id` integer NOT NULL,
	`queue_id` integer NOT NULL,
	`queue_role` text NOT NULL,
	`queue_index` integer NOT NULL,
	`ping_channel_id` text,
	FOREIGN KEY (`guild_id`) REFERENCES `guild`(`guild_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`event_id`) REFERENCES `event`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`queue_id`) REFERENCES `queue`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `event_queue_guild_id_index` ON `event_queue` (`guild_id`);--> statement-breakpoint
CREATE INDEX `event_queue_event_id_index` ON `event_queue` (`event_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `event_queue_event_id_queue_role_queue_index_unique` ON `event_queue` (`event_id`,`queue_role`,`queue_index`);--> statement-breakpoint
CREATE UNIQUE INDEX `event_queue_queue_id_unique` ON `event_queue` (`queue_id`);--> statement-breakpoint
CREATE TABLE `event` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`guild_id` text NOT NULL,
	`name` text NOT NULL,
	`room_count` integer NOT NULL,
	`room_channel_id` text NOT NULL,
	`sub_channel_id` text NOT NULL,
	`room_length_ms` integer,
	`room_scheduling` text DEFAULT 'parallel' NOT NULL,
	`create_offset_ms` integer DEFAULT 86400000 NOT NULL,
	`lock_offset_ms` integer DEFAULT 0 NOT NULL,
	`cleanup_offset_ms` integer DEFAULT 86400000 NOT NULL,
	`announcement_channel_id` text,
	`announcement_message` text,
	`room_ping_message` text,
	FOREIGN KEY (`guild_id`) REFERENCES `guild`(`guild_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `event_guild_id_index` ON `event` (`guild_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `event_name_guild_id_unique` ON `event` (`name`,`guild_id`);