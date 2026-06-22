CREATE TABLE `event_occurrence_room_pull` (
	`occurrence_id` integer NOT NULL,
	`event_queue_id` integer NOT NULL,
	`handled_at` integer NOT NULL,
	PRIMARY KEY(`occurrence_id`, `event_queue_id`),
	FOREIGN KEY (`occurrence_id`) REFERENCES `event_occurrence`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`event_queue_id`) REFERENCES `event_queue`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `event_occurrence_room_pull_occurrence_id_index` ON `event_occurrence_room_pull` (`occurrence_id`);--> statement-breakpoint
ALTER TABLE `event` ADD `auto_pull_subs_at_room_start_toggle` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `event` ADD `shuffle_subs_before_auto_pull_toggle` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `event` ADD `sub_auto_pull_mode` text DEFAULT 'drain' NOT NULL;