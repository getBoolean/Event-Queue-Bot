CREATE TABLE `event_sync_lock` (
	`guild_id` text NOT NULL,
	`event_id` integer NOT NULL,
	`locked_at` integer NOT NULL,
	PRIMARY KEY(`guild_id`, `event_id`)
);
