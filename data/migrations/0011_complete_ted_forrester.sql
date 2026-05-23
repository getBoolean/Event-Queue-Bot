CREATE TABLE `event_blacklisted` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`guild_id` text NOT NULL,
	`event_id` integer NOT NULL,
	`subject_id` text NOT NULL,
	`is_role` integer NOT NULL,
	`reason` text,
	FOREIGN KEY (`guild_id`) REFERENCES `guild`(`guild_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`event_id`) REFERENCES `event`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `event_blacklisted_guild_id_index` ON `event_blacklisted` (`guild_id`);--> statement-breakpoint
CREATE INDEX `event_blacklisted_event_id_index` ON `event_blacklisted` (`event_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `event_blacklisted_event_id_subject_id_unique` ON `event_blacklisted` (`event_id`,`subject_id`);--> statement-breakpoint
CREATE TABLE `event_prioritized` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`guild_id` text NOT NULL,
	`event_id` integer NOT NULL,
	`subject_id` text NOT NULL,
	`is_role` integer NOT NULL,
	`priority_order` integer DEFAULT 5 NOT NULL,
	`reason` text,
	FOREIGN KEY (`guild_id`) REFERENCES `guild`(`guild_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`event_id`) REFERENCES `event`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `event_prioritized_guild_id_index` ON `event_prioritized` (`guild_id`);--> statement-breakpoint
CREATE INDEX `event_prioritized_event_id_index` ON `event_prioritized` (`event_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `event_prioritized_event_id_subject_id_unique` ON `event_prioritized` (`event_id`,`subject_id`);--> statement-breakpoint
CREATE TABLE `event_whitelisted` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`guild_id` text NOT NULL,
	`event_id` integer NOT NULL,
	`subject_id` text NOT NULL,
	`is_role` integer NOT NULL,
	`reason` text,
	FOREIGN KEY (`guild_id`) REFERENCES `guild`(`guild_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`event_id`) REFERENCES `event`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `event_whitelisted_guild_id_index` ON `event_whitelisted` (`guild_id`);--> statement-breakpoint
CREATE INDEX `event_whitelisted_event_id_index` ON `event_whitelisted` (`event_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `event_whitelisted_event_id_subject_id_unique` ON `event_whitelisted` (`event_id`,`subject_id`);--> statement-breakpoint
CREATE TABLE `guild_blacklisted` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`guild_id` text NOT NULL,
	`subject_id` text NOT NULL,
	`is_role` integer NOT NULL,
	`reason` text,
	FOREIGN KEY (`guild_id`) REFERENCES `guild`(`guild_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `guild_blacklisted_guild_id_index` ON `guild_blacklisted` (`guild_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `guild_blacklisted_guild_id_subject_id_unique` ON `guild_blacklisted` (`guild_id`,`subject_id`);--> statement-breakpoint
CREATE TABLE `guild_prioritized` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`guild_id` text NOT NULL,
	`subject_id` text NOT NULL,
	`is_role` integer NOT NULL,
	`priority_order` integer DEFAULT 5 NOT NULL,
	`reason` text,
	FOREIGN KEY (`guild_id`) REFERENCES `guild`(`guild_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `guild_prioritized_guild_id_index` ON `guild_prioritized` (`guild_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `guild_prioritized_guild_id_subject_id_unique` ON `guild_prioritized` (`guild_id`,`subject_id`);--> statement-breakpoint
CREATE TABLE `guild_whitelisted` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`guild_id` text NOT NULL,
	`subject_id` text NOT NULL,
	`is_role` integer NOT NULL,
	`reason` text,
	FOREIGN KEY (`guild_id`) REFERENCES `guild`(`guild_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `guild_whitelisted_guild_id_index` ON `guild_whitelisted` (`guild_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `guild_whitelisted_guild_id_subject_id_unique` ON `guild_whitelisted` (`guild_id`,`subject_id`);