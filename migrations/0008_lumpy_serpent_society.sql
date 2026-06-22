ALTER TABLE `event` RENAME COLUMN "room_channel_id" TO "room_queues_channel_id";--> statement-breakpoint
ALTER TABLE `event` RENAME COLUMN "sub_channel_id" TO "sub_queues_channel_id";