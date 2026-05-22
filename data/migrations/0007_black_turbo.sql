ALTER TABLE `event_occurrence` ADD `discord_event_id` text;--> statement-breakpoint
ALTER TABLE `event` ADD `create_discord_event` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `event` ADD `discord_event_description` text;