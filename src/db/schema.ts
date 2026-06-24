import type { ColorResolvable, Snowflake } from "discord.js";
import { index, integer, primaryKey, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";
import { get } from "lodash-es";

import {
	Color,
	DisplayUpdateType,
	EventQueueRole,
	MemberDisplayType,
	MemberRemovalReason,
	PullMessageDisplayType,
	RoomScheduling,
	ScheduleCommand,
	Scope,
	SubAutoPullMode,
	TimestampType,
} from "../types/db.types.ts";

export const GUILD_TABLE = sqliteTable("guild", ({
	guildId: text("guild_id").$type<Snowflake>().primaryKey(),

	logChannelId: text("log_channel_id").$type<Snowflake>(),
	logScope: text("log_scope").$type<Scope>(),

	joinTime: integer("joinTime").$type<bigint>().notNull().$defaultFn(() => BigInt(Date.now())),
	lastUpdateTime: integer("last_updated_time").$type<bigint>().notNull().$defaultFn(() => BigInt(Date.now())),
	messagesReceived: integer("messages_received").$type<bigint>().notNull().default(0 as any),
	commandsReceived: integer("commands_received").$type<bigint>().notNull().default(0 as any),
	buttonsReceived: integer("buttons_received").$type<bigint>().notNull().default(0 as any),
	queuesAdded: integer("queues_added").$type<bigint>().notNull().default(0 as any),
	voicesAdded: integer("voices_added").$type<bigint>().notNull().default(0 as any),
	displaysAdded: integer("displays_added").$type<bigint>().notNull().default(0 as any),
	membersAdded: integer("members_added").$type<bigint>().notNull().default(0 as any),
	schedulesAdded: integer("schedules_added").$type<bigint>().notNull().default(0 as any),
	whitelistedAdded: integer("whitelisted_added").$type<bigint>().notNull().default(0 as any),
	blacklistedAdded: integer("blacklisted_added").$type<bigint>().notNull().default(0 as any),
	prioritizedAdded: integer("prioritized_added").$type<bigint>().notNull().default(0 as any),
	adminsAdded: integer("admins_added").$type<bigint>().notNull().default(0 as any),
	archivedMembersAdded: integer("archived_members_added").$type<bigint>().notNull().default(0 as any),
	eventsAdded: integer("events_added").$type<bigint>().notNull().default(0 as any),
}));

export type NewGuild = typeof GUILD_TABLE.$inferInsert;
export type DbGuild = typeof GUILD_TABLE.$inferSelect;


/** Keys shared between QUEUE_TABLE config columns and nullable EVENT_DEFAULT_TABLE overrides. */
export const QUEUE_CONFIG_COLUMN_KEYS = [
	"autopullToggle",
	"badgeToggle",
	"color",
	"displayUpdateType",
	"dmOnPullToggle",
	"buttonsToggle",
	"header",
	"inlineToggle",
	"lockToggle",
	"memberDisplayType",
	"pullBatchSize",
	"pullMessage",
	"pullMessageDisplayType",
	"pullMessageChannelId",
	"rejoinCooldownPeriod",
	"rejoinGracePeriod",
	"requireMessageToJoin",
	"roleInQueueId",
	"roleOnPullId",
	"size",
	"timestampType",
	"voiceDestinationChannelId",
	"voiceOnlyToggle",
] as const;

export type QueueConfigColumnKey = typeof QUEUE_CONFIG_COLUMN_KEYS[number];

/** Factory for queue config columns mirrored on EVENT_DEFAULT_TABLE (nullable overrides). */
function queueConfigColumns(mode: "required" | "nullable") {
	const nullable = mode === "nullable";
	return {
		autopullToggle: nullable
			? integer("autopull_toggle", { mode: "boolean" })
			: integer("autopull_toggle", { mode: "boolean" }).notNull().default(false),
		badgeToggle: nullable
			? integer("badge_toggle", { mode: "boolean" })
			: integer("badge_toggle", { mode: "boolean" }).notNull().default(true),
		color: nullable
			? text("color").$type<ColorResolvable>()
			: text("color").$type<ColorResolvable>().notNull().default(get(Color, process.env.DEFAULT_COLOR) as ColorResolvable),
		displayUpdateType: nullable
			? text("display_update_type").$type<DisplayUpdateType>()
			: text("display_update_type").$type<DisplayUpdateType>().notNull().default(DisplayUpdateType.Edit),
		dmOnPullToggle: nullable
			? integer("dm_on_pull_toggle", { mode: "boolean" })
			: integer("dm_on_pull_toggle", { mode: "boolean" }).notNull().default(true),
		// SQL column: buttons_toggles
		buttonsToggle: nullable
			? text("buttons_toggles").$type<Scope>()
			: text("buttons_toggles").$type<Scope>().notNull().default(Scope.All),
		header: text("header"),
		inlineToggle: nullable
			? integer("inline_toggle", { mode: "boolean" })
			: integer("inline_toggle", { mode: "boolean" }).notNull().default(false),
		lockToggle: nullable
			? integer("lock_toggle", { mode: "boolean" })
			: integer("lock_toggle", { mode: "boolean" }).notNull().default(false),
		memberDisplayType: nullable
			? text("member_display_type").$type<MemberDisplayType>()
			: text("member_display_type").$type<MemberDisplayType>().notNull().default(MemberDisplayType.Mention),
		pullBatchSize: nullable
			? integer("pull_batch_size").$type<bigint>()
			: integer("pull_batch_size").$type<bigint>().notNull().default(1 as any),
		pullMessage: text("pull_message"),
		pullMessageDisplayType: nullable
			? text("pull_message_display_type").$type<PullMessageDisplayType>()
			: text("pull_message_display_type").$type<PullMessageDisplayType>().notNull().default(PullMessageDisplayType.Private),
		pullMessageChannelId: text("pull_message_channel_id").$type<Snowflake>(),
		rejoinCooldownPeriod: nullable
			? integer("rejoin_cooldown_period").$type<bigint>()
			: integer("rejoin_cooldown_period").$type<bigint>().notNull().default(0 as any),
		rejoinGracePeriod: nullable
			? integer("rejoin_grace_period").$type<bigint>()
			: integer("rejoin_grace_period").$type<bigint>().notNull().default(0 as any),
		requireMessageToJoin: nullable
			? integer("require_message_to_join", { mode: "boolean" })
			: integer("require_message_to_join", { mode: "boolean" }).default(false),
		roleInQueueId: text("role_in_queue_id").$type<Snowflake>(),
		roleOnPullId: text("role_on_pull_id").$type<Snowflake>(),
		size: integer("size").$type<bigint>(),
		timestampType: nullable
			? text("time_display_type").$type<TimestampType>()
			: text("time_display_type").$type<TimestampType>().default(TimestampType.Off),
		voiceDestinationChannelId: text("voice_destination_channel_id").$type<Snowflake>(),
		voiceOnlyToggle: nullable
			? integer("voice_only_toggle", { mode: "boolean" })
			: integer("voice_only_toggle", { mode: "boolean" }).notNull().default(false),
	};
}

export const QUEUE_TABLE = sqliteTable("queue", ({
	id: integer("id").$type<bigint>().primaryKey({ autoIncrement: true }),

	name: text("name").notNull(),
	guildId: text("guild_id").$type<Snowflake>().notNull().references(() => GUILD_TABLE.guildId, { onDelete: "cascade" }),

	...queueConfigColumns("required"),
}),
(table) => ({
	unq: unique().on(table.name, table.guildId),
	guildIdIndex: index("queue_guild_id_index").on(table.guildId),
}));

export type NewQueue = typeof QUEUE_TABLE.$inferInsert;
export type DbQueue = typeof QUEUE_TABLE.$inferSelect;
export type QueueConfig = Pick<DbQueue, QueueConfigColumnKey>;


export const VOICE_TABLE = sqliteTable("voice", ({
	id: integer("id").$type<bigint>().primaryKey({ autoIncrement: true }),

	guildId: text("guild_id").$type<Snowflake>().notNull().references(() => GUILD_TABLE.guildId, { onDelete: "cascade" }),
	queueId: integer("queue_id").$type<bigint>().notNull().references(() => QUEUE_TABLE.id, { onDelete: "cascade" }),
	sourceChannelId: text("source_channel_id").$type<Snowflake>().notNull(),
	joinSyncToggle: integer("join_sync_toggle", { mode: "boolean" }).notNull().default(true),
	leaveSyncToggle: integer("leave_sync_toggle", { mode: "boolean" }).notNull().default(true),
}),
(table) => ({
	unq: unique().on(table.queueId, table.sourceChannelId),
	guildIdIndex: index("voice_guild_id_index").on(table.guildId),
}));

export type NewVoice = typeof VOICE_TABLE.$inferInsert;
export type DbVoice = typeof VOICE_TABLE.$inferSelect;


export const DISPLAY_TABLE = sqliteTable("display", ({
	id: integer("id").$type<bigint>().primaryKey({ autoIncrement: true }),

	guildId: text("guild_id").notNull().references(() => GUILD_TABLE.guildId, { onDelete: "cascade" }),
	queueId: integer("queue_id").$type<bigint>().notNull().references(() => QUEUE_TABLE.id, { onDelete: "cascade" }),
	displayChannelId: text("display_channel_id").notNull(),
	lastMessageId: text("last_message_id").$type<Snowflake>(),
}),
(table) => ({
	unq: unique().on(table.queueId, table.displayChannelId),
	guildIdIndex: index("display_guild_id_index").on(table.guildId),
}));

export type NewDisplay = typeof DISPLAY_TABLE.$inferInsert;
export type DbDisplay = typeof DISPLAY_TABLE.$inferSelect;


export const MEMBER_TABLE = sqliteTable("member", ({
	id: integer("id").$type<bigint>().primaryKey({ autoIncrement: true }),

	guildId: text("guild_id").notNull().references(() => GUILD_TABLE.guildId, { onDelete: "cascade" }),
	queueId: integer("queue_id").$type<bigint>().notNull().references(() => QUEUE_TABLE.id, { onDelete: "cascade" }),
	userId: text("user_id").$type<Snowflake>().notNull(),
	message: text("message"),
	positionTime: integer("position_time").$type<bigint>().notNull().$defaultFn(() => BigInt(Date.now())),
	joinTime: integer("join_time").$type<bigint>().notNull().$defaultFn(() => BigInt(Date.now())),
	priorityOrder: integer("priority_order").$type<bigint>(),
}),
(table) => ({
	unq: unique().on(table.queueId, table.userId),
	guildIdIndex: index("member_guild_id_index").on(table.guildId),
	priorityOrderIndex: index("member_priority_order_index").on(table.priorityOrder),
	positionTimeIndex: index("member_position_time_index").on(table.positionTime),
}));

export type NewMember = typeof MEMBER_TABLE.$inferInsert;
export type DbMember = typeof MEMBER_TABLE.$inferSelect;


export const SCHEDULE_TABLE = sqliteTable("schedule", ({
	id: integer("id").$type<bigint>().primaryKey({ autoIncrement: true }),

	guildId: text("guild_id").notNull().references(() => GUILD_TABLE.guildId, { onDelete: "cascade" }),
	queueId: integer("queue_id").$type<bigint>().notNull().references(() => QUEUE_TABLE.id, { onDelete: "cascade" }),
	command: text("command").notNull().$type<ScheduleCommand>(),
	cron: text("cron").notNull(),
	timezone: text("timezone").default(process.env.DEFAULT_SCHEDULE_TIMEZONE),
	messageChannelId: text("message_channel_id").$type<Snowflake>(),
	reason: text("reason"),
}),
(table) => ({
	unq: unique().on(table.queueId, table.command, table.cron, table.timezone),
	guildIdIndex: index("schedule_guild_id_index").on(table.guildId),
}));

export type NewSchedule = typeof SCHEDULE_TABLE.$inferInsert;
export type DbSchedule = typeof SCHEDULE_TABLE.$inferSelect;


export const EVENT_TABLE = sqliteTable("event", ({
	id: integer("id").$type<bigint>().primaryKey({ autoIncrement: true }),

	guildId: text("guild_id").$type<Snowflake>().notNull().references(() => GUILD_TABLE.guildId, { onDelete: "cascade" }),
	name: text("name").notNull(),
	roomCount: integer("room_count").$type<bigint>().notNull(),
	roomQueuesChannelId: text("room_queues_channel_id").$type<Snowflake>().notNull(),
	subQueuesChannelId: text("sub_queues_channel_id").$type<Snowflake>().notNull(),
	roomLengthMs: integer("room_length_ms").$type<bigint>(),
	roomScheduling: text("room_scheduling").$type<RoomScheduling>().notNull().default(RoomScheduling.Parallel),
	createOffsetMs: integer("create_offset_ms").$type<bigint>().notNull().default(86_400_000 as any),
	lockOffsetMs: integer("lock_offset_ms").$type<bigint>().notNull().default(0 as any),
	cleanupOffsetMs: integer("cleanup_offset_ms").$type<bigint>().notNull().default(3_600_000 as any),
	announcementChannelId: text("announcement_channel_id").$type<Snowflake>(),
	announcementMessage: text("announcement_message"),
	roomPingMessage: text("room_ping_message"),
	maxRoomsPerUser: integer("max_rooms_per_user").notNull().default(0),
	maxSubsPerUser: integer("max_subs_per_user").notNull().default(0),
	parentSubMutuallyExclusive: integer("parent_sub_mutually_exclusive", { mode: "boolean" }).notNull().default(true),
	roomCategoryId: text("room_category_id").$type<Snowflake>(),
	roleInRoomQueue: integer("role_in_room_queue", { mode: "boolean" }).notNull().default(false),
	roleOnRoomPull: integer("role_on_room_pull", { mode: "boolean" }).notNull().default(false),
	roleInSubQueue: integer("role_in_sub_queue", { mode: "boolean" }).notNull().default(false),
	roleOnSubPull: integer("role_on_sub_pull", { mode: "boolean" }).notNull().default(false),
	autoPullSubsAtRoomStartToggle: integer("auto_pull_subs_at_room_start_toggle", { mode: "boolean" }).notNull().default(false),
	shuffleSubsBeforeAutoPullToggle: integer("shuffle_subs_before_auto_pull_toggle", { mode: "boolean" }).notNull().default(false),
	subAutoPullMode: text("sub_auto_pull_mode").$type<SubAutoPullMode>().notNull().default(SubAutoPullMode.Drain),
	createDiscordEvent: integer("create_discord_event", { mode: "boolean" }).notNull().default(true),
	discordEventDescription: text("discord_event_description"),
	winnerRoleId: text("winner_role_id").$type<Snowflake>(),
}),
(table) => ({
	unq: unique().on(table.name, table.guildId),
	guildIdIndex: index("event_guild_id_index").on(table.guildId),
}));

export type NewEvent = typeof EVENT_TABLE.$inferInsert;
export type DbEvent = typeof EVENT_TABLE.$inferSelect;


export const EVENT_OCCURRENCE_TABLE = sqliteTable("event_occurrence", ({
	id: integer("id").$type<bigint>().primaryKey({ autoIncrement: true }),

	guildId: text("guild_id").$type<Snowflake>().notNull().references(() => GUILD_TABLE.guildId, { onDelete: "cascade" }),
	eventId: integer("event_id").$type<bigint>().notNull().references(() => EVENT_TABLE.id, { onDelete: "cascade" }),
	startTime: integer("start_time").$type<bigint>().notNull(),
	timezone: text("timezone"),
	openHandledAt: integer("open_handled_at").$type<bigint>(),
	lockHandledAt: integer("lock_handled_at").$type<bigint>(),
	discordEventId: text("discord_event_id").$type<Snowflake>(),
}),
(table) => ({
	unq: unique().on(table.eventId, table.startTime),
	guildIdIndex: index("event_occurrence_guild_id_index").on(table.guildId),
	eventIdIndex: index("event_occurrence_event_id_index").on(table.eventId),
}));

export type NewEventOccurrence = typeof EVENT_OCCURRENCE_TABLE.$inferInsert;
export type DbEventOccurrence = typeof EVENT_OCCURRENCE_TABLE.$inferSelect;


export const EVENT_OCCURRENCE_ROOM_PING_TABLE = sqliteTable("event_occurrence_room_ping", ({
	guildId: text("guild_id").$type<Snowflake>().notNull().references(() => GUILD_TABLE.guildId, { onDelete: "cascade" }),
	occurrenceId: integer("occurrence_id").$type<bigint>().notNull()
		.references(() => EVENT_OCCURRENCE_TABLE.id, { onDelete: "cascade" }),
	eventQueueId: integer("event_queue_id").$type<bigint>().notNull()
		.references(() => EVENT_QUEUE_TABLE.id, { onDelete: "cascade" }),
	handledAt: integer("handled_at").$type<bigint>().notNull(),
}),
(table) => ({
	pk: primaryKey({ columns: [table.occurrenceId, table.eventQueueId] }),
	guildIdOccurrenceIdIndex: index("event_occurrence_room_ping_guild_id_occurrence_id_index").on(table.guildId, table.occurrenceId),
}));

export type NewEventOccurrenceRoomPing = typeof EVENT_OCCURRENCE_ROOM_PING_TABLE.$inferInsert;
export type DbEventOccurrenceRoomPing = typeof EVENT_OCCURRENCE_ROOM_PING_TABLE.$inferSelect;


export const EVENT_OCCURRENCE_ROOM_PULL_TABLE = sqliteTable("event_occurrence_room_pull", ({
	guildId: text("guild_id").$type<Snowflake>().notNull().references(() => GUILD_TABLE.guildId, { onDelete: "cascade" }),
	occurrenceId: integer("occurrence_id").$type<bigint>().notNull()
		.references(() => EVENT_OCCURRENCE_TABLE.id, { onDelete: "cascade" }),
	eventQueueId: integer("event_queue_id").$type<bigint>().notNull()
		.references(() => EVENT_QUEUE_TABLE.id, { onDelete: "cascade" }),
	handledAt: integer("handled_at").$type<bigint>().notNull(),
}),
(table) => ({
	pk: primaryKey({ columns: [table.occurrenceId, table.eventQueueId] }),
	guildIdOccurrenceIdIndex: index("event_occurrence_room_pull_guild_id_occurrence_id_index").on(table.guildId, table.occurrenceId),
}));

export type NewEventOccurrenceRoomPull = typeof EVENT_OCCURRENCE_ROOM_PULL_TABLE.$inferInsert;
export type DbEventOccurrenceRoomPull = typeof EVENT_OCCURRENCE_ROOM_PULL_TABLE.$inferSelect;


export const EVENT_SYNC_LOCK_TABLE = sqliteTable("event_sync_lock", ({
	guildId: text("guild_id").$type<Snowflake>().notNull(),
	eventId: integer("event_id").$type<bigint>().notNull(),
	lockedAt: integer("locked_at").$type<bigint>().notNull(),
}),
(table) => ({
	pk: primaryKey({ columns: [table.guildId, table.eventId] }),
}));

export type NewEventSyncLock = typeof EVENT_SYNC_LOCK_TABLE.$inferInsert;
export type DbEventSyncLock = typeof EVENT_SYNC_LOCK_TABLE.$inferSelect;


export const EVENT_QUEUE_TABLE = sqliteTable("event_queue", ({
	id: integer("id").$type<bigint>().primaryKey({ autoIncrement: true }),

	guildId: text("guild_id").$type<Snowflake>().notNull().references(() => GUILD_TABLE.guildId, { onDelete: "cascade" }),
	eventId: integer("event_id").$type<bigint>().notNull().references(() => EVENT_TABLE.id, { onDelete: "cascade" }),
	queueId: integer("queue_id").$type<bigint>().notNull().references(() => QUEUE_TABLE.id, { onDelete: "cascade" }),
	queueRole: text("queue_role").$type<EventQueueRole>().notNull(),
	queueIndex: integer("queue_index").$type<bigint>().notNull(),
	pingChannelId: text("ping_channel_id").$type<Snowflake>(),
	autoCreatedRoleId: text("auto_created_role_id").$type<Snowflake>(),
}),
(table) => ({
	unqRoleIndex: unique().on(table.eventId, table.queueRole, table.queueIndex),
	unqQueue: unique().on(table.queueId),
	guildIdIndex: index("event_queue_guild_id_index").on(table.guildId),
	eventIdIndex: index("event_queue_event_id_index").on(table.eventId),
}));

export type NewEventQueue = typeof EVENT_QUEUE_TABLE.$inferInsert;
export type DbEventQueue = typeof EVENT_QUEUE_TABLE.$inferSelect;


export const EVENT_WINNER_TABLE = sqliteTable("event_winner", ({
	id: integer("id").$type<bigint>().primaryKey({ autoIncrement: true }),

	guildId: text("guild_id").$type<Snowflake>().notNull().references(() => GUILD_TABLE.guildId, { onDelete: "cascade" }),
	eventId: integer("event_id").$type<bigint>().notNull().references(() => EVENT_TABLE.id, { onDelete: "cascade" }),
	userId: text("user_id").$type<Snowflake>().notNull(),
	roleId: text("role_id").$type<Snowflake>().notNull(),
	declaredAt: integer("declared_at").$type<bigint>().notNull().$defaultFn(() => BigInt(Date.now())),
}),
(table) => ({
	unq: unique().on(table.eventId, table.userId),
	guildIdIndex: index("event_winner_guild_id_index").on(table.guildId),
	eventIdIndex: index("event_winner_event_id_index").on(table.eventId),
}));

export type NewEventWinner = typeof EVENT_WINNER_TABLE.$inferInsert;
export type DbEventWinner = typeof EVENT_WINNER_TABLE.$inferSelect;


export const EVENT_DEFAULT_TABLE = sqliteTable("event_default", ({
	id: integer("id").$type<bigint>().primaryKey({ autoIncrement: true }),

	guildId: text("guild_id").$type<Snowflake>().notNull().references(() => GUILD_TABLE.guildId, { onDelete: "cascade" }),
	eventId: integer("event_id").$type<bigint>().notNull().references(() => EVENT_TABLE.id, { onDelete: "cascade" }),
	queueRole: text("queue_role").$type<EventQueueRole>().notNull(),

	// Mirrored QUEUE_TABLE config columns via queueConfigColumns("nullable")
	...queueConfigColumns("nullable"),
}),
(table) => ({
	unq: unique().on(table.eventId, table.queueRole),
	guildIdIndex: index("event_default_guild_id_index").on(table.guildId),
}));

export type NewEventDefault = typeof EVENT_DEFAULT_TABLE.$inferInsert;
export type DbEventDefault = typeof EVENT_DEFAULT_TABLE.$inferSelect;
export type EventDefaultQueueConfig = Pick<DbEventDefault, QueueConfigColumnKey>;


export const EVENT_ROOM_CHANNEL_TEMPLATE_TABLE = sqliteTable("event_room_channel_template", ({
	id: integer("id").$type<bigint>().primaryKey({ autoIncrement: true }),

	guildId: text("guild_id").$type<Snowflake>().notNull().references(() => GUILD_TABLE.guildId, { onDelete: "cascade" }),
	eventId: integer("event_id").$type<bigint>().notNull().references(() => EVENT_TABLE.id, { onDelete: "cascade" }),
	suffix: text("suffix").notNull(),
	slowmodeSeconds: integer("slowmode_seconds").$type<bigint>(),
}),
(table) => ({
	unq: unique().on(table.eventId, table.suffix),
	guildIdIndex: index("event_room_channel_template_guild_id_index").on(table.guildId),
	eventIdIndex: index("event_room_channel_template_event_id_index").on(table.eventId),
}));

export type NewEventRoomChannelTemplate = typeof EVENT_ROOM_CHANNEL_TEMPLATE_TABLE.$inferInsert;
export type DbEventRoomChannelTemplate = typeof EVENT_ROOM_CHANNEL_TEMPLATE_TABLE.$inferSelect;


export const EVENT_ROOM_CHANNEL_TABLE = sqliteTable("event_room_channel", ({
	id: integer("id").$type<bigint>().primaryKey({ autoIncrement: true }),

	guildId: text("guild_id").$type<Snowflake>().notNull().references(() => GUILD_TABLE.guildId, { onDelete: "cascade" }),
	eventId: integer("event_id").$type<bigint>().notNull().references(() => EVENT_TABLE.id, { onDelete: "cascade" }),
	roomIndex: integer("room_index").$type<bigint>().notNull(),
	suffix: text("suffix"),
	channelId: text("channel_id").$type<Snowflake>().notNull(),
}),
(table) => ({
	unq: unique().on(table.eventId, table.roomIndex, table.suffix),
	guildIdIndex: index("event_room_channel_guild_id_index").on(table.guildId),
	eventIdIndex: index("event_room_channel_event_id_index").on(table.eventId),
}));

export type NewEventRoomChannel = typeof EVENT_ROOM_CHANNEL_TABLE.$inferInsert;
export type DbEventRoomChannel = typeof EVENT_ROOM_CHANNEL_TABLE.$inferSelect;


export const BLACKLISTED_TABLE = sqliteTable("blacklisted", ({
	id: integer("id").$type<bigint>().primaryKey({ autoIncrement: true }),

	guildId: text("guild_id").notNull().references(() => GUILD_TABLE.guildId, { onDelete: "cascade" }),
	queueId: integer("queue_id").$type<bigint>().notNull().references(() => QUEUE_TABLE.id, { onDelete: "cascade" }),
	subjectId: text("subject_id").$type<Snowflake>().notNull(),
	isRole: integer("is_role", { mode: "boolean" }).notNull(),
	reason: text("reason"),
}),
(table) => ({
	unq: unique().on(table.queueId, table.subjectId),
	guildIdIndex: index("blacklisted_guild_id_index").on(table.guildId),
}));

export type NewBlacklisted = typeof BLACKLISTED_TABLE.$inferInsert;
export type DbBlacklisted = typeof BLACKLISTED_TABLE.$inferSelect;


export const WHITELISTED_TABLE = sqliteTable("whitelisted", ({
	id: integer("id").$type<bigint>().primaryKey({ autoIncrement: true }),

	guildId: text("guild_id").notNull().references(() => GUILD_TABLE.guildId, { onDelete: "cascade" }),
	queueId: integer("queue_id").$type<bigint>().notNull().references(() => QUEUE_TABLE.id, { onDelete: "cascade" }),
	subjectId: text("subject_id").$type<Snowflake>().notNull(),
	isRole: integer("is_role", { mode: "boolean" }).notNull(),
	reason: text("reason"),
}),
(table) => ({
	unq: unique().on(table.queueId, table.subjectId),
	guildIdIndex: index("whitelisted_guild_id_index").on(table.guildId),
}));

export type NewWhitelisted = typeof WHITELISTED_TABLE.$inferInsert;
export type DbWhitelisted = typeof WHITELISTED_TABLE.$inferSelect;


export const PRIORITIZED_TABLE = sqliteTable("prioritized", ({
	id: integer("id").$type<bigint>().primaryKey({ autoIncrement: true }),

	guildId: text("guild_id").notNull().references(() => GUILD_TABLE.guildId, { onDelete: "cascade" }),
	queueId: integer("queue_id").$type<bigint>().notNull().references(() => QUEUE_TABLE.id, { onDelete: "cascade" }),
	subjectId: text("subject_id").$type<Snowflake>().notNull(),
	isRole: integer("is_role", { mode: "boolean" }).notNull(),
	priorityOrder: integer("priority_order").$type<bigint>().notNull().default(5 as any),
	reason: text("reason"),
}),
(table) => ({
	unq: unique().on(table.queueId, table.subjectId),
	guildIdIndex: index("prioritized_guild_id_index").on(table.guildId),
}));

export type NewPrioritized = typeof PRIORITIZED_TABLE.$inferInsert;
export type DbPrioritized = typeof PRIORITIZED_TABLE.$inferSelect;


export const EVENT_BLACKLISTED_TABLE = sqliteTable("event_blacklisted", ({
	id: integer("id").$type<bigint>().primaryKey({ autoIncrement: true }),

	guildId: text("guild_id").$type<Snowflake>().notNull().references(() => GUILD_TABLE.guildId, { onDelete: "cascade" }),
	eventId: integer("event_id").$type<bigint>().notNull().references(() => EVENT_TABLE.id, { onDelete: "cascade" }),
	subjectId: text("subject_id").$type<Snowflake>().notNull(),
	isRole: integer("is_role", { mode: "boolean" }).notNull(),
	reason: text("reason"),
}),
(table) => ({
	unq: unique().on(table.eventId, table.subjectId),
	guildIdIndex: index("event_blacklisted_guild_id_index").on(table.guildId),
	eventIdIndex: index("event_blacklisted_event_id_index").on(table.eventId),
}));

export type NewEventBlacklisted = typeof EVENT_BLACKLISTED_TABLE.$inferInsert;
export type DbEventBlacklisted = typeof EVENT_BLACKLISTED_TABLE.$inferSelect;


export const EVENT_WHITELISTED_TABLE = sqliteTable("event_whitelisted", ({
	id: integer("id").$type<bigint>().primaryKey({ autoIncrement: true }),

	guildId: text("guild_id").$type<Snowflake>().notNull().references(() => GUILD_TABLE.guildId, { onDelete: "cascade" }),
	eventId: integer("event_id").$type<bigint>().notNull().references(() => EVENT_TABLE.id, { onDelete: "cascade" }),
	subjectId: text("subject_id").$type<Snowflake>().notNull(),
	isRole: integer("is_role", { mode: "boolean" }).notNull(),
	reason: text("reason"),
}),
(table) => ({
	unq: unique().on(table.eventId, table.subjectId),
	guildIdIndex: index("event_whitelisted_guild_id_index").on(table.guildId),
	eventIdIndex: index("event_whitelisted_event_id_index").on(table.eventId),
}));

export type NewEventWhitelisted = typeof EVENT_WHITELISTED_TABLE.$inferInsert;
export type DbEventWhitelisted = typeof EVENT_WHITELISTED_TABLE.$inferSelect;


export const EVENT_PRIORITIZED_TABLE = sqliteTable("event_prioritized", ({
	id: integer("id").$type<bigint>().primaryKey({ autoIncrement: true }),

	guildId: text("guild_id").$type<Snowflake>().notNull().references(() => GUILD_TABLE.guildId, { onDelete: "cascade" }),
	eventId: integer("event_id").$type<bigint>().notNull().references(() => EVENT_TABLE.id, { onDelete: "cascade" }),
	subjectId: text("subject_id").$type<Snowflake>().notNull(),
	isRole: integer("is_role", { mode: "boolean" }).notNull(),
	priorityOrder: integer("priority_order").$type<bigint>().notNull().default(5 as any),
	reason: text("reason"),
}),
(table) => ({
	unq: unique().on(table.eventId, table.subjectId),
	guildIdIndex: index("event_prioritized_guild_id_index").on(table.guildId),
	eventIdIndex: index("event_prioritized_event_id_index").on(table.eventId),
}));

export type NewEventPrioritized = typeof EVENT_PRIORITIZED_TABLE.$inferInsert;
export type DbEventPrioritized = typeof EVENT_PRIORITIZED_TABLE.$inferSelect;


export const GUILD_BLACKLISTED_TABLE = sqliteTable("guild_blacklisted", ({
	id: integer("id").$type<bigint>().primaryKey({ autoIncrement: true }),

	guildId: text("guild_id").$type<Snowflake>().notNull().references(() => GUILD_TABLE.guildId, { onDelete: "cascade" }),
	subjectId: text("subject_id").$type<Snowflake>().notNull(),
	isRole: integer("is_role", { mode: "boolean" }).notNull(),
	reason: text("reason"),
}),
(table) => ({
	unq: unique().on(table.guildId, table.subjectId),
	guildIdIndex: index("guild_blacklisted_guild_id_index").on(table.guildId),
}));

export type NewGuildBlacklisted = typeof GUILD_BLACKLISTED_TABLE.$inferInsert;
export type DbGuildBlacklisted = typeof GUILD_BLACKLISTED_TABLE.$inferSelect;


export const GUILD_WHITELISTED_TABLE = sqliteTable("guild_whitelisted", ({
	id: integer("id").$type<bigint>().primaryKey({ autoIncrement: true }),

	guildId: text("guild_id").$type<Snowflake>().notNull().references(() => GUILD_TABLE.guildId, { onDelete: "cascade" }),
	subjectId: text("subject_id").$type<Snowflake>().notNull(),
	isRole: integer("is_role", { mode: "boolean" }).notNull(),
	reason: text("reason"),
}),
(table) => ({
	unq: unique().on(table.guildId, table.subjectId),
	guildIdIndex: index("guild_whitelisted_guild_id_index").on(table.guildId),
}));

export type NewGuildWhitelisted = typeof GUILD_WHITELISTED_TABLE.$inferInsert;
export type DbGuildWhitelisted = typeof GUILD_WHITELISTED_TABLE.$inferSelect;


export const GUILD_PRIORITIZED_TABLE = sqliteTable("guild_prioritized", ({
	id: integer("id").$type<bigint>().primaryKey({ autoIncrement: true }),

	guildId: text("guild_id").$type<Snowflake>().notNull().references(() => GUILD_TABLE.guildId, { onDelete: "cascade" }),
	subjectId: text("subject_id").$type<Snowflake>().notNull(),
	isRole: integer("is_role", { mode: "boolean" }).notNull(),
	priorityOrder: integer("priority_order").$type<bigint>().notNull().default(5 as any),
	reason: text("reason"),
}),
(table) => ({
	unq: unique().on(table.guildId, table.subjectId),
	guildIdIndex: index("guild_prioritized_guild_id_index").on(table.guildId),
}));

export type NewGuildPrioritized = typeof GUILD_PRIORITIZED_TABLE.$inferInsert;
export type DbGuildPrioritized = typeof GUILD_PRIORITIZED_TABLE.$inferSelect;


export const ADMIN_TABLE = sqliteTable("admin", ({
	id: integer("id").$type<bigint>().primaryKey({ autoIncrement: true }),

	guildId: text("guild_id").notNull().references(() => GUILD_TABLE.guildId, { onDelete: "cascade" }),
	subjectId: text("subject_id").$type<Snowflake>().notNull(),
	isRole: integer("is_role", { mode: "boolean" }).notNull(),
}),
(table) => ({
	unq: unique().on(table.guildId, table.subjectId),
	guildIdIndex: index("admin_guild_id_index").on(table.guildId),
}));

export type NewAdmin = typeof ADMIN_TABLE.$inferInsert;
export type DbAdmin = typeof ADMIN_TABLE.$inferSelect;


export const ARCHIVED_MEMBER_TABLE = sqliteTable("archived_member", ({
	id: integer("id").$type<bigint>().primaryKey({ autoIncrement: true }),

	guildId: text("guild_id").notNull(),
	queueId: integer("queue_id").$type<bigint>().notNull(),
	userId: text("user_id").$type<Snowflake>().notNull(),
	message: text("message"),
	positionTime: integer("position_time").$type<bigint>().notNull().$defaultFn(() => BigInt(Date.now())),
	joinTime: integer("join_time").$type<bigint>().notNull().$defaultFn(() => BigInt(Date.now())),
	archivedTime: integer("archived_time").$type<bigint>().notNull().$defaultFn(() => BigInt(Date.now())),
	reason: text("reason").$type<MemberRemovalReason>().notNull(),
}),
(table) => ({
	unq: unique().on(table.queueId, table.userId),
}));

export type NewArchivedMember = typeof ARCHIVED_MEMBER_TABLE.$inferInsert;
export type DbArchivedMember = typeof ARCHIVED_MEMBER_TABLE.$inferSelect;


export const PATCH_NOTE_TABLE = sqliteTable("patch_note", ({
	id: integer("id").$type<bigint>().primaryKey({ autoIncrement: true }),

	fileName: text("file_name").notNull(),
}));

export type NewPatchNote = typeof PATCH_NOTE_TABLE.$inferInsert;
export type DbPatchNote = typeof PATCH_NOTE_TABLE.$inferSelect;
