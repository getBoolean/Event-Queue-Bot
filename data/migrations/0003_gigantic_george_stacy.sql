CREATE TABLE `event_occurrence_room_ping` (
	`occurrence_id` integer NOT NULL,
	`event_queue_id` integer NOT NULL,
	`handled_at` integer NOT NULL,
	PRIMARY KEY(`occurrence_id`, `event_queue_id`),
	FOREIGN KEY (`occurrence_id`) REFERENCES `event_occurrence`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`event_queue_id`) REFERENCES `event_queue`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `event_occurrence_room_ping_occurrence_id_index` ON `event_occurrence_room_ping` (`occurrence_id`);--> statement-breakpoint
ALTER TABLE `event_occurrence` ADD `open_handled_at` integer;--> statement-breakpoint
ALTER TABLE `event_occurrence` ADD `lock_handled_at` integer;