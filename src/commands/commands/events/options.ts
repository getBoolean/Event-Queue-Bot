import { UserOption } from "../../../options/base-option.ts";
import { AnnouncementChannelOption } from "../../../options/options/announcement-channel.option.ts";
import { AnnouncementMessageOption } from "../../../options/options/announcement-message.option.ts";
import { AutoPullSubsAtRoomStartToggleOption } from "../../../options/options/auto-pull-subs-at-room-start-toggle.option.ts";
import { AutopullToggleOption } from "../../../options/options/autopull-toggle.option.ts";
import { BadgeToggleOption } from "../../../options/options/badge-toggle.option.ts";
import { ChannelSuffixOption } from "../../../options/options/channel-suffix.option.ts";
import { CleanupOffsetHoursOption } from "../../../options/options/cleanup-offset-hours.option.ts";
import { ColorOption } from "../../../options/options/color.option.ts";
import { CreateDiscordEventToggleOption } from "../../../options/options/create-discord-event-toggle.option.ts";
import { CreateOffsetHoursOption } from "../../../options/options/create-offset-hours.option.ts";
import { DayOption } from "../../../options/options/day.option.ts";
import { DiscordEventDescriptionOption } from "../../../options/options/discord-event-description.option.ts";
import { ButtonsToggleOption } from "../../../options/options/display-buttons.option.ts";
import { DisplayUpdateTypeOption } from "../../../options/options/display-update-type.option.ts";
import { DmOnPullToggleOption } from "../../../options/options/dm-on-pull-toggle.option.ts";
import { EventOption } from "../../../options/options/event.option.ts";
import { EventsOption } from "../../../options/options/events.option.ts";
import { HeaderOption } from "../../../options/options/header.option.ts";
import { InlineToggleOption } from "../../../options/options/inline-toggle.option.ts";
import { LockOffsetMinutesOption } from "../../../options/options/lock-offset-minutes.option.ts";
import { LockToggleOption } from "../../../options/options/lock-toggle.option.ts";
import { MaxRoomsPerUserOption } from "../../../options/options/max-rooms-per-user.option.ts";
import { MaxSubsPerUserOption } from "../../../options/options/max-subs-per-user.option.ts";
import { MemberDisplayTypeOption } from "../../../options/options/member-display-type.option.ts";
import { MonthOption } from "../../../options/options/month.option.ts";
import { NameOption } from "../../../options/options/name.option.ts";
import { ParentSubMutuallyExclusiveOption } from "../../../options/options/parent-sub-mutually-exclusive.option.ts";
import { PullBatchSizeOption } from "../../../options/options/pull-batch-size.option.ts";
import { PullMessageOption } from "../../../options/options/pull-message.option.ts";
import { PullMessageChannelOption } from "../../../options/options/pull-message-channel.option.ts";
import { PullMessageDisplayTypeOption } from "../../../options/options/pull-message-display-type.option.ts";
import { RejoinCooldownPeriodOption } from "../../../options/options/rejoin-cooldown-period.option.ts";
import { RejoinGracePeriodOption } from "../../../options/options/rejoin-grace-period.option.ts";
import { RequireMessageToJoinOption } from "../../../options/options/require-message-to-join.option.ts";
import { RoleInQueueOption } from "../../../options/options/role-in-queue.option.ts";
import { RoleInRoomQueueOption } from "../../../options/options/role-in-room-queue.option.ts";
import { RoleInSubQueueOption } from "../../../options/options/role-in-sub-queue.option.ts";
import { RoleOnPullOption } from "../../../options/options/role-on-pull.option.ts";
import { RoleOnRoomPullOption } from "../../../options/options/role-on-room-pull.option.ts";
import { RoleOnSubPullOption } from "../../../options/options/role-on-sub-pull.option.ts";
import { RoomCategoryOption } from "../../../options/options/room-category.option.ts";
import { RoomCountOption } from "../../../options/options/room-count.option.ts";
import { RoomLengthMinutesOption } from "../../../options/options/room-length-minutes.option.ts";
import { RoomPingMessageOption } from "../../../options/options/room-ping-message.option.ts";
import { RoomQueuesChannelOption } from "../../../options/options/room-queues-channel.option.ts";
import { RoomSchedulingOption } from "../../../options/options/room-scheduling.option.ts";
import { ShuffleSubsBeforeAutoPullToggleOption } from "../../../options/options/shuffle-subs-before-auto-pull-toggle.option.ts";
import { SizeOption } from "../../../options/options/size.option.ts";
import { SlowmodeOption } from "../../../options/options/slowmode.option.ts";
import { SlowmodeTimeOption } from "../../../options/options/slowmode-time.option.ts";
import { StartTimeOption } from "../../../options/options/start-time.option.ts";
import { SubAutoPullModeOption } from "../../../options/options/sub-auto-pull-mode.option.ts";
import { SubQueuesChannelOption } from "../../../options/options/sub-queues-channel.option.ts";
import { TimestampTypeOption } from "../../../options/options/timestamp-type.option.ts";
import { TimezoneOption } from "../../../options/options/timezone.option.ts";
import { VoiceDestinationChannelOption } from "../../../options/options/voice-destination-channel.option.ts";
import { VoiceOnlyToggleOption } from "../../../options/options/voice-only-toggle.option.ts";
import { WinnerRoleOption } from "../../../options/options/winner-role.option.ts";
import { YearOption } from "../../../options/options/year.option.ts";

export namespace EventsOptions {
	export const GET_OPTIONS = {
		events: new EventsOption({ description: "Specific event(s)" }),
	};

	export const ADD_OPTIONS = {
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
		announcementMessage: new AnnouncementMessageOption({ description: "Announcement template — placeholders: /events help" }),
		roomPingMessage: new RoomPingMessageOption({ description: "Per-room ping template — placeholders: /events help" }),
		maxRoomsPerUser: new MaxRoomsPerUserOption({ description: "Max rooms per user (0=unlimited)" }),
		maxSubsPerUser: new MaxSubsPerUserOption({ description: "Max subs per user (0=unlimited)" }),
		parentSubMutuallyExclusive: new ParentSubMutuallyExclusiveOption({ description: "Room + matching sub mutually exclusive" }),
		roleInRoomQueue: new RoleInRoomQueueOption({ description: "Assign room role while in room queue" }),
		roleOnRoomPull: new RoleOnRoomPullOption({ description: "Assign room role on room queue pull" }),
		roleInSubQueue: new RoleInSubQueueOption({ description: "Assign room role while in sub queue" }),
		roleOnSubPull: new RoleOnSubPullOption({ description: "Assign room role on sub queue pull" }),
		autoPullSubsAtRoomStartToggle: new AutoPullSubsAtRoomStartToggleOption({ description: "Auto-pull subs at room start" }),
		shuffleSubsBeforeAutoPullToggle: new ShuffleSubsBeforeAutoPullToggleOption({ description: "Shuffle subs before auto-pull" }),
		subAutoPullMode: new SubAutoPullModeOption({ description: "Auto-pull mode" }),
		createDiscordEvent: new CreateDiscordEventToggleOption({ description: "Create Discord scheduled event per occurrence" }),
		discordEventDescription: new DiscordEventDescriptionOption({ description: "Discord event description — placeholders: /events help" }),
	};

	export const SET_OPTIONS = {
		event: new EventOption({ required: true, description: "Target event" }),
		roomCount: new RoomCountOption({ description: "Number of rooms (grow only)" }),
		roomScheduling: new RoomSchedulingOption({ description: "Room timing (parallel/sequential)" }),
		roomLengthMinutes: new RoomLengthMinutesOption({ description: "Room length in minutes" }),
		createOffsetHours: new CreateOffsetHoursOption({ description: "Hours before start to open" }),
		lockOffsetMinutes: new LockOffsetMinutesOption({ description: "Minutes after start to lock" }),
		cleanupOffsetHours: new CleanupOffsetHoursOption({ description: "Hours after rooms finish to cleanup" }),
		announcementChannel: new AnnouncementChannelOption({ description: "Announcement channel" }),
		announcementMessage: new AnnouncementMessageOption({ description: "Announcement template — placeholders: /events help" }),
		roomPingMessage: new RoomPingMessageOption({ description: "Per-room ping template — placeholders: /events help" }),
		maxRoomsPerUser: new MaxRoomsPerUserOption({ description: "Max rooms per user (0=unlimited)" }),
		maxSubsPerUser: new MaxSubsPerUserOption({ description: "Max subs per user (0=unlimited)" }),
		parentSubMutuallyExclusive: new ParentSubMutuallyExclusiveOption({ description: "Room + matching sub mutually exclusive" }),
		roomCategory: new RoomCategoryOption({ description: "Category for per-room channels" }),
		roleInRoomQueue: new RoleInRoomQueueOption({ description: "Assign room role while in room queue" }),
		roleOnRoomPull: new RoleOnRoomPullOption({ description: "Assign room role on room queue pull" }),
		roleInSubQueue: new RoleInSubQueueOption({ description: "Assign room role while in sub queue" }),
		roleOnSubPull: new RoleOnSubPullOption({ description: "Assign room role on sub queue pull" }),
		autoPullSubsAtRoomStartToggle: new AutoPullSubsAtRoomStartToggleOption({ description: "Auto-pull subs at room start" }),
		shuffleSubsBeforeAutoPullToggle: new ShuffleSubsBeforeAutoPullToggleOption({ description: "Shuffle subs before auto-pull" }),
		subAutoPullMode: new SubAutoPullModeOption({ description: "Auto-pull mode" }),
		createDiscordEvent: new CreateDiscordEventToggleOption({ description: "Create Discord scheduled event per occurrence" }),
		discordEventDescription: new DiscordEventDescriptionOption({ description: "Discord event description — placeholders: /events help" }),
		winnerRole: new WinnerRoleOption({ description: "Role granted to declared winners" }),
	};

	export const SET_QUEUE_DEFAULTS_OPTIONS = {
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

	export const SET_ROOM_DEFAULTS_OPTIONS = SET_QUEUE_DEFAULTS_OPTIONS;

	export const SET_SUB_DEFAULTS_OPTIONS = SET_QUEUE_DEFAULTS_OPTIONS;

	export const ADD_ROOM_CHANNEL_OPTIONS = {
		event: new EventOption({ required: true, description: "Target event" }),
		suffix: new ChannelSuffixOption({ required: true, description: "Suffix (e.g. \"code\" → room-code-{N})" }),
		slowmode: new SlowmodeOption({ description: "Slowmode value (0=none)" }),
		slowmodeTime: new SlowmodeTimeOption({ description: "Slowmode unit" }),
	};

	export const REMOVE_ROOM_CHANNEL_OPTIONS = {
		event: new EventOption({ required: true, description: "Target event" }),
		suffix: new ChannelSuffixOption({ required: true, description: "Suffix to remove (autocompletes)" }),
	};

	export const SYNC_ROOM_CHANNELS_OPTIONS = {
		event: new EventOption({ description: "Event to sync (omit = all)" }),
	};

	export const SYNC_QUEUES_OPTIONS = {
		event: new EventOption({ description: "Event to sync (omit = all)" }),
	};

	export const RESET_OPTIONS = {
		event: new EventOption({ required: true, description: "Target event" }),
	};

	export const RESET_ROOM_DEFAULTS_OPTIONS = {
		event: new EventOption({ required: true, description: "Target event" }),
	};

	export const RESET_SUB_DEFAULTS_OPTIONS = {
		event: new EventOption({ required: true, description: "Target event" }),
	};

	export const SCHEDULE_OPTIONS = {
		event: new EventOption({ required: true, description: "Target event" }),
		year: new YearOption({ required: true, description: "Start year" }),
		month: new MonthOption({ required: true, description: "Start month" }),
		day: new DayOption({ required: true, description: "Start day" }),
		startTime: new StartTimeOption({ required: true, description: "Start time (12-hour, e.g. 9 AM, 9:30 PM)" }),
		timezone: new TimezoneOption({ required: false, description: "IANA timezone", defaultValue: process.env.DEFAULT_SCHEDULE_TIMEZONE }),
	};

	export const CANCEL_OPTIONS = {
		event: new EventOption({ required: true, description: "Target event" }),
	};

	export const DELETE_OPTIONS = {
		event: new EventOption({ required: true, description: "Target event" }),
	};

	export const DECLARE_WINNERS_OPTIONS = {
		event: new EventOption({ required: true, description: "Target event" }),
		winner1: new UserOption({ required: true, id: "winner_1", description: "A winner" }),
		winner2: new UserOption({ id: "winner_2", description: "A winner" }),
		winner3: new UserOption({ id: "winner_3", description: "A winner" }),
		winner4: new UserOption({ id: "winner_4", description: "A winner" }),
		winner5: new UserOption({ id: "winner_5", description: "A winner" }),
	};

	export const WINNERS_OPTIONS = {
		event: new EventOption({ required: true, description: "Target event" }),
	};

	export const CLEAR_WINNERS_OPTIONS = {
		event: new EventOption({ required: true, description: "Target event" }),
	};
}
