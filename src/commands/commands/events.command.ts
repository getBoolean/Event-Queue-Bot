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
import { CleanupOffsetHoursOption } from "../../options/options/cleanup-offset-hours.option.ts";
import { ColorOption } from "../../options/options/color.option.ts";
import { CreateOffsetHoursOption } from "../../options/options/create-offset-hours.option.ts";
import { ButtonsToggleOption } from "../../options/options/display-buttons.option.ts";
import { DisplayUpdateTypeOption } from "../../options/options/display-update-type.option.ts";
import { DmOnPullToggleOption } from "../../options/options/dm-on-pull-toggle.option.ts";
import { EventOption } from "../../options/options/event.option.ts";
import { EventsOption } from "../../options/options/events.option.ts";
import { HeaderOption } from "../../options/options/header.option.ts";
import { InlineToggleOption } from "../../options/options/inline-toggle.option.ts";
import { LockOffsetMinutesOption } from "../../options/options/lock-offset-minutes.option.ts";
import { LockToggleOption } from "../../options/options/lock-toggle.option.ts";
import { MemberDisplayTypeOption } from "../../options/options/member-display-type.option.ts";
import { NameOption } from "../../options/options/name.option.ts";
import { PingChannelOption } from "../../options/options/ping-channel.option.ts";
import { PullBatchSizeOption } from "../../options/options/pull-batch-size.option.ts";
import { PullMessageOption } from "../../options/options/pull-message.option.ts";
import { PullMessageChannelOption } from "../../options/options/pull-message-channel.option.ts";
import { PullMessageDisplayTypeOption } from "../../options/options/pull-message-display-type.option.ts";
import { RejoinCooldownPeriodOption } from "../../options/options/rejoin-cooldown-period.option.ts";
import { RejoinGracePeriodOption } from "../../options/options/rejoin-grace-period.option.ts";
import { RequireMessageToJoinOption } from "../../options/options/require-message-to-join.option.ts";
import { RoleInQueueOption } from "../../options/options/role-in-queue.option.ts";
import { RoleOnPullOption } from "../../options/options/role-on-pull.option.ts";
import { RoomChannelOption } from "../../options/options/room-channel.option.ts";
import { RoomCountOption } from "../../options/options/room-count.option.ts";
import { RoomIndexOption } from "../../options/options/room-index.option.ts";
import { RoomLengthMinutesOption } from "../../options/options/room-length-minutes.option.ts";
import { RoomPingMessageOption } from "../../options/options/room-ping-message.option.ts";
import { RoomSchedulingOption } from "../../options/options/room-scheduling.option.ts";
import { SizeOption } from "../../options/options/size.option.ts";
import { SubChannelOption } from "../../options/options/sub-channel.option.ts";
import { TimestampTypeOption } from "../../options/options/timestamp-type.option.ts";
import { VoiceDestinationChannelOption } from "../../options/options/voice-destination-channel.option.ts";
import { VoiceOnlyToggleOption } from "../../options/options/voice-only-toggle.option.ts";
import { AdminCommand } from "../../types/command.types.ts";
import { Color, EventQueueRole, type RoomScheduling } from "../../types/db.types.ts";
import type { SlashInteraction } from "../../types/interaction.types.ts";
import { CustomError, RoomIndexNotFoundError } from "../../utils/error.utils.ts";
import { EventUtils } from "../../utils/event.utils.ts";
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

export class EventsCommand extends AdminCommand {
	static readonly ID = "events";
	deferResponse = false;

	events_get = EventsCommand.events_get;
	events_add = EventsCommand.events_add;
	events_set = EventsCommand.events_set;
	events_set_room_defaults = EventsCommand.events_set_room_defaults;
	events_set_sub_defaults = EventsCommand.events_set_sub_defaults;
	events_set_room = EventsCommand.events_set_room;
	events_reset = EventsCommand.events_reset;
	events_reset_room = EventsCommand.events_reset_room;
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
				.setDescription("Get event details");
			Object.values(EventsCommand.GET_OPTIONS).forEach(option => option.addToCommand(subcommand));
			return subcommand;
		})
		.addSubcommand(subcommand => {
			subcommand
				.setName("add")
				.setDescription("Create an event template with room and sub queues");
			Object.values(EventsCommand.ADD_OPTIONS).forEach(option => option.addToCommand(subcommand));
			return subcommand;
		})
		.addSubcommand(subcommand => {
			subcommand
				.setName("set")
				.setDescription("Update event template properties");
			Object.values(EventsCommand.SET_OPTIONS).forEach(option => option.addToCommand(subcommand));
			return subcommand;
		})
		.addSubcommand(subcommand => {
			subcommand
				.setName("set-room-defaults")
				.setDescription("Set default queue properties for room queues");
			Object.values(EventsCommand.SET_ROOM_DEFAULTS_OPTIONS).forEach(option => option.addToCommand(subcommand));
			return subcommand;
		})
		.addSubcommand(subcommand => {
			subcommand
				.setName("set-sub-defaults")
				.setDescription("Set default queue properties for sub queues");
			Object.values(EventsCommand.SET_SUB_DEFAULTS_OPTIONS).forEach(option => option.addToCommand(subcommand));
			return subcommand;
		})
		.addSubcommand(subcommand => {
			subcommand
				.setName("set-room")
				.setDescription("Set per-room overrides (e.g. ping channel)");
			Object.values(EventsCommand.SET_ROOM_OPTIONS).forEach(option => option.addToCommand(subcommand));
			return subcommand;
		})
		.addSubcommand(subcommand => {
			subcommand
				.setName("reset")
				.setDescription("Reset event template properties");
			Object.values(EventsCommand.RESET_OPTIONS).forEach(option => option.addToCommand(subcommand));
			return subcommand;
		})
		.addSubcommand(subcommand => {
			subcommand
				.setName("reset-room")
				.setDescription("Clear per-room overrides (e.g. ping channel)");
			Object.values(EventsCommand.RESET_ROOM_OPTIONS).forEach(option => option.addToCommand(subcommand));
			return subcommand;
		})
		.addSubcommand(subcommand => {
			subcommand
				.setName("reset-room-defaults")
				.setDescription("Reset default queue properties for room queues");
			Object.values(EventsCommand.RESET_ROOM_DEFAULTS_OPTIONS).forEach(option => option.addToCommand(subcommand));
			return subcommand;
		})
		.addSubcommand(subcommand => {
			subcommand
				.setName("reset-sub-defaults")
				.setDescription("Reset default queue properties for sub queues");
			Object.values(EventsCommand.RESET_SUB_DEFAULTS_OPTIONS).forEach(option => option.addToCommand(subcommand));
			return subcommand;
		})
		.addSubcommand(subcommand => {
			subcommand
				.setName("schedule")
				.setDescription("Schedule an event occurrence");
			Object.values(EventsCommand.SCHEDULE_OPTIONS).forEach(option => option.addToCommand(subcommand));
			return subcommand;
		})
		.addSubcommand(subcommand => {
			subcommand
				.setName("cancel")
				.setDescription("Cancel a pending event occurrence");
			Object.values(EventsCommand.CANCEL_OPTIONS).forEach(option => option.addToCommand(subcommand));
			return subcommand;
		})
		.addSubcommand(subcommand => {
			subcommand
				.setName("delete")
				.setDescription("Delete an event and all its queues");
			Object.values(EventsCommand.DELETE_OPTIONS).forEach(option => option.addToCommand(subcommand));
			return subcommand;
		})
		.addSubcommand(subcommand => {
			subcommand
				.setName("help")
				.setDescription("Info about creating and managing events");
			return subcommand;
		});

	// ====================================================================
	//                           /events get
	// ====================================================================

	static readonly GET_OPTIONS = {
		events: new EventsOption({ description: "Get specific event(s)" }),
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
			return {
				...event,
				createOffsetMs: `${Number(event.createOffsetMs) / 3_600_000}h`,
				lockOffsetMs: `${Number(event.lockOffsetMs) / 60_000}min`,
				cleanupOffsetMs: `${Number(event.cleanupOffsetMs) / 3_600_000}h`,
				roomLengthMs: event.roomLengthMs ? `${Number(event.roomLengthMs) / 60_000}min` : null,
				nextOccurrence: nextOcc ? time(new Date(Number(nextOcc.startTime)), TimestampStyles.LongDateTime) : "None",
				roomChannelId: channelMention(event.roomChannelId),
				subChannelId: channelMention(event.subChannelId),
				announcementChannelId: event.announcementChannelId ? channelMention(event.announcementChannelId) : null,
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
		name: new NameOption({ required: true, description: "Name of the event" }),
		roomCount: new RoomCountOption({ required: true, description: "Number of rooms" }),
		roomChannel: new RoomChannelOption({ required: true, description: "Channel for room queues" }),
		subChannel: new SubChannelOption({ required: true, description: "Channel for sub queues" }),
		roomScheduling: new RoomSchedulingOption({ description: "How rooms are timed (parallel or sequential)" }),
		roomLengthMinutes: new RoomLengthMinutesOption({ description: "Length of each room in minutes (required for sequential)" }),
		createOffsetHours: new CreateOffsetHoursOption({ description: "Hours before start to open queues" }),
		lockOffsetMinutes: new LockOffsetMinutesOption({ description: "Minutes after start to lock rooms (negative = before)" }),
		cleanupOffsetHours: new CleanupOffsetHoursOption({ description: "Hours after start to clear and lock queues" }),
		announcementChannel: new AnnouncementChannelOption({ description: "Channel for event announcements" }),
		announcementMessage: new AnnouncementMessageOption({ description: "Announcement template ({event_name}, {start_time}, etc.)" }),
		roomPingMessage: new RoomPingMessageOption({ description: "Room ping template ({room_role}, {room_name}, etc.)" }),
	};

	static async events_add(inter: SlashInteraction) {
		await inter.deferReply({ ephemeral: true });
		const roomLengthMinutes = EventsCommand.ADD_OPTIONS.roomLengthMinutes.get(inter);
		const createOffsetHours = EventsCommand.ADD_OPTIONS.createOffsetHours.get(inter);
		const lockOffsetMinutes = EventsCommand.ADD_OPTIONS.lockOffsetMinutes.get(inter);
		const cleanupOffsetHours = EventsCommand.ADD_OPTIONS.cleanupOffsetHours.get(inter);
		const announcementChannelId = EventsCommand.ADD_OPTIONS.announcementChannel.get(inter)?.id;
		const announcementMessage = EventsCommand.ADD_OPTIONS.announcementMessage.get(inter);

		const newEvent = {
			name: EventsCommand.ADD_OPTIONS.name.get(inter)?.substring(0, 240),
			roomCount: BigInt(EventsCommand.ADD_OPTIONS.roomCount.get(inter)),
			roomChannelId: EventsCommand.ADD_OPTIONS.roomChannel.get(inter)?.id,
			subChannelId: EventsCommand.ADD_OPTIONS.subChannel.get(inter)?.id,
			...omitBy({
				roomScheduling: EventsCommand.ADD_OPTIONS.roomScheduling.get(inter) as RoomScheduling,
				roomLengthMs: roomLengthMinutes ? BigInt(roomLengthMinutes) * MINUTES_TO_MS : undefined,
				createOffsetMs: createOffsetHours != null ? BigInt(createOffsetHours) * HOURS_TO_MS : undefined,
				lockOffsetMs: lockOffsetMinutes != null ? BigInt(lockOffsetMinutes) * MINUTES_TO_MS : undefined,
				cleanupOffsetMs: cleanupOffsetHours != null ? BigInt(cleanupOffsetHours) * HOURS_TO_MS : undefined,
				announcementChannelId,
				announcementMessage,
				roomPingMessage: EventsCommand.ADD_OPTIONS.roomPingMessage.get(inter),
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
		event: new EventOption({ required: true, description: "Event to update" }),
		roomCount: new RoomCountOption({ description: "Number of rooms (can only grow)" }),
		roomScheduling: new RoomSchedulingOption({ description: "How rooms are timed" }),
		roomLengthMinutes: new RoomLengthMinutesOption({ description: "Length of each room in minutes" }),
		createOffsetHours: new CreateOffsetHoursOption({ description: "Hours before start to open queues" }),
		lockOffsetMinutes: new LockOffsetMinutesOption({ description: "Minutes after start to lock rooms" }),
		cleanupOffsetHours: new CleanupOffsetHoursOption({ description: "Hours after start to clear and lock" }),
		announcementChannel: new AnnouncementChannelOption({ description: "Channel for announcements" }),
		announcementMessage: new AnnouncementMessageOption({ description: "Announcement template" }),
		roomPingMessage: new RoomPingMessageOption({ description: "Room ping template" }),
	};

	static async events_set(inter: SlashInteraction) {
		await inter.deferReply({ ephemeral: true });
		const event = await EventsCommand.SET_OPTIONS.event.get(inter);
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
		event: new EventOption({ required: true, description: "Event to configure" }),
		autopullToggle: new AutopullToggleOption({ description: "Toggle automatic pulling" }),
		badgeToggle: new BadgeToggleOption({ description: "Toggle badges next to queue name" }),
		buttonsToggle: new ButtonsToggleOption({ description: "Toggle buttons beneath displays" }),
		color: new ColorOption({ description: "Color of the queue" }),
		displayUpdateType: new DisplayUpdateTypeOption({ description: "How to update displays" }),
		dmOnPullToggle: new DmOnPullToggleOption({ description: "Toggle DM on pull" }),
		header: new HeaderOption({ description: "Header of the queue display" }),
		inlineToggle: new InlineToggleOption({ description: "Toggle inline display" }),
		lockToggle: new LockToggleOption({ description: "Toggle queue locked status" }),
		memberDisplayType: new MemberDisplayTypeOption({ description: "How to display members" }),
		pullBatchSize: new PullBatchSizeOption({ description: "Pull batch size" }),
		pullMessage: new PullMessageOption({ description: "Pull message" }),
		pullMessageDisplayType: new PullMessageDisplayTypeOption({ description: "Pull message display type" }),
		pullMessageChannel: new PullMessageChannelOption({ description: "Pull message channel" }),
		rejoinCooldownPeriod: new RejoinCooldownPeriodOption({ description: "Rejoin cooldown in seconds" }),
		rejoinGracePeriod: new RejoinGracePeriodOption({ description: "Rejoin grace period in seconds" }),
		requireMessageToJoin: new RequireMessageToJoinOption({ description: "Require message to join" }),
		roleInQueue: new RoleInQueueOption({ description: "Role to assign in queue" }),
		roleOnPull: new RoleOnPullOption({ description: "Role to assign on pull" }),
		size: new SizeOption({ description: "Queue size limit" }),
		timestampType: new TimestampTypeOption({ description: "Timestamp format" }),
		voiceOnlyToggle: new VoiceOnlyToggleOption({ description: "Voice only toggle" }),
		voiceDestinationChannel: new VoiceDestinationChannelOption({ description: "Voice destination channel" }),
	};

	static async events_set_room_defaults(inter: SlashInteraction) {
		await EventsCommand.setDefaults(inter, EventQueueRole.Room, EventsCommand.SET_ROOM_DEFAULTS_OPTIONS);
	}

	// ====================================================================
	//                     /events set-sub-defaults
	// ====================================================================

	static readonly SET_SUB_DEFAULTS_OPTIONS = {
		event: new EventOption({ required: true, description: "Event to configure" }),
		autopullToggle: new AutopullToggleOption({ description: "Toggle automatic pulling" }),
		badgeToggle: new BadgeToggleOption({ description: "Toggle badges next to queue name" }),
		buttonsToggle: new ButtonsToggleOption({ description: "Toggle buttons beneath displays" }),
		color: new ColorOption({ description: "Color of the queue" }),
		displayUpdateType: new DisplayUpdateTypeOption({ description: "How to update displays" }),
		dmOnPullToggle: new DmOnPullToggleOption({ description: "Toggle DM on pull" }),
		header: new HeaderOption({ description: "Header of the queue display" }),
		inlineToggle: new InlineToggleOption({ description: "Toggle inline display" }),
		lockToggle: new LockToggleOption({ description: "Toggle queue locked status" }),
		memberDisplayType: new MemberDisplayTypeOption({ description: "How to display members" }),
		pullBatchSize: new PullBatchSizeOption({ description: "Pull batch size" }),
		pullMessage: new PullMessageOption({ description: "Pull message" }),
		pullMessageDisplayType: new PullMessageDisplayTypeOption({ description: "Pull message display type" }),
		pullMessageChannel: new PullMessageChannelOption({ description: "Pull message channel" }),
		rejoinCooldownPeriod: new RejoinCooldownPeriodOption({ description: "Rejoin cooldown in seconds" }),
		rejoinGracePeriod: new RejoinGracePeriodOption({ description: "Rejoin grace period in seconds" }),
		requireMessageToJoin: new RequireMessageToJoinOption({ description: "Require message to join" }),
		roleInQueue: new RoleInQueueOption({ description: "Role to assign in queue" }),
		roleOnPull: new RoleOnPullOption({ description: "Role to assign on pull" }),
		size: new SizeOption({ description: "Queue size limit" }),
		timestampType: new TimestampTypeOption({ description: "Timestamp format" }),
		voiceOnlyToggle: new VoiceOnlyToggleOption({ description: "Voice only toggle" }),
		voiceDestinationChannel: new VoiceDestinationChannelOption({ description: "Voice destination channel" }),
	};

	static async events_set_sub_defaults(inter: SlashInteraction) {
		await EventsCommand.setDefaults(inter, EventQueueRole.Sub, EventsCommand.SET_SUB_DEFAULTS_OPTIONS);
	}

	private static async setDefaults(inter: SlashInteraction, role: EventQueueRole, options: typeof EventsCommand.SET_ROOM_DEFAULTS_OPTIONS) {
		await inter.deferReply({ ephemeral: true });
		const event = await options.event.get(inter);

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
	//                           /events set-room
	// ====================================================================

	static readonly SET_ROOM_OPTIONS = {
		event: new EventOption({ required: true, description: "Event to configure" }),
		room: new RoomIndexOption({ required: true, description: "Room to configure (shows current ping channel)" }),
		pingChannel: new PingChannelOption({ description: "Override ping channel for this room" }),
	};

	static async events_set_room(inter: SlashInteraction) {
		await inter.deferReply({ ephemeral: true });
		const event = await EventsCommand.SET_ROOM_OPTIONS.event.get(inter);
		const roomIndex = EventsCommand.SET_ROOM_OPTIONS.room.get(inter);
		const pingChannel = EventsCommand.SET_ROOM_OPTIONS.pingChannel.get(inter);

		const eventQueues = Queries.selectManyEventQueues({ guildId: inter.guildId, eventId: event.id });
		const targetEq = eventQueues.find(
			eq => eq.queueRole === EventQueueRole.Room && Number(eq.queueIndex) === roomIndex,
		);

		if (!targetEq) {
			throw new RoomIndexNotFoundError(Number(event.roomCount));
		}

		if (pingChannel) {
			inter.store.updateEventQueue({ id: targetEq.id, pingChannelId: pingChannel.id });
		}

		const roomsAfter = Queries.selectManyEventQueues({ guildId: inter.guildId, eventId: event.id })
			.filter(eq => eq.queueRole === EventQueueRole.Room)
			.sort((a, b) => Number(a.queueIndex) - Number(b.queueIndex));

		const lines = roomsAfter.map(room => {
			const ping = room.pingChannelId
				? channelMention(room.pingChannelId)
				: `(default → ${channelMention(event.roomChannelId)})`;
			return `**Room ${room.queueIndex}** — ${ping}`;
		});

		const title = pingChannel
			? `Updated Room ${roomIndex} of ${event.name}`
			: `Rooms for ${event.name}`;
		const embed = new EmbedBuilder()
			.setTitle(title)
			.setColor(Color.Indigo)
			.setDescription(lines.join("\n"));

		await inter.respond({ embeds: [embed] }, true);
	}

	// ====================================================================
	//                           /events reset
	// ====================================================================

	static readonly RESET_OPTIONS = {
		event: new EventOption({ required: true, description: "Event to reset" }),
	};

	static async events_reset(inter: SlashInteraction) {
		await inter.deferReply({ ephemeral: true });
		const event = await EventsCommand.RESET_OPTIONS.event.get(inter);

		const ANNOUNCEMENT_PAIR_VALUE = "__announcement_pair__";
		const selectMenuOptions = [
			{ name: CreateOffsetHoursOption.ID, value: EVENT_TABLE.createOffsetMs.name },
			{ name: LockOffsetMinutesOption.ID, value: EVENT_TABLE.lockOffsetMs.name },
			{ name: CleanupOffsetHoursOption.ID, value: EVENT_TABLE.cleanupOffsetMs.name },
			{ name: RoomSchedulingOption.ID, value: EVENT_TABLE.roomScheduling.name },
			{ name: RoomLengthMinutesOption.ID, value: EVENT_TABLE.roomLengthMs.name },
			{ name: `${AnnouncementChannelOption.ID} + ${AnnouncementMessageOption.ID}`, value: ANNOUNCEMENT_PAIR_VALUE },
			{ name: RoomPingMessageOption.ID, value: EVENT_TABLE.roomPingMessage.name },
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
	//                           /events reset-room
	// ====================================================================

	// TODO: convert to select menu if more per-room override fields are added
	static readonly RESET_ROOM_OPTIONS = {
		event: new EventOption({ required: true, description: "Event to reset" }),
		room: new RoomIndexOption({ required: true, description: "Room to reset" }),
	};

	static async events_reset_room(inter: SlashInteraction) {
		await inter.deferReply({ ephemeral: true });
		const event = await EventsCommand.RESET_ROOM_OPTIONS.event.get(inter);
		const roomIndex = EventsCommand.RESET_ROOM_OPTIONS.room.get(inter);

		const eventQueues = Queries.selectManyEventQueues({ guildId: inter.guildId, eventId: event.id });
		const targetEq = eventQueues.find(
			eq => eq.queueRole === EventQueueRole.Room && Number(eq.queueIndex) === roomIndex,
		);

		if (!targetEq) {
			throw new RoomIndexNotFoundError(Number(event.roomCount));
		}

		inter.store.updateEventQueue({ id: targetEq.id, pingChannelId: null });

		const roomsAfter = Queries.selectManyEventQueues({ guildId: inter.guildId, eventId: event.id })
			.filter(eq => eq.queueRole === EventQueueRole.Room)
			.sort((a, b) => Number(a.queueIndex) - Number(b.queueIndex));

		const lines = roomsAfter.map(room => {
			const ping = room.pingChannelId
				? channelMention(room.pingChannelId)
				: `(default → ${channelMention(event.roomChannelId)})`;
			return `**Room ${room.queueIndex}** — ${ping}`;
		});

		const embed = new EmbedBuilder()
			.setTitle(`Reset Room ${roomIndex} of ${event.name}`)
			.setColor(Color.Indigo)
			.setDescription(lines.join("\n"));

		await inter.respond({ embeds: [embed] }, true);
	}

	// ====================================================================
	//                     /events reset-room-defaults
	// ====================================================================

	static readonly RESET_ROOM_DEFAULTS_OPTIONS = {
		event: new EventOption({ required: true, description: "Event to reset" }),
	};

	static async events_reset_room_defaults(inter: SlashInteraction) {
		await EventsCommand.resetDefaults(inter, EventQueueRole.Room, EventsCommand.RESET_ROOM_DEFAULTS_OPTIONS);
	}

	// ====================================================================
	//                     /events reset-sub-defaults
	// ====================================================================

	static readonly RESET_SUB_DEFAULTS_OPTIONS = {
		event: new EventOption({ required: true, description: "Event to reset" }),
	};

	static async events_reset_sub_defaults(inter: SlashInteraction) {
		await EventsCommand.resetDefaults(inter, EventQueueRole.Sub, EventsCommand.RESET_SUB_DEFAULTS_OPTIONS);
	}

	private static async resetDefaults(
		inter: SlashInteraction,
		role: EventQueueRole,
		options: typeof EventsCommand.RESET_ROOM_DEFAULTS_OPTIONS,
	) {
		await inter.deferReply({ ephemeral: true });
		const event = await options.event.get(inter);

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
		event: new EventOption({ required: true, description: "Event to schedule" }),
	};

	static async events_schedule(inter: SlashInteraction) {
		const event = await EventsCommand.SCHEDULE_OPTIONS.event.get(inter);
		await inter.showModal(EventScheduleModal.getModal({ eventId: event.id }));
	}

	// ====================================================================
	//                           /events cancel
	// ====================================================================

	static readonly CANCEL_OPTIONS = {
		event: new EventOption({ required: true, description: "Event to cancel an occurrence of" }),
	};

	static async events_cancel(inter: SlashInteraction) {
		await inter.deferReply({ ephemeral: true });
		const event = await EventsCommand.CANCEL_OPTIONS.event.get(inter);
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
		event: new EventOption({ required: true, description: "Event to delete" }),
	};

	static async events_delete(inter: SlashInteraction) {
		await inter.deferReply({ ephemeral: true });
		const event = await EventsCommand.DELETE_OPTIONS.event.get(inter);

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
				`1. ${commandMention("events", "add")} — create an event with N rooms\n` +
				`2. ${commandMention("events", "set-room-defaults")} — configure room queue defaults (size, role, etc.)\n` +
				`3. ${commandMention("events", "schedule")} — schedule an occurrence (opens a date/time modal)\n\n` +
				"**Lifecycle per occurrence:**\n" +
				"- **T − create_offset** (default 24h before): queues unlock, displays refresh, announcement posts\n" +
				"- **T + lock_offset** (default 0): room queues lock (sub queues stay open)\n" +
				"- **Per-room ping**: at each room's start time a ping posts in the room's channel\n" +
				"- **T + cleanup_offset** (default 24h after): all members cleared, all queues locked\n\n" +
				"**Missed actions** (bot was down): run automatically on next startup.\n\n" +
				"**Announcement placeholders:** `{event_name}`, `{start_time}`, `{start_time_relative}`, `{room_channel}`, `{sub_channel}`\n" +
				"**Ping placeholders:** `{room_role}`, `{room_name}`, `{room_index}`, `{room_channel}`, `{ping_channel}`, `{start_time}`, `{start_time_relative}`",
			)];

		await inter.respond({ embeds });
	}
}
