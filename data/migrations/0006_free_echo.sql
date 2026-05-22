ALTER TABLE `event` ADD `role_in_room_queue` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `event` ADD `role_on_room_pull` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `event` ADD `role_in_sub_queue` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `event` ADD `role_on_sub_pull` integer DEFAULT true NOT NULL;