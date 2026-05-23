import { channelMention, type Collection, EmbedBuilder, inlineCode, PermissionsBitField, SlashCommandBuilder, time, TimestampStyles } from "discord.js";
import { SQLiteColumn } from "drizzle-orm/sqlite-core";
import { findKey, isNil, omitBy } from "lodash-es";

import { Queries } from "../../db/queries.ts";
import { type DbEvent, EVENT_TABLE, QUEUE_TABLE } from "../../db/schema.ts";
import { EventScheduleModal } from "../../modals/event-schedule.modal.ts";
import { AnnouncementChannelOption } from "../../options/options/announcement-channel.option.ts";
import { AnnouncementMessageOption } from "../../options/options/announcement-message.option.ts";
import { AutopullToggleOption } from "../../options/options/autopull-toggle.option.ts";
import { BadgeToggleOption } from "../../options/options/badge-toggle.option.ts";
import { ChannelSuffixOption } from "../../options/options/channel-suffix.option.ts";
import { CleanupOffsetHoursOption } from "../../options/options/cleanup-offset-hours.option.ts";
import { ColorOption } from "../../options/options/color.option.ts";
import { CreateDiscordEventToggleOption } from "../../options/options/create-discord-event-toggle.option.ts";
import { CreateOffsetHoursOption } from "../../options/options/create-offset-hours.option.ts";
import { DiscordEventDescriptionOption } from "../../options/options/discord-event-description.option.ts";
import { ButtonsToggleOption } from "../../options/options/display-buttons.option.ts";
import { DisplayUpdateTypeOption } from "../../options/options/display-update-type.option.ts";
import { DmOnPullToggleOption } from "../../options/options/dm-on-pull-toggle.option.ts";
import { EventOption } from "../../options/options/event.option.ts";
import { EventsOption } from "../../options/options/events.option.ts";
import { HeaderOption } from "../../options/options/header.option.ts";
import { InlineToggleOption } from "../../options/options/inline-toggle.option.ts";
import { LockOffsetMinutesOption } from "../../options/options/lock-offset-minutes.option.ts";
import { LockToggleOption } from "../../options/options/lock-toggle.option.ts";
import { MaxRoomsPerUserOption } from "../../options/options/max-rooms-per-user.option.ts";
import { MaxSubsPerUserOption } from "../../options/options/max-subs-per-user.option.ts";
import { MemberDisplayTypeOption } from "../../options/options/member-display-type.option.ts";
import { NameOption } from "../../options/options/name.option.ts";
import { ParentSubMutuallyExclusiveOption } from "../../options/options/parent-sub-mutually-exclusive.option.ts";
import { PullBatchSizeOption } from "../../options/options/pull-batch-size.option.ts";
import { PullMessageOption } from "../../options/options/pull-message.option.ts";
import { PullMessageChannelOption } from "../../options/options/pull-message-channel.option.ts";
import { PullMessageDisplayTypeOption } from "../../options/options/pull-message-display-type.option.ts";
import { RejoinCooldownPeriodOption } from "../../options/options/rejoin-cooldown-period.option.ts";
import { RejoinGracePeriodOption } from "../../options/options/rejoin-grace-period.option.ts";
import { RequireMessageToJoinOption } from "../../options/options/require-message-to-join.option.ts";
import { RoleInQueueOption } from "../../options/options/role-in-queue.option.ts";
import { RoleInRoomQueueOption } from "../../options/options/role-in-room-queue.option.ts";
import { RoleInSubQueueOption } from "../../options/options/role-in-sub-queue.option.ts";
import { RoleOnPullOption } from "../../options/options/role-on-pull.option.ts";
import { RoleOnRoomPullOption } from "../../options/options/role-on-room-pull.option.ts";
import { RoleOnSubPullOption } from "../../options/options/role-on-sub-pull.option.ts";
import { RoomCategoryOption } from "../../options/options/room-category.option.ts";
import { RoomCountOption } from "../../options/options/room-count.option.ts";
import { RoomLengthMinutesOption } from "../../options/options/room-length-minutes.option.ts";
import { RoomPingMessageOption } from "../../options/options/room-ping-message.option.ts";
import { RoomQueuesChannelOption } from "../../options/options/room-queues-channel.option.ts";
import { RoomSchedulingOption } from "../../options/options/room-scheduling.option.ts";
import { SizeOption } from "../../options/options/size.option.ts";
import { SlowmodeOption } from "../../options/options/slowmode.option.ts";
import { SlowmodeTimeOption } from "../../options/options/slowmode-time.option.ts";
import { SubQueuesChannelOption } from "../../options/options/sub-queues-channel.option.ts";
import { TimestampTypeOption } from "../../options/options/timestamp-type.option.ts";
import { VoiceDestinationChannelOption } from "../../options/options/voice-destination-channel.option.ts";
import { VoiceOnlyToggleOption } from "../../options/options/voice-only-toggle.option.ts";
import { AdminCommand } from "../../types/command.types.ts";
import { Color, EventQueueRole, type RoomScheduling } from "../../types/db.types.ts";
import type { SlashInteraction } from "../../types/interaction.types.ts";
import { CustomError, EventNotFoundWarning } from "../../utils/error.utils.ts";
import { EventUtils } from "../../utils/event.utils.ts";
import { EventChannelUtils } from "../../utils/event-channel.utils.ts";
import { EventSyncLock } from "../../utils/event-sync-lock.utils.ts";
import { SelectMenuTransactor } from "../../utils/message-utils/select-menu-transactor.ts";
import { toCollection } from "../../utils/misc.utils.ts";
import { commandMention, describeTable, eventMention, queuesMention } from "../../utils/string.utils.ts";

const HOURS_TO_MS = 3_600_000n;
const MINUTES_TO_MS = 60_000n;

function verifyMentionEveryonePermission(inter: SlashInteraction, message: string, channelId: string) {
	if (/@(everyone|here)/.test(message) && !inter.member.permissionsIn(channelId).has(PermissionsBitField.Flags.MentionEveryone)) {
		throw new CustomError({
			message: "Your announcement message contains @everyone or @here, but you lack the 'Mention Everyone' permission in the announcement channel",
		});
	}
}

const DISCORD_MESSAGE_LIMIT = 2000;

function renderSyncReport(report: EventChannelUtils.SyncReport): string {
	const lines: string[] = [`Synced room channels for **${report.eventName}**.`];

	const namedBucket = (label: string, names: string[]) => {
		if (names.length === 0) return;
		lines.push(`• ${label}: ${names.map(inlineCode).join(", ")}`);
	};

	namedBucket("Created", report.created);
	namedBucket("Adopted", report.adopted);
	namedBucket("Untracked rows", report.untrackedRows);
	namedBucket("Recreated missing", report.recreatedMissing);

	if (report.reorderApplied) {
		lines.push(`• Reorder: ${report.trackedCount} tracked channel${report.trackedCount === 1 ? "" : "s"} reordered.`);
	}
	else {
		lines.push("• Reorder: already in desired order (no changes).");
	}

	if (report.nonOwnedAtTop.length === 0) {
		lines.push("• Non-owned channels at top of category: (none)");
	}
	else {
		const mentions = report.nonOwnedAtTop.map(c => channelMention(c.id)).join(", ");
		lines.push(`• Non-owned channels at top of category (${report.nonOwnedAtTop.length}): ${mentions}`);
	}

	return lines.join("\n");
}

export class EventsCommand extends AdminCommand {
	static readonly ID = "events";
	deferResponse = false;

	events_get = EventsCommand.events_get;
	events_add = EventsCommand.events_add;
	events_set = EventsCommand.events_set;
	events_set_room_defaults = EventsCommand.events_set_room_defaults;
	events_set_sub_defaults = EventsCommand.events_set_sub_defaults;
	events_add_room_channel = EventsCommand.events_add_room_channel;
	events_remove_room_channel = EventsCommand.events_remove_room_channel;
	events_sync_room_channels = EventsCommand.events_sync_room_channels;
	events_sync_queues = EventsCommand.events_sync_queues;
	events_reset = EventsCommand.events_reset;
	events_reset_room_defaults = EventsCommand.events_reset_room_defaults;
	events_reset_sub_defaults = EventsCommand.events_reset_sub_defaults;
	events_schedule = EventsCommand.events_schedule;
	events_cancel = EventsCommand.events_cancel;
	events_delete = EventsCommand.events_delete;
	events_help = EventsCommand.events_help;

	data = new SlashCommandBuilder()
		.setName(EventsCommand.ID)
		.setDescription("Manage recurring events with auto-managed queues")
		.addSubcommand(subcommand => {
			subcommand
				.setName("get")
				.setDescription("Show event details");
			Object.values(EventsCommand.GET_OPTIONS).forEach(option => option.addToCommand(subcommand));
			return subcommand;
		})
		.addSubcommand(subcommand => {
			subcommand
				.setName("add")
				.setDescription("Create event with room + sub queues");
			Object.values(EventsCommand.ADD_OPTIONS).forEach(option => option.addToCommand(subcommand));
			return subcommand;
		})
		.addSubcommand(subcommand => {
			subcommand
				.setName("set")
				.setDescription("Update event properties");
			Object.values(EventsCommand.SET_OPTIONS).forEach(option => option.addToCommand(subcommand));
			return subcommand;
		})
		.addSubcommand(subcommand => {
			subcommand
				.setName("set-room-defaults")
				.setDescription("Set room queue defaults");
			Object.values(EventsCommand.SET_ROOM_DEFAULTS_OPTIONS).forEach(option => option.addToCommand(subcommand));
			return subcommand;
		})
		.addSubcommand(subcommand => {
			subcommand
				.setName("set-sub-defaults")
				.setDescription("Set sub queue defaults");
			Object.values(EventsCommand.SET_SUB_DEFAULTS_OPTIONS).forEach(option => option.addToCommand(subcommand));
			return subcommand;
		})
		.addSubcommand(subcommand => {
			subcommand
				.setName("add-room-channel")
				.setDescription("Add per-room channel template (e.g. room-code-{N})");
			Object.values(EventsCommand.ADD_ROOM_CHANNEL_OPTIONS).forEach(option => option.addToCommand(subcommand));
			return subcommand;
		})
		.addSubcommand(subcommand => {
			subcommand
				.setName("remove-room-channel")
				.setDescription("Remove per-room channel template");
			Object.values(EventsCommand.REMOVE_ROOM_CHANNEL_OPTIONS).forEach(option => option.addToCommand(subcommand));
			return subcommand;
		})
		.addSubcommand(subcommand => {
			subcommand
				.setName("sync-room-channels")
				.setDescription("Recreate missing room channels, fix perms + order");
			Object.values(EventsCommand.SYNC_ROOM_CHANNELS_OPTIONS).forEach(option => option.addToCommand(subcommand));
			return subcommand;
		})
		.addSubcommand(subcommand => {
			subcommand
				.setName("sync-queues")
				.setDescription("Recreate missing queues, re-apply defaults, fix display order");
			Object.values(EventsCommand.SYNC_QUEUES_OPTIONS).forEach(option => option.addToCommand(subcommand));
			return subcommand;
		})
		.addSubcommand(subcommand => {
			subcommand
				.setName("reset")
				.setDescription("Reset event properties");
			Object.values(EventsCommand.RESET_OPTIONS).forEach(option => option.addToCommand(subcommand));
			return subcommand;
		})
		.addSubcommand(subcommand => {
			subcommand
				.setName("reset-room-defaults")
				.setDescription("Reset room queue defaults");
			Object.values(EventsCommand.RESET_ROOM_DEFAULTS_OPTIONS).forEach(option => option.addToCommand(subcommand));
			return subcommand;
		})
		.addSubcommand(subcommand => {
			subcommand
				.setName("reset-sub-defaults")
				.setDescription("Reset sub queue defaults");
			Object.values(EventsCommand.RESET_SUB_DEFAULTS_OPTIONS).forEach(option => option.addToCommand(subcommand));
			return subcommand;
		})
		.addSubcommand(subcommand => {
			subcommand
				.setName("schedule")
				.setDescription("Schedule an occurrence");
			Object.values(EventsCommand.SCHEDULE_OPTIONS).forEach(option => option.addToCommand(subcommand));
			return subcommand;
		})
		.addSubcommand(subcommand => {
			subcommand
				.setName("cancel")
				.setDescription("Cancel a pending occurrence");
			Object.values(EventsCommand.CANCEL_OPTIONS).forEach(option => option.addToCommand(subcommand));
			return subcommand;
		})
		.addSubcommand(subcommand => {
			subcommand
				.setName("delete")
				.setDescription("Delete event + its queues");
			Object.values(EventsCommand.DELETE_OPTIONS).forEach(option => option.addToCommand(subcommand));
			return subcommand;
		})
		.addSubcommand(subcommand => {
			subcommand
				.setName("help")
				.setDescription("Event command help");
			return subcommand;
		});

	// ====================================================================
	//                           /events get
	// ====================================================================

	static readonly GET_OPTIONS = {
		events: new EventsOption({ description: "Specific event(s)" }),
	};

	static async events_get(inter: SlashInteraction, events?: Collection<bigint, DbEvent>) {
		if (!inter.deferred) await inter.deferReply({ ephemeral: true });
		events = events ?? await EventsCommand.GET_OPTIONS.events.get(inter);

		if (!events || events.size === 0) {
			events = inter.store.dbEvents();
		}

		if (events.size === 0) {
			await inter.respond(`No events found. Create one with ${commandMention("events", "add")}.`);
			return;
		}

		const entries = events.map(event => {
			const occurrences = Queries.selectManyOccurrences({ guildId: inter.guildId, eventId: event.id });
			const nextOcc = occurrences.sort((a, b) => Number(a.startTime) - Number(b.startTime))[0];
			const templates = Queries.selectManyRoomChannelTemplates({ guildId: inter.guildId, eventId: event.id });
			const templateSummary = templates.length
				? templates.map(t => `${t.suffix}${t.slowmodeSeconds ? ` (slowmode: ${t.slowmodeSeconds}s)` : ""}`).join(", ")
				: null;
			return {
				...event,
				createOffsetMs: `${Number(event.createOffsetMs) / 3_600_000}h`,
				lockOffsetMs: `${Number(event.lockOffsetMs) / 60_000}min`,
				cleanupOffsetMs: `${Number(event.cleanupOffsetMs) / 3_600_000}h`,
				roomLengthMs: event.roomLengthMs ? `${Number(event.roomLengthMs) / 60_000}min` : null,
				nextOccurrence: nextOcc ? time(new Date(Number(nextOcc.startTime)), TimestampStyles.LongDateTime) : "None",
				nextOccurrenceDiscordEventId: nextOcc?.discordEventId ?? null,
				roomQueuesChannelId: channelMention(event.roomQueuesChannelId),
				subQueuesChannelId: channelMention(event.subQueuesChannelId),
				announcementChannelId: event.announcementChannelId ? channelMention(event.announcementChannelId) : null,
				roomCategoryId: event.roomCategoryId ? channelMention(event.roomCategoryId) : null,
				roomChannelTemplates: templateSummary,
			};
		});

		const descriptionMessage = describeTable({
			store: inter.store,
			table: EVENT_TABLE,
			tableLabel: "Events",
			entryLabelProperty: "name",
			entries: [...entries.values()],
			hiddenProperties: ["name", "queueId"],
			queueIdProperty: "guildId",
		});

		await inter.respond(descriptionMessage);
	}

	// ====================================================================
	//                           /events add
	// ====================================================================

	static readonly ADD_OPTIONS = {
		name: new NameOption({ required: true, description: "Event name" }),
		roomCount: new RoomCountOption({ required: true, description: "Number of rooms" }),
		roomQueuesChannel: new RoomQueuesChannelOption({ required: true, description: "Parent channel for room queues" }),
		subQueuesChannel: new SubQueuesChannelOption({ required: true, description: "Parent channel for sub queues" }),
		roomCategory: new RoomCategoryOption({ required: true, description: "Category for per-room channels" }),
		roomScheduling: new RoomSchedulingOption({ description: "Room timing (parallel/sequential)" }),
		roomLengthMinutes: new RoomLengthMinutesOption({ description: "Room length in minutes (sequential req)" }),
		createOffsetHours: new CreateOffsetHoursOption({ description: "Hours before start to open" }),
		lockOffsetMinutes: new LockOffsetMinutesOption({ description: "Minutes after start to lock (neg=before)" }),
		cleanupOffsetHours: new CleanupOffsetHoursOption({ description: "Hours after rooms finish to cleanup" }),
		announcementChannel: new AnnouncementChannelOption({ description: "Announcement channel" }),
		announcementMessage: new AnnouncementMessageOption({ description: "Use {event_name}, {start_time}, {start_time_relative}, {room_queues_channel}, {sub_queues_channel}" }),
		roomPingMessage: new RoomPingMessageOption({ description: "Use {room_role}, {room_name}, {event_name}, {start_time}, {ping_channel}, /events help for more" }),
		maxRoomsPerUser: new MaxRoomsPerUserOption({ description: "Max rooms per user (0=unlimited)" }),
		maxSubsPerUser: new MaxSubsPerUserOption({ description: "Max subs per user (0=unlimited)" }),
		parentSubMutuallyExclusive: new ParentSubMutuallyExclusiveOption({ description: "Room + matching sub mutually exclusive" }),
		roleInRoomQueue: new RoleInRoomQueueOption({ description: "Assign room role while in room queue" }),
		roleOnRoomPull: new RoleOnRoomPullOption({ description: "Assign room role on room queue pull" }),
		roleInSubQueue: new RoleInSubQueueOption({ description: "Assign room role while in sub queue" }),
		roleOnSubPull: new RoleOnSubPullOption({ description: "Assign room role on sub queue pull" }),
		createDiscordEvent: new CreateDiscordEventToggleOption({ description: "Create Discord scheduled event per occurrence" }),
		discordEventDescription: new DiscordEventDescriptionOption({ description: "Use {event_name}, {start_time}, {start_time_relative}, {room_queues_channel}, {sub_queues_channel}" }),
	};

	static async events_add(inter: SlashInteraction) {
		await inter.deferReply();
		const roomLengthMinutes = EventsCommand.ADD_OPTIONS.roomLengthMinutes.get(inter);
		const createOffsetHours = EventsCommand.ADD_OPTIONS.createOffsetHours.get(inter);
		const lockOffsetMinutes = EventsCommand.ADD_OPTIONS.lockOffsetMinutes.get(inter);
		const cleanupOffsetHours = EventsCommand.ADD_OPTIONS.cleanupOffsetHours.get(inter);
		const announcementChannelId = EventsCommand.ADD_OPTIONS.announcementChannel.get(inter)?.id;
		const announcementMessage = EventsCommand.ADD_OPTIONS.announcementMessage.get(inter);

		const newEvent = {
			name: EventsCommand.ADD_OPTIONS.name.get(inter)?.substring(0, 240),
			roomCount: BigInt(EventsCommand.ADD_OPTIONS.roomCount.get(inter)),
			roomQueuesChannelId: EventsCommand.ADD_OPTIONS.roomQueuesChannel.get(inter)?.id,
			subQueuesChannelId: EventsCommand.ADD_OPTIONS.subQueuesChannel.get(inter)?.id,
			roomCategoryId: EventsCommand.ADD_OPTIONS.roomCategory.get(inter)?.id,
			...omitBy({
				roomScheduling: EventsCommand.ADD_OPTIONS.roomScheduling.get(inter) as RoomScheduling,
				roomLengthMs: roomLengthMinutes ? BigInt(roomLengthMinutes) * MINUTES_TO_MS : undefined,
				createOffsetMs: createOffsetHours != null ? BigInt(createOffsetHours) * HOURS_TO_MS : undefined,
				lockOffsetMs: lockOffsetMinutes != null ? BigInt(lockOffsetMinutes) * MINUTES_TO_MS : undefined,
				cleanupOffsetMs: cleanupOffsetHours != null ? BigInt(cleanupOffsetHours) * HOURS_TO_MS : undefined,
				announcementChannelId,
				announcementMessage,
				roomPingMessage: EventsCommand.ADD_OPTIONS.roomPingMessage.get(inter),
				maxRoomsPerUser: EventsCommand.ADD_OPTIONS.maxRoomsPerUser.get(inter),
				maxSubsPerUser: EventsCommand.ADD_OPTIONS.maxSubsPerUser.get(inter),
				parentSubMutuallyExclusive: EventsCommand.ADD_OPTIONS.parentSubMutuallyExclusive.get(inter),
				roleInRoomQueue: EventsCommand.ADD_OPTIONS.roleInRoomQueue.get(inter),
				roleOnRoomPull: EventsCommand.ADD_OPTIONS.roleOnRoomPull.get(inter),
				roleInSubQueue: EventsCommand.ADD_OPTIONS.roleInSubQueue.get(inter),
				roleOnSubPull: EventsCommand.ADD_OPTIONS.roleOnSubPull.get(inter),
				createDiscordEvent: EventsCommand.ADD_OPTIONS.createDiscordEvent.get(inter),
				discordEventDescription: EventsCommand.ADD_OPTIONS.discordEventDescription.get(inter),
			}, isNil),
		};

		if (announcementMessage && announcementChannelId) {
			verifyMentionEveryonePermission(inter, announcementMessage, announcementChannelId);
		}

		const event = await EventUtils.insertEvent(inter.store, newEvent);

		const eventQueues = Queries.selectManyEventQueues({ guildId: inter.guildId, eventId: event.id });
		const queues = eventQueues.map(eq => inter.store.dbQueues().get(eq.queueId)).filter(Boolean);

		await inter.respond(
			`Created event ${eventMention(event)} with ${queues.length} queues: ${queuesMention(queues)}.`,
			true,
		);

		await EventsCommand.events_get(inter, toCollection<bigint, DbEvent>("id", [event]));
	}

	// ====================================================================
	//                           /events set
	// ====================================================================

	static readonly SET_OPTIONS = {
		event: new EventOption({ required: true, description: "Target event" }),
		roomCount: new RoomCountOption({ description: "Number of rooms (grow only)" }),
		roomScheduling: new RoomSchedulingOption({ description: "Room timing (parallel/sequential)" }),
		roomLengthMinutes: new RoomLengthMinutesOption({ description: "Room length in minutes" }),
		createOffsetHours: new CreateOffsetHoursOption({ description: "Hours before start to open" }),
		lockOffsetMinutes: new LockOffsetMinutesOption({ description: "Minutes after start to lock" }),
		cleanupOffsetHours: new CleanupOffsetHoursOption({ description: "Hours after rooms finish to cleanup" }),
		announcementChannel: new AnnouncementChannelOption({ description: "Announcement channel" }),
		announcementMessage: new AnnouncementMessageOption({ description: "Use {event_name}, {start_time}, {start_time_relative}, {room_queues_channel}, {sub_queues_channel}" }),
		roomPingMessage: new RoomPingMessageOption({ description: "Use {room_role}, {room_name}, {event_name}, {start_time}, {ping_channel}, /events help for more" }),
		maxRoomsPerUser: new MaxRoomsPerUserOption({ description: "Max rooms per user (0=unlimited)" }),
		maxSubsPerUser: new MaxSubsPerUserOption({ description: "Max subs per user (0=unlimited)" }),
		parentSubMutuallyExclusive: new ParentSubMutuallyExclusiveOption({ description: "Room + matching sub mutually exclusive" }),
		roomCategory: new RoomCategoryOption({ description: "Category for per-room channels" }),
		roleInRoomQueue: new RoleInRoomQueueOption({ description: "Assign room role while in room queue" }),
		roleOnRoomPull: new RoleOnRoomPullOption({ description: "Assign room role on room queue pull" }),
		roleInSubQueue: new RoleInSubQueueOption({ description: "Assign room role while in sub queue" }),
		roleOnSubPull: new RoleOnSubPullOption({ description: "Assign room role on sub queue pull" }),
		createDiscordEvent: new CreateDiscordEventToggleOption({ description: "Create Discord scheduled event per occurrence" }),
		discordEventDescription: new DiscordEventDescriptionOption({ description: "Use {event_name}, {start_time}, {start_time_relative}, {room_queues_channel}, {sub_queues_channel}" }),
	};

	static async events_set(inter: SlashInteraction) {
		await inter.deferReply();
		const event = await EventsCommand.SET_OPTIONS.event.get(inter);
		const newRoomCategoryId = EventsCommand.SET_OPTIONS.roomCategory.get(inter)?.id;
		if (!newRoomCategoryId) {
			EventUtils.assertHasRoomCategory(event);
		}
		const roomLengthMinutes = EventsCommand.SET_OPTIONS.roomLengthMinutes.get(inter);
		const createOffsetHours = EventsCommand.SET_OPTIONS.createOffsetHours.get(inter);
		const lockOffsetMinutes = EventsCommand.SET_OPTIONS.lockOffsetMinutes.get(inter);
		const cleanupOffsetHours = EventsCommand.SET_OPTIONS.cleanupOffsetHours.get(inter);
		const announcementChannelId = EventsCommand.SET_OPTIONS.announcementChannel.get(inter)?.id;
		const announcementMessage = EventsCommand.SET_OPTIONS.announcementMessage.get(inter);

		const update = omitBy({
			roomCount: EventsCommand.SET_OPTIONS.roomCount.get(inter) ? BigInt(EventsCommand.SET_OPTIONS.roomCount.get(inter)) : undefined,
			roomScheduling: EventsCommand.SET_OPTIONS.roomScheduling.get(inter) as RoomScheduling,
			roomLengthMs: roomLengthMinutes ? BigInt(roomLengthMinutes) * MINUTES_TO_MS : undefined,
			createOffsetMs: createOffsetHours != null ? BigInt(createOffsetHours) * HOURS_TO_MS : undefined,
			lockOffsetMs: lockOffsetMinutes != null ? BigInt(lockOffsetMinutes) * MINUTES_TO_MS : undefined,
			cleanupOffsetMs: cleanupOffsetHours != null ? BigInt(cleanupOffsetHours) * HOURS_TO_MS : undefined,
			announcementChannelId,
			announcementMessage,
			roomPingMessage: EventsCommand.SET_OPTIONS.roomPingMessage.get(inter),
			maxRoomsPerUser: EventsCommand.SET_OPTIONS.maxRoomsPerUser.get(inter),
			maxSubsPerUser: EventsCommand.SET_OPTIONS.maxSubsPerUser.get(inter),
			parentSubMutuallyExclusive: EventsCommand.SET_OPTIONS.parentSubMutuallyExclusive.get(inter),
			roomCategoryId: EventsCommand.SET_OPTIONS.roomCategory.get(inter)?.id,
			roleInRoomQueue: EventsCommand.SET_OPTIONS.roleInRoomQueue.get(inter),
			roleOnRoomPull: EventsCommand.SET_OPTIONS.roleOnRoomPull.get(inter),
			roleInSubQueue: EventsCommand.SET_OPTIONS.roleInSubQueue.get(inter),
			roleOnSubPull: EventsCommand.SET_OPTIONS.roleOnSubPull.get(inter),
			createDiscordEvent: EventsCommand.SET_OPTIONS.createDiscordEvent.get(inter),
			discordEventDescription: EventsCommand.SET_OPTIONS.discordEventDescription.get(inter),
		}, isNil);

		const effectiveMessage = announcementMessage ?? event.announcementMessage;
		const effectiveChannel = announcementChannelId ?? event.announcementChannelId;
		if (effectiveMessage && effectiveChannel) {
			verifyMentionEveryonePermission(inter, effectiveMessage, effectiveChannel);
		}

		const updatedEvent = await EventUtils.updateEvent(inter.store, event, update);

		await inter.respond(`Updated ${eventMention(updatedEvent)}.`, true);
		await EventsCommand.events_get(inter, toCollection<bigint, DbEvent>("id", [updatedEvent]));
	}

	// ====================================================================
	//                     /events set-room-defaults
	// ====================================================================

	static readonly SET_ROOM_DEFAULTS_OPTIONS = {
		event: new EventOption({ required: true, description: "Target event" }),
		autopullToggle: new AutopullToggleOption({ description: "Autopull toggle" }),
		badgeToggle: new BadgeToggleOption({ description: "Badge toggle" }),
		buttonsToggle: new ButtonsToggleOption({ description: "Buttons toggle" }),
		color: new ColorOption({ description: "Queue color" }),
		displayUpdateType: new DisplayUpdateTypeOption({ description: "Display update type" }),
		dmOnPullToggle: new DmOnPullToggleOption({ description: "DM-on-pull toggle" }),
		header: new HeaderOption({ description: "Display header" }),
		inlineToggle: new InlineToggleOption({ description: "Inline toggle" }),
		lockToggle: new LockToggleOption({ description: "Lock toggle" }),
		memberDisplayType: new MemberDisplayTypeOption({ description: "Member display type" }),
		pullBatchSize: new PullBatchSizeOption({ description: "Pull batch size" }),
		pullMessage: new PullMessageOption({ description: "Pull message" }),
		pullMessageDisplayType: new PullMessageDisplayTypeOption({ description: "Pull message display type" }),
		pullMessageChannel: new PullMessageChannelOption({ description: "Pull message channel" }),
		rejoinCooldownPeriod: new RejoinCooldownPeriodOption({ description: "Rejoin cooldown (s)" }),
		rejoinGracePeriod: new RejoinGracePeriodOption({ description: "Rejoin grace (s)" }),
		requireMessageToJoin: new RequireMessageToJoinOption({ description: "Require message to join" }),
		roleInQueue: new RoleInQueueOption({ description: "In-queue role" }),
		roleOnPull: new RoleOnPullOption({ description: "On-pull role" }),
		size: new SizeOption({ description: "Size limit" }),
		timestampType: new TimestampTypeOption({ description: "Timestamp format" }),
		voiceOnlyToggle: new VoiceOnlyToggleOption({ description: "Voice-only toggle" }),
		voiceDestinationChannel: new VoiceDestinationChannelOption({ description: "Voice destination channel" }),
	};

	static async events_set_room_defaults(inter: SlashInteraction) {
		await EventsCommand.setDefaults(inter, EventQueueRole.Room, EventsCommand.SET_ROOM_DEFAULTS_OPTIONS);
	}

	// ====================================================================
	//                     /events set-sub-defaults
	// ====================================================================

	static readonly SET_SUB_DEFAULTS_OPTIONS = {
		event: new EventOption({ required: true, description: "Target event" }),
		autopullToggle: new AutopullToggleOption({ description: "Autopull toggle" }),
		badgeToggle: new BadgeToggleOption({ description: "Badge toggle" }),
		buttonsToggle: new ButtonsToggleOption({ description: "Buttons toggle" }),
		color: new ColorOption({ description: "Queue color" }),
		displayUpdateType: new DisplayUpdateTypeOption({ description: "Display update type" }),
		dmOnPullToggle: new DmOnPullToggleOption({ description: "DM-on-pull toggle" }),
		header: new HeaderOption({ description: "Display header" }),
		inlineToggle: new InlineToggleOption({ description: "Inline toggle" }),
		lockToggle: new LockToggleOption({ description: "Lock toggle" }),
		memberDisplayType: new MemberDisplayTypeOption({ description: "Member display type" }),
		pullBatchSize: new PullBatchSizeOption({ description: "Pull batch size" }),
		pullMessage: new PullMessageOption({ description: "Pull message" }),
		pullMessageDisplayType: new PullMessageDisplayTypeOption({ description: "Pull message display type" }),
		pullMessageChannel: new PullMessageChannelOption({ description: "Pull message channel" }),
		rejoinCooldownPeriod: new RejoinCooldownPeriodOption({ description: "Rejoin cooldown (s)" }),
		rejoinGracePeriod: new RejoinGracePeriodOption({ description: "Rejoin grace (s)" }),
		requireMessageToJoin: new RequireMessageToJoinOption({ description: "Require message to join" }),
		roleInQueue: new RoleInQueueOption({ description: "In-queue role" }),
		roleOnPull: new RoleOnPullOption({ description: "On-pull role" }),
		size: new SizeOption({ description: "Size limit" }),
		timestampType: new TimestampTypeOption({ description: "Timestamp format" }),
		voiceOnlyToggle: new VoiceOnlyToggleOption({ description: "Voice-only toggle" }),
		voiceDestinationChannel: new VoiceDestinationChannelOption({ description: "Voice destination channel" }),
	};

	static async events_set_sub_defaults(inter: SlashInteraction) {
		await EventsCommand.setDefaults(inter, EventQueueRole.Sub, EventsCommand.SET_SUB_DEFAULTS_OPTIONS);
	}

	private static async setDefaults(inter: SlashInteraction, role: EventQueueRole, options: typeof EventsCommand.SET_ROOM_DEFAULTS_OPTIONS) {
		await inter.deferReply();
		const event = await options.event.get(inter);
		EventUtils.assertHasRoomCategory(event);

		const update = omitBy({
			autopullToggle: options.autopullToggle.get(inter),
			badgeToggle: options.badgeToggle.get(inter),
			buttonsToggle: options.buttonsToggle.get(inter),
			color: options.color.get(inter),
			displayUpdateType: options.displayUpdateType.get(inter),
			dmOnPullToggle: options.dmOnPullToggle.get(inter),
			header: options.header.get(inter),
			inlineToggle: options.inlineToggle.get(inter),
			lockToggle: options.lockToggle.get(inter),
			memberDisplayType: options.memberDisplayType.get(inter),
			pullBatchSize: options.pullBatchSize.get(inter),
			pullMessage: options.pullMessage.get(inter),
			pullMessageDisplayType: options.pullMessageDisplayType.get(inter),
			pullMessageChannelId: options.pullMessageChannel.get(inter)?.id,
			rejoinCooldownPeriod: options.rejoinCooldownPeriod.get(inter),
			rejoinGracePeriod: options.rejoinGracePeriod.get(inter),
			requireMessageToJoin: options.requireMessageToJoin.get(inter),
			roleInQueueId: options.roleInQueue.get(inter)?.id,
			roleOnPullId: options.roleOnPull.get(inter)?.id,
			size: options.size.get(inter),
			timestampType: options.timestampType.get(inter),
			voiceOnlyToggle: options.voiceOnlyToggle.get(inter),
			voiceDestinationChannelId: options.voiceDestinationChannel.get(inter)?.id,
		}, isNil);

		await EventUtils.setRoleDefaults(inter.store, event, role, update);

		await inter.respond(`Updated ${role} queue defaults for ${eventMention(event)}.`, true);
	}

	// ====================================================================
	//                     /events add-room-channel
	// ====================================================================

	static readonly ADD_ROOM_CHANNEL_OPTIONS = {
		event: new EventOption({ required: true, description: "Target event" }),
		suffix: new ChannelSuffixOption({ required: true, description: "Suffix (e.g. \"code\" → room-code-{N})" }),
		slowmode: new SlowmodeOption({ description: "Slowmode value (0=none)" }),
		slowmodeTime: new SlowmodeTimeOption({ description: "Slowmode unit" }),
	};

	static async events_add_room_channel(inter: SlashInteraction) {
		await inter.deferReply();
		const event = await EventsCommand.ADD_ROOM_CHANNEL_OPTIONS.event.get(inter);
		EventUtils.assertHasRoomCategory(event);
		const suffix = EventsCommand.ADD_ROOM_CHANNEL_OPTIONS.suffix.get(inter);
		const slowmode = EventsCommand.ADD_ROOM_CHANNEL_OPTIONS.slowmode.get(inter);
		const slowmodeTime = EventsCommand.ADD_ROOM_CHANNEL_OPTIONS.slowmodeTime.get(inter);
		const slowmodeSeconds = EventChannelUtils.toSlowmodeSeconds(slowmode, slowmodeTime);

		const cleanSuffix = suffix.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
		if (!cleanSuffix) {
			throw new CustomError({
				message: "Suffix must contain at least one alphanumeric character.",
			});
		}

		inter.store.insertRoomChannelTemplate({
			guildId: inter.guildId,
			eventId: event.id,
			suffix: cleanSuffix,
			slowmodeSeconds: slowmodeSeconds > 0 ? BigInt(slowmodeSeconds) : null,
		});

		const report = await EventChannelUtils.reconcileRoomChannels(inter.store, event);

		const adoptedSuffix = report.adopted.length > 0
			? ` Adopted ${report.adopted.length} existing channel${report.adopted.length === 1 ? "" : "s"}.`
			: "";
		await inter.respond(
			`Added ${inlineCode(`room-${cleanSuffix}-{N}`)} channel template to ${eventMention(event)}${slowmodeSeconds > 0 ? ` (slowmode: ${slowmodeSeconds}s)` : ""}.${adoptedSuffix}`,
			true,
		);
	}

	// ====================================================================
	//                   /events remove-room-channel
	// ====================================================================

	static readonly REMOVE_ROOM_CHANNEL_OPTIONS = {
		event: new EventOption({ required: true, description: "Target event" }),
		suffix: new ChannelSuffixOption({ required: true, description: "Suffix to remove (autocompletes)" }),
	};

	static async events_remove_room_channel(inter: SlashInteraction) {
		await inter.deferReply();
		const event = await EventsCommand.REMOVE_ROOM_CHANNEL_OPTIONS.event.get(inter);
		EventUtils.assertHasRoomCategory(event);
		const suffix = EventsCommand.REMOVE_ROOM_CHANNEL_OPTIONS.suffix.get(inter);

		const templates = Queries.selectManyRoomChannelTemplates({ guildId: inter.guildId, eventId: event.id });
		const tmpl = templates.find(t => t.suffix === suffix);
		if (!tmpl) {
			throw new CustomError({
				message: `No channel template with suffix ${inlineCode(suffix)} found for ${eventMention(event)}.`,
			});
		}

		EventChannelUtils.untrackChannelsForSuffix(inter.store, event, suffix);
		inter.store.deleteRoomChannelTemplate({ eventId: event.id, suffix });

		await inter.respond(
			`Removed ${inlineCode(`room-${suffix}-{N}`)} channel template from ${eventMention(event)}. Existing channels are left in place — re-adding the template will adopt them.`,
			true,
		);
	}

	// ====================================================================
	//                   /events sync-room-channels
	// ====================================================================

	static readonly SYNC_ROOM_CHANNELS_OPTIONS = {
		event: new EventOption({ description: "Event to sync (omit = all)" }),
	};

	static async events_sync_room_channels(inter: SlashInteraction) {
		await inter.deferReply();
		const event = await EventsCommand.SYNC_ROOM_CHANNELS_OPTIONS.event.get(inter).catch((e: unknown) => {
			if (e instanceof EventNotFoundWarning) return undefined;
			throw e;
		});

		if (event) {
			EventUtils.assertHasRoomCategory(event);
			const report = await EventChannelUtils.reconcileRoomChannels(inter.store, event);
			await inter.respond(renderSyncReport(report), true);
			return;
		}

		const allEvents = [...inter.store.dbEvents().values()];
		const targeted = allEvents.filter(e => !!e.roomCategoryId);

		if (targeted.length === 0) {
			await inter.respond(`No events have a ${inlineCode("room_category")} configured. Set one with ${commandMention("events", "set")}.`);
			return;
		}

		const { reports, skipped } = await EventChannelUtils.reconcileAllGuildEvents(inter.store);

		const skippedSuffix = skipped.length > 0
			? `, skipped ${skipped.length} event(s) already in progress: ${skipped.map(e => inlineCode(e.name)).join(", ")}`
			: "";
		const header = `Synced room channels for ${reports.length} event(s)${skippedSuffix}:`;
		const blocks = reports.map(renderSyncReport);
		const combined = `${header}\n\n${blocks.join("\n\n")}`;

		if (combined.length <= DISCORD_MESSAGE_LIMIT) {
			await inter.respond(combined, true);
		}
		else {
			const embed = new EmbedBuilder().setTitle(header);
			for (const report of reports) {
				embed.addFields({
					name: report.eventName,
					value: renderSyncReport(report).split("\n").slice(1).join("\n") || "(no changes)",
				});
			}
			await inter.respond({ embeds: [embed] }, true);
		}
	}

	// ====================================================================
	//                       /events sync-queues
	// ====================================================================

	static readonly SYNC_QUEUES_OPTIONS = {
		event: new EventOption({ description: "Event to sync (omit = all)" }),
	};

	static async events_sync_queues(inter: SlashInteraction) {
		await inter.deferReply();
		const event = await EventsCommand.SYNC_QUEUES_OPTIONS.event.get(inter).catch((e: unknown) => {
			if (e instanceof EventNotFoundWarning) return undefined;
			throw e;
		});

		if (event) {
			EventUtils.assertHasRoomCategory(event);
			const result = await EventUtils.syncEventQueues(inter.store, event);
			await inter.respond(
				`Synced queues for ${eventMention(event)}: recreated ${result.recreatedCount} queue(s), ` +
				`re-applied defaults to ${result.reappliedRoomCount} room + ${result.reappliedSubCount} sub queue(s), ` +
				`re-posted ${result.reshownCount} display(s).`,
				true,
			);
			return;
		}

		const allEvents = [...inter.store.dbEvents().values()];
		const targeted = allEvents.filter(e => !!e.roomCategoryId);

		if (targeted.length === 0) {
			await inter.respond(`No events have a ${inlineCode("room_category")} configured. Set one with ${commandMention("events", "set")}.`);
			return;
		}

		let recreatedTotal = 0;
		let reappliedRoomTotal = 0;
		let reappliedSubTotal = 0;
		let reshownTotal = 0;
		const skipped: DbEvent[] = [];
		for (const ev of targeted) {
			const result = await EventSyncLock.tryWithLock(inter.store.guild.id, ev.id, () =>
				EventUtils.syncEventQueues(inter.store, ev)
			);
			if (result === "skipped") {
				skipped.push(ev);
				continue;
			}
			recreatedTotal += result.recreatedCount;
			reappliedRoomTotal += result.reappliedRoomCount;
			reappliedSubTotal += result.reappliedSubCount;
			reshownTotal += result.reshownCount;
		}

		const syncedCount = targeted.length - skipped.length;
		const skippedSuffix = skipped.length > 0
			? `, skipped ${skipped.length} event(s) already in progress: ${skipped.map(e => inlineCode(e.name)).join(", ")}`
			: "";
		await inter.respond(
			`Synced queues for ${syncedCount} event(s): recreated ${recreatedTotal} queue(s), ` +
			`re-applied defaults to ${reappliedRoomTotal} room + ${reappliedSubTotal} sub queue(s), ` +
			`re-posted ${reshownTotal} display(s)${skippedSuffix}.`,
			true,
		);
	}

	// ====================================================================
	//                           /events reset
	// ====================================================================

	static readonly RESET_OPTIONS = {
		event: new EventOption({ required: true, description: "Target event" }),
	};

	static async events_reset(inter: SlashInteraction) {
		await inter.deferReply();
		const event = await EventsCommand.RESET_OPTIONS.event.get(inter);
		EventUtils.assertHasRoomCategory(event);

		const ANNOUNCEMENT_PAIR_VALUE = "__announcement_pair__";
		const selectMenuOptions = [
			{ name: CreateOffsetHoursOption.ID, value: EVENT_TABLE.createOffsetMs.name },
			{ name: LockOffsetMinutesOption.ID, value: EVENT_TABLE.lockOffsetMs.name },
			{ name: CleanupOffsetHoursOption.ID, value: EVENT_TABLE.cleanupOffsetMs.name },
			{ name: RoomSchedulingOption.ID, value: EVENT_TABLE.roomScheduling.name },
			{ name: RoomLengthMinutesOption.ID, value: EVENT_TABLE.roomLengthMs.name },
			{ name: `${AnnouncementChannelOption.ID} + ${AnnouncementMessageOption.ID}`, value: ANNOUNCEMENT_PAIR_VALUE },
			{ name: RoomPingMessageOption.ID, value: EVENT_TABLE.roomPingMessage.name },
			{ name: RoleInRoomQueueOption.ID, value: EVENT_TABLE.roleInRoomQueue.name },
			{ name: RoleOnRoomPullOption.ID, value: EVENT_TABLE.roleOnRoomPull.name },
			{ name: RoleInSubQueueOption.ID, value: EVENT_TABLE.roleInSubQueue.name },
			{ name: RoleOnSubPullOption.ID, value: EVENT_TABLE.roleOnSubPull.name },
			{ name: CreateDiscordEventToggleOption.ID, value: EVENT_TABLE.createDiscordEvent.name },
			{ name: DiscordEventDescriptionOption.ID, value: EVENT_TABLE.discordEventDescription.name },
		];
		const selectMenuTransactor = new SelectMenuTransactor(inter);
		const propertiesToReset = await selectMenuTransactor.sendAndReceive("Event properties to reset", selectMenuOptions) ?? [];
		if (propertiesToReset.length === 0) return;

		const update: Partial<DbEvent> = {};
		const resetLabels: string[] = [];
		for (const property of propertiesToReset) {
			if (property === ANNOUNCEMENT_PAIR_VALUE) {
				update.announcementChannelId = null;
				update.announcementMessage = null;
				resetLabels.push(AnnouncementChannelOption.ID, AnnouncementMessageOption.ID);
				continue;
			}
			const columnKey = findKey(EVENT_TABLE, (column: SQLiteColumn) => column.name === property);
			if (!columnKey) continue;
			(update as any)[columnKey] = (EVENT_TABLE as any)[columnKey]?.default ?? null;
			resetLabels.push(property);
		}

		await EventUtils.updateEvent(inter.store, event, update);

		const propertiesStr = resetLabels.map(inlineCode).join(", ");
		const haveWord = resetLabels.length === 1 ? "has" : "have";
		await selectMenuTransactor.updateWithResult(
			"Reset event properties",
			`${propertiesStr} ${haveWord} been reset for ${eventMention(event)}.`,
		);

		await EventsCommand.events_get(inter, toCollection<bigint, DbEvent>("id", [event]));
	}

	// ====================================================================
	//                     /events reset-room-defaults
	// ====================================================================

	static readonly RESET_ROOM_DEFAULTS_OPTIONS = {
		event: new EventOption({ required: true, description: "Target event" }),
	};

	static async events_reset_room_defaults(inter: SlashInteraction) {
		await EventsCommand.resetDefaults(inter, EventQueueRole.Room, EventsCommand.RESET_ROOM_DEFAULTS_OPTIONS);
	}

	// ====================================================================
	//                     /events reset-sub-defaults
	// ====================================================================

	static readonly RESET_SUB_DEFAULTS_OPTIONS = {
		event: new EventOption({ required: true, description: "Target event" }),
	};

	static async events_reset_sub_defaults(inter: SlashInteraction) {
		await EventsCommand.resetDefaults(inter, EventQueueRole.Sub, EventsCommand.RESET_SUB_DEFAULTS_OPTIONS);
	}

	private static async resetDefaults(
		inter: SlashInteraction,
		role: EventQueueRole,
		options: typeof EventsCommand.RESET_ROOM_DEFAULTS_OPTIONS,
	) {
		await inter.deferReply();
		const event = await options.event.get(inter);
		EventUtils.assertHasRoomCategory(event);

		const selectMenuOptions = [
			{ name: AutopullToggleOption.ID, value: QUEUE_TABLE.autopullToggle.name },
			{ name: BadgeToggleOption.ID, value: QUEUE_TABLE.badgeToggle.name },
			{ name: ButtonsToggleOption.ID, value: QUEUE_TABLE.buttonsToggle.name },
			{ name: ColorOption.ID, value: QUEUE_TABLE.color.name },
			{ name: DisplayUpdateTypeOption.ID, value: QUEUE_TABLE.displayUpdateType.name },
			{ name: DmOnPullToggleOption.ID, value: QUEUE_TABLE.dmOnPullToggle.name },
			{ name: HeaderOption.ID, value: QUEUE_TABLE.header.name },
			{ name: InlineToggleOption.ID, value: QUEUE_TABLE.inlineToggle.name },
			{ name: LockToggleOption.ID, value: QUEUE_TABLE.lockToggle.name },
			{ name: MemberDisplayTypeOption.ID, value: QUEUE_TABLE.memberDisplayType.name },
			{ name: PullBatchSizeOption.ID, value: QUEUE_TABLE.pullBatchSize.name },
			{ name: PullMessageOption.ID, value: QUEUE_TABLE.pullMessage.name },
			{ name: PullMessageDisplayTypeOption.ID, value: QUEUE_TABLE.pullMessageDisplayType.name },
			{ name: PullMessageChannelOption.ID, value: QUEUE_TABLE.pullMessageChannelId.name },
			{ name: RejoinCooldownPeriodOption.ID, value: QUEUE_TABLE.rejoinCooldownPeriod.name },
			{ name: RejoinGracePeriodOption.ID, value: QUEUE_TABLE.rejoinGracePeriod.name },
			{ name: RequireMessageToJoinOption.ID, value: QUEUE_TABLE.requireMessageToJoin.name },
			{ name: RoleInQueueOption.ID, value: QUEUE_TABLE.roleInQueueId.name },
			{ name: RoleOnPullOption.ID, value: QUEUE_TABLE.roleOnPullId.name },
			{ name: SizeOption.ID, value: QUEUE_TABLE.size.name },
			{ name: TimestampTypeOption.ID, value: QUEUE_TABLE.timestampType.name },
			{ name: VoiceOnlyToggleOption.ID, value: QUEUE_TABLE.voiceOnlyToggle.name },
			{ name: VoiceDestinationChannelOption.ID, value: QUEUE_TABLE.voiceDestinationChannelId.name },
		];
		const selectMenuTransactor = new SelectMenuTransactor(inter);
		const propertiesToReset = await selectMenuTransactor.sendAndReceive(
			`${role} queue defaults to reset`,
			selectMenuOptions,
		) ?? [];
		if (propertiesToReset.length === 0) return;

		await EventUtils.resetRoleDefaults(inter.store, event, role, propertiesToReset);

		const propertiesStr = propertiesToReset.map(inlineCode).join(", ");
		const haveWord = propertiesToReset.length === 1 ? "has" : "have";
		await selectMenuTransactor.updateWithResult(
			`Reset ${role} queue defaults`,
			`${propertiesStr} ${haveWord} been reset for ${role} queues of ${eventMention(event)}.`,
		);

		await EventsCommand.events_get(inter, toCollection<bigint, DbEvent>("id", [event]));
	}

	// ====================================================================
	//                           /events schedule
	// ====================================================================

	static readonly SCHEDULE_OPTIONS = {
		event: new EventOption({ required: true, description: "Target event" }),
	};

	static async events_schedule(inter: SlashInteraction) {
		const event = await EventsCommand.SCHEDULE_OPTIONS.event.get(inter);
		EventUtils.assertHasRoomCategory(event);
		await inter.showModal(EventScheduleModal.getModal({ eventId: event.id }));
	}

	// ====================================================================
	//                           /events cancel
	// ====================================================================

	static readonly CANCEL_OPTIONS = {
		event: new EventOption({ required: true, description: "Target event" }),
	};

	static async events_cancel(inter: SlashInteraction) {
		await inter.deferReply();
		const event = await EventsCommand.CANCEL_OPTIONS.event.get(inter);
		EventUtils.assertHasRoomCategory(event);
		const occurrences = Queries.selectManyOccurrences({ guildId: inter.guildId, eventId: event.id });

		if (occurrences.length === 0) {
			await inter.respond(`No pending occurrences for ${eventMention(event)}.`);
			return;
		}

		const selectMenuOptions = occurrences
			.sort((a, b) => Number(a.startTime) - Number(b.startTime))
			.map(occ => ({
				name: `${time(new Date(Number(occ.startTime)), TimestampStyles.LongDateTime)}`,
				value: occ.id.toString(),
			}));

		const selectMenuTransactor = new SelectMenuTransactor(inter);
		const result = await selectMenuTransactor.sendAndReceive("Select occurrence to cancel", selectMenuOptions);
		if (!result || result.length === 0) return;

		for (const idStr of result) {
			const occ = occurrences.find(o => o.id === BigInt(idStr));
			if (occ) {
				await EventUtils.cancelOccurrence(inter.store, occ);
			}
		}

		await inter.respond(
			`Cancelled ${result.length} occurrence(s) of ${eventMention(event)}. (NOTE: queues remain in their current state.)`,
			true,
		);
	}

	// ====================================================================
	//                           /events delete
	// ====================================================================

	static readonly DELETE_OPTIONS = {
		event: new EventOption({ required: true, description: "Target event" }),
	};

	static async events_delete(inter: SlashInteraction) {
		await inter.deferReply();
		const event = await EventsCommand.DELETE_OPTIONS.event.get(inter);
		EventUtils.assertHasRoomCategory(event);

		const confirmed = await inter.promptConfirmOrCancel(
			`Are you sure you want to delete the ${eventMention(event)} event? This will also delete all associated queues and displays.`,
		);
		if (!confirmed) {
			await inter.respond("Cancelled delete.");
			return;
		}

		await EventUtils.deleteEvent(inter.store, event);

		await inter.respond(`Deleted the ${eventMention(event)} event and all its queues.`, true);
	}

	// ====================================================================
	//                           /events help
	// ====================================================================

	static async events_help(inter: SlashInteraction) {
		await inter.deferReply({ ephemeral: true });
		const embeds = [new EmbedBuilder()
			.setTitle("Events")
			.setColor(Color.Indigo)
			.setDescription(
				"Events let you create recurring event templates with auto-managed room and sub queues.\n\n" +
				"**Quick start:**\n" +
				`1. ${commandMention("events", "add")} — create an event with N rooms (${inlineCode("room_category")} is required; one private \`room-{N}\` channel and a \`{event} Room {N}\` role are auto-created per room)\n` +
				`2. ${commandMention("events", "set-room-defaults")} — configure room queue defaults (size, etc.)\n` +
				`3. ${commandMention("events", "schedule")} — schedule an occurrence (opens a date/time modal)\n\n` +
				"**Lifecycle per occurrence:**\n" +
				"- **T − create_offset** (default 24h before): queues unlock, displays refresh, announcement posts\n" +
				"- **T + lock_offset** (default 0): room queues lock (sub queues stay open)\n" +
				"- **Per-room ping**: at each room's start time a ping posts in the room's channel\n" +
				"- **rooms_finish + cleanup_offset** (default 1h after rooms finish): all members cleared, all queues locked\n" +
				"- A native Discord scheduled event is created per occurrence when `create_discord_event` is on (default).\n\n" +
				"**Missed actions** (bot was down): run automatically on next startup.\n\n" +
				"**Signup policies** (set via `/events add` or `/events set`):\n" +
				"- `max_rooms_per_user` — cap on room queues a single user may sit in at once (`0` = unlimited)\n" +
				"- `max_subs_per_user` — cap on sub-room queues (`0` = unlimited)\n" +
				"- `parent_sub_mutually_exclusive` — when `true` (default), a user can't sit in both a room and its matching sub. Joining the room silently removes them from the sub; joining the sub while already in the room is blocked.\n\n" +
				"**Room role assignment** — four booleans on the event template control which queues the auto-created `{event} Room {N}` role gets wired into:\n" +
				"- `role_in_room_queue` (default `false`) — assign the role while a user is in the room queue\n" +
				"- `role_on_room_pull` (default `false`) — assign the role when a user is pulled from the room queue\n" +
				"- `role_in_sub_queue` (default `false`) — assign the role while a user is in the sub queue\n" +
				"- `role_on_sub_pull` (default `false`) — assign the role when a user is pulled from the sub queue\n\n" +
				"**Extra per-room channels:**\n" +
				`- ${commandMention("events", "add-room-channel")} adds an extra per-room channel like \`room-code-{N}\`, with optional slowmode.\n` +
				`- ${commandMention("events", "remove-room-channel")} removes one of those templates and its channels.\n` +
				`- ${commandMention("events", "sync-room-channels")} recreates any channels you accidentally deleted, re-applies permissions, and restores channel order.\n` +
				`- ${commandMention("events", "sync-queues")} recreates any deleted queues, re-applies the room/sub defaults to every queue, and re-posts displays in queue-index order.\n\n` +
				"**Announcement placeholders:** `{event_name}`, `{start_time}`, `{start_time_relative}`, `{room_queues_channel}`, `{sub_queues_channel}`\n" +
				"**Ping placeholders:** `{room_role}`, `{room_name}`, `{room_index}`, `{room_queues_channel}`, `{ping_channel}`, `{start_time}`, `{start_time_relative}`",
			)];

		await inter.respond({ embeds });
	}
}
