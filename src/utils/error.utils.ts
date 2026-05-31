import { EmbedBuilder } from "discord.js";

import { commandMention } from "./string.utils.ts";

export abstract class AbstractInteractionIssue extends Error {
	message = "Unknown Issue";
	embeds?: EmbedBuilder[];
	log?: boolean;
	ephemeral?: boolean;
}

export abstract class AbstractError extends AbstractInteractionIssue {
	message = "Unknown Error";
}

export abstract class AbstractWarning extends AbstractInteractionIssue {
	message = "Unknown Warning";
}

export class CustomError extends AbstractWarning {
	constructor(opts: {
		message: string
		embeds?: EmbedBuilder[],
		log?: boolean,
		ephemeral?: boolean,
	}) {
		super();
		Object.assign(this, opts);
	}
}

export class QueueLockedWarning extends AbstractWarning {
	message = "Failed to join queue because it is locked";
}

export class QueueFullWarning extends AbstractWarning {
	message = "Failed to join queue because it is full";
}

export class QueueNotFoundWarning extends AbstractWarning {
	message = "Queue not found";
	embeds = [
		new EmbedBuilder().setDescription(`Queues can be created with ${commandMention("queues", "add")}.`),
	];
}

export class VoiceNotFoundWarning extends AbstractWarning {
	message = "Voice not found";
	embeds = [
		new EmbedBuilder().setDescription(`Voices can be created with ${commandMention("voice", "add_source")}.`),
	];
}

export class DisplayNotFoundWarning extends AbstractWarning {
	message = "Display not found";
	embeds = [
		new EmbedBuilder().setDescription(`Displays can be created with ${commandMention("show")} or ${commandMention("displays", "add")}.`),
	];
}

export class MemberNotFoundWarning extends AbstractWarning {
	message = "Member not found";
}

export class ScheduleNotFoundWarning extends AbstractWarning {
	message = "Schedule not found";
	embeds = [
		new EmbedBuilder().setDescription(`Schedules can be created with ${commandMention("schedule", "add")}.`),
	];
}

export class PrioritizedNotFoundWarning extends AbstractWarning {
	message = "Prioritized not found";
	embeds = [
		new EmbedBuilder().setDescription(`Users and roles can be prioritized with ${commandMention("prioritize", "add")}.`),
	];
}

export class WhitelistedNotFoundWarning extends AbstractWarning {
	message = "Whitelisted not found";
	embeds = [
		new EmbedBuilder().setDescription(`Users and roles can be whitelisted with ${commandMention("whitelist", "add")}.`),
	];
}

export class BlacklistedNotFoundWarning extends AbstractWarning {
	message = "Blacklisted not found";
	embeds = [
		new EmbedBuilder().setDescription(`Users and roles can be blacklisted with ${commandMention("blacklist", "add")}.`),
	];
}

export class AdminNotFoundWarning extends AbstractWarning {
	message = "Admin not found";
	embeds = [
		new EmbedBuilder().setDescription(`Admins can be added with ${commandMention("admins", "add")}.`),
	];
}

export class NotOnQueueWhitelistWarning extends AbstractWarning {
	message = "Failed to join queue because you are not on the queue whitelist";
}

export class OnQueueBlacklistWarning extends AbstractWarning {
	message = "Failed to join queue because you are on the queue blacklist";
}

export class QueueAlreadyExistsWarning extends AbstractWarning {
	message = "Queue already exists";
}

export class ScheduleAlreadyExistsWarning extends AbstractWarning {
	message = "Schedule already exists";
}

export class WhitelistedAlreadyExistsWarning extends AbstractWarning {
	message = "Whitelisted already exists";
}

export class BlacklistedAlreadyExistsWarning extends AbstractWarning {
	message = "Blacklisted already exists";
}

export class PrioritizedAlreadyExistsWarning extends AbstractWarning {
	message = "Prioritized already exists";
}

export class AdminAlreadyExistsWarning extends AbstractWarning {
	message = "Admin already exists";
}

export class AdminAccessWarning extends AbstractWarning {
	message = "Missing Queue Bot admin access";
	embeds = [
		new EmbedBuilder().setDescription(`Other admins may grant admin access ${commandMention("admins", "add")}.`),
	];
}

export class InvalidCronWarning extends AbstractWarning {
	message = "Invalid cron schedule.";
	embeds = [
		new EmbedBuilder().setDescription("Please see https://crontab.guru/examples.html. Highest frequency is once a minute."),
	];
}

export class EventNotFoundWarning extends AbstractWarning {
	message = "Event not found";
	embeds = [
		new EmbedBuilder().setDescription(`Events can be created with ${commandMention("events", "add")}.`),
	];
}

export class EventAlreadyExistsWarning extends AbstractWarning {
	message = "An event with that name already exists in this server";
}

export class WinnerRoleNotSetWarning extends AbstractWarning {
	message = "No winner role is configured for this event";
	embeds = [
		new EmbedBuilder().setDescription(`Set one with ${commandMention("events", "set")} (the \`winner_role\` option) before declaring winners.`),
	];
}

export class OccurrenceAlreadyExistsWarning extends AbstractWarning {
	message = "An occurrence with that start time already exists for this event";
}

export class OccurrenceInPastWarning extends AbstractWarning {
	message = "Cannot schedule an occurrence whose cleanup time is already in the past";
}

export class SequentialEventRequiresRoomLengthWarning extends AbstractWarning {
	message = "Sequential room scheduling requires a room length greater than 0";
}

export class RoomIndexNotFoundWarning extends AbstractWarning {
	constructor(maxIndex: number) {
		super();
		this.message = `Room index not found. Valid range is 1..${maxIndex}`;
	}
}

export class LockBeforeOpenWarning extends AbstractWarning {
	message = "Lock offset would cause rooms to lock before the event opens. Adjust create_offset_hours or lock_offset_minutes";
}

export class EventRoomCountShrinkWarning extends AbstractWarning {
	message = "Cannot reduce room count. Delete surplus queues manually via /queues delete, then reduce the count";
}

export class EventRoomLimitExceededWarning extends AbstractWarning {
	constructor(max: number) {
		super();
		this.message = `You can only join up to ${max} room(s) in this event.`;
	}
}

export class EventSubLimitExceededWarning extends AbstractWarning {
	constructor(max: number) {
		super();
		this.message = `You can only join up to ${max} sub-room(s) in this event.`;
	}
}

export class AlreadyInEventParentWarning extends AbstractWarning {
	constructor(roomIndex: bigint | number) {
		super();
		this.message = `You are already in this event's room ${roomIndex} queue. Leave it before joining the sub queue.`;
	}
}

export class AlreadyInQueueWarning extends AbstractWarning {
	message = "You are already in this queue.";
	ephemeral = true;
}

export class EventSyncInProgressWarning extends AbstractWarning {
	message = "An event sync is already in progress. Wait for it to finish before retrying.";
}
