DROP INDEX `event_winner_event_id_room_index_user_id_unique`;--> statement-breakpoint
DELETE FROM `event_winner` WHERE `id` NOT IN (SELECT MIN(`id`) FROM `event_winner` GROUP BY `event_id`, `user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `event_winner_event_id_user_id_unique` ON `event_winner` (`event_id`,`user_id`);--> statement-breakpoint
ALTER TABLE `event_winner` DROP COLUMN `room_index`;