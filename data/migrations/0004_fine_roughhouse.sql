ALTER TABLE `event` ADD `max_rooms_per_user` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `event` ADD `max_subs_per_user` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `event` ADD `parent_sub_mutually_exclusive` integer DEFAULT true NOT NULL;