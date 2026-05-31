import { type DiscordAPIError, Guild, type GuildBasedChannel, type GuildMember, type Role, type Snowflake } from "discord.js";
import { and, eq, isNull, or } from "drizzle-orm";
import { compact, isNil, omitBy } from "lodash-es";

import { type EventQueueRole, type GuildStat, MemberRemovalReason, type Scope } from "../types/db.types.ts";
import type { AnyInteraction, ButtonInteraction, SlashInteraction } from "../types/interaction.types.ts";
import {
	AdminAlreadyExistsWarning,
	BlacklistedAlreadyExistsWarning,
	EventAlreadyExistsWarning,
	OccurrenceAlreadyExistsWarning,
	PrioritizedAlreadyExistsWarning,
	QueueAlreadyExistsWarning,
	ScheduleAlreadyExistsWarning,
	WhitelistedAlreadyExistsWarning,
} from "../utils/error.utils.ts";
import { toCollection } from "../utils/misc.utils.ts";
import { db } from "./db.ts";
import { incrementGuildStat as _incrementGuildStat } from "./db-scheduled-tasks.ts";
import { Queries } from "./queries.ts";
import {
	ADMIN_TABLE,
	ARCHIVED_MEMBER_TABLE,
	BLACKLISTED_TABLE,
	type DbAdmin,
	type DbArchivedMember,
	type DbBlacklisted,
	type DbDisplay,
	type DbEvent,
	type DbEventBlacklisted,
	type DbEventOccurrence,
	type DbEventOccurrenceRoomPing,
	type DbEventOccurrenceRoomPull,
	type DbEventPrioritized,
	type DbEventQueue,
	type DbEventRoomChannel,
	type DbEventRoomChannelTemplate,
	type DbEventWhitelisted,
	type DbEventWinner,
	type DbGuildBlacklisted,
	type DbGuildPrioritized,
	type DbGuildWhitelisted,
	type DbMember,
	type DbPrioritized,
	type DbQueue,
	type DbSchedule,
	type DbVoice,
	type DbWhitelisted,
	DISPLAY_TABLE,
	EVENT_BLACKLISTED_TABLE,
	EVENT_DEFAULT_TABLE,
	EVENT_OCCURRENCE_ROOM_PING_TABLE,
	EVENT_OCCURRENCE_ROOM_PULL_TABLE,
	EVENT_OCCURRENCE_TABLE,
	EVENT_PRIORITIZED_TABLE,
	EVENT_QUEUE_TABLE,
	EVENT_ROOM_CHANNEL_TABLE,
	EVENT_ROOM_CHANNEL_TEMPLATE_TABLE,
	EVENT_TABLE,
	EVENT_WHITELISTED_TABLE,
	EVENT_WINNER_TABLE,
	GUILD_BLACKLISTED_TABLE,
	GUILD_PRIORITIZED_TABLE,
	GUILD_TABLE,
	GUILD_WHITELISTED_TABLE,
	MEMBER_TABLE,
	type NewAdmin,
	type NewArchivedMember,
	type NewBlacklisted,
	type NewDisplay,
	type NewEvent,
	type NewEventBlacklisted,
	type NewEventDefault,
	type NewEventOccurrence,
	type NewEventOccurrenceRoomPing,
	type NewEventOccurrenceRoomPull,
	type NewEventPrioritized,
	type NewEventQueue,
	type NewEventRoomChannel,
	type NewEventRoomChannelTemplate,
	type NewEventWhitelisted,
	type NewEventWinner,
	type NewGuild,
	type NewGuildBlacklisted,
	type NewGuildPrioritized,
	type NewGuildWhitelisted,
	type NewMember,
	type NewPrioritized,
	type NewQueue,
	type NewSchedule,
	type NewVoice,
	type NewWhitelisted,
	PRIORITIZED_TABLE,
	QUEUE_TABLE,
	SCHEDULE_TABLE,
	VOICE_TABLE,
	WHITELISTED_TABLE,
} from "./schema.ts";

/**
 * The `Store` class is responsible for all database operations initiated by users, including insert, update, and delete operations.
 * Select queries are encapsulated in `query.utils.ts` to promote code reusability across different parts of the application.
 *
 * ⚠️ IMPORTANT ⚠️: Queries must be written to include guildId!
 */
export class Store {
	public inter: ButtonInteraction | SlashInteraction;

	constructor(
		public guild: Guild,
		inter?: AnyInteraction,
	) {
		this.inter = inter as ButtonInteraction | SlashInteraction;
	}

	// ====================================================================
	//                           Common data
	// ====================================================================

	dbGuild = () => Queries.selectGuild({ guildId: this.guild.id }) ?? this.insertGuild({ guildId: this.guild.id });
	dbQueues = () => toCollection<bigint, DbQueue>("id", Queries.selectManyQueues({ guildId: this.guild.id }));
	dbVoices = () => toCollection<bigint, DbVoice>("id", Queries.selectManyVoices({ guildId: this.guild.id }));
	dbDisplays = () => toCollection<bigint, DbDisplay>("id", Queries.selectManyDisplays({ guildId: this.guild.id }));
	// DbMembers is **ordered by positionTime**.
	dbMembers = () => toCollection<bigint, DbMember>("id", Queries.selectManyMembers({ guildId: this.guild.id }));
	dbSchedules = () => toCollection<bigint, DbSchedule>("id", Queries.selectManySchedules({ guildId: this.guild.id }));
	dbWhitelisted = () => toCollection<bigint, DbWhitelisted>("id", Queries.selectManyWhitelisted({ guildId: this.guild.id }));
	dbBlacklisted = () => toCollection<bigint, DbBlacklisted>("id", Queries.selectManyBlacklisted({ guildId: this.guild.id }));
	dbPrioritized = () => toCollection<bigint, DbPrioritized>("id", Queries.selectManyPrioritized({ guildId: this.guild.id }));
	dbEventBlacklisted = () => toCollection<bigint, DbEventBlacklisted>("id", Queries.selectManyEventBlacklisted({ guildId: this.guild.id }));
	dbEventWhitelisted = () => toCollection<bigint, DbEventWhitelisted>("id", Queries.selectManyEventWhitelisted({ guildId: this.guild.id }));
	dbEventPrioritized = () => toCollection<bigint, DbEventPrioritized>("id", Queries.selectManyEventPrioritized({ guildId: this.guild.id }));
	dbGuildBlacklisted = () => toCollection<bigint, DbGuildBlacklisted>("id", Queries.selectManyGuildBlacklisted({ guildId: this.guild.id }));
	dbGuildWhitelisted = () => toCollection<bigint, DbGuildWhitelisted>("id", Queries.selectManyGuildWhitelisted({ guildId: this.guild.id }));
	dbGuildPrioritized = () => toCollection<bigint, DbGuildPrioritized>("id", Queries.selectManyGuildPrioritized({ guildId: this.guild.id }));
	dbAdmins = () => toCollection<bigint, DbAdmin>("id", Queries.selectManyAdmins({ guildId: this.guild.id }));
	// dbArchivedMembers is **unordered**.
	dbArchivedMembers = () => toCollection<bigint, DbArchivedMember>("id", Queries.selectManyArchivedMembers({ guildId: this.guild.id }));
	dbEvents = () => toCollection<bigint, DbEvent>("id", Queries.selectManyEvents({ guildId: this.guild.id }));
	dbOccurrences = (eventId?: bigint) => toCollection<bigint, DbEventOccurrence>("id", Queries.selectManyOccurrences({ guildId: this.guild.id, eventId }));
	dbEventQueues = (eventId: bigint) => toCollection<bigint, DbEventQueue>("id", Queries.selectManyEventQueues({ guildId: this.guild.id, eventId }));
	dbEventDefault = (eventId: bigint, queueRole: EventQueueRole) => Queries.selectEventDefault({ guildId: this.guild.id, eventId, queueRole });
	dbRoomChannelTemplates = (eventId: bigint) => Queries.selectManyRoomChannelTemplates({ guildId: this.guild.id, eventId });
	dbEventRoomChannels = (eventId: bigint) => Queries.selectManyEventRoomChannels({ guildId: this.guild.id, eventId });

	// ====================================================================
	//                           Discord.js
	// ====================================================================

	async cleanupMissingChannel(channelId: Snowflake) {
		this.deleteManyDisplays({ displayChannelId: channelId });
		this.deleteManyVoices({ sourceChannelId: channelId });
		// Unset instance of the log channel id
		db
			.update(GUILD_TABLE)
			.set({ logChannelId: null })
			.where(and(
				eq(GUILD_TABLE.guildId, this.guild.id),
				eq(GUILD_TABLE.logChannelId, channelId)
			));
	}

	async jsChannel(channelId: Snowflake) {
		try {
			return await this.guild.channels.fetch(channelId);
		}
		catch (e) {
			const { status } = e as DiscordAPIError;
			if (status == 404) {
				console.error(`Store.jsChannel: channel ${channelId} not found (404), cleaning up references:`, e);
				await this.cleanupMissingChannel(channelId);
			}
			else {
				console.error(`Store.jsChannel: failed to fetch channel ${channelId}:`, e);
			}
		}
	}

	async jsChannels(channelIds: Snowflake[]) {
		return toCollection<Snowflake, GuildBasedChannel>("id",
			compact(await Promise.all(channelIds.map(id => this.jsChannel(id))))
		);
	}

	async jsMember(userId: Snowflake) {
		try {
			return await this.guild.members.fetch(userId);
		}
		catch (e) {
			const { status } = e as DiscordAPIError;
			if (status == 404) {
				console.error(`Store.jsMember: member ${userId} not found (404), removing from queues:`, e);
				this.deleteManyMembers({ userId }, MemberRemovalReason.NotFound);
			}
			else {
				console.error(`Store.jsMember: failed to fetch member ${userId}:`, e);
			}
		}
	}

	async jsMembers(userIds: Snowflake[]) {
		return toCollection<Snowflake, GuildMember>("id",
			compact(await Promise.all(userIds.map(id => this.jsMember(id))))
		);
	}

	async jsRole(roleId: Snowflake) {
		try {
			return await this.guild.roles.fetch(roleId);
		}
		catch (e) {
			const { status } = e as DiscordAPIError;
			if (status == 404) {
				console.error(`Store.jsRole: role ${roleId} not found (404), cleaning up references:`, e);
				this.deleteManyWhitelisted({ subjectId: roleId });
				this.deleteManyBlacklisted({ subjectId: roleId });
				this.deleteManyPrioritized({ subjectId: roleId });
				this.deleteManyEventWhitelisted({ subjectId: roleId });
				this.deleteManyEventBlacklisted({ subjectId: roleId });
				this.deleteManyEventPrioritized({ subjectId: roleId });
				this.deleteManyGuildWhitelisted({ subjectId: roleId });
				this.deleteManyGuildBlacklisted({ subjectId: roleId });
				this.deleteManyGuildPrioritized({ subjectId: roleId });
				this.deleteAdmin({ subjectId: roleId });
			}
			else {
				console.error(`Store.jsRole: failed to fetch role ${roleId}:`, e);
			}
		}
	}

	async jsRoles(roleIds: Snowflake[]) {
		return toCollection<Snowflake, Role>("id",
			compact(await Promise.all(roleIds.map(id => this.jsRole(id))))
		);
	}

	// ====================================================================
	//                           Inserts
	// ====================================================================

	incrementGuildStat(stat: GuildStat, by = 1) {
		// Ensure the guild is in the database
		this.insertGuild({ guildId: this.guild.id });
		_incrementGuildStat(this.guild.id, stat, by);
	}

	// do nothing on conflict
	insertGuild(dbGuild: NewGuild) {
		return db
			.insert(GUILD_TABLE)
			.values(omitBy(dbGuild, isNil) as NewGuild)
			.onConflictDoNothing()
			.returning().get();
	}

	// throws error on conflict
	insertQueue(newQueue: NewQueue) {
		try {
			this.incrementGuildStat("queuesAdded");
			return db
				.insert(QUEUE_TABLE)
				.values(omitBy(newQueue, isNil) as NewQueue)
				.returning().get();
		}
		catch (e) {
			if ((e as Error).message.includes("UNIQUE constraint failed")) {
				throw new QueueAlreadyExistsWarning();
			}
			else {
				console.error("Store.insertQueue: unexpected failure:", e);
				throw e;
			}
		}
	}

	// replace on conflict
	insertVoice(newVoice: NewVoice) {
		const voice = omitBy(newVoice, isNil) as NewVoice;
		this.incrementGuildStat("voicesAdded");
		return db
			.insert(VOICE_TABLE)
			.values(voice)
			.onConflictDoUpdate({
				target: [VOICE_TABLE.queueId, VOICE_TABLE.sourceChannelId],
				set: voice,
			})
			.returning().get();
	}

	// replace on conflict
	insertDisplay(newDisplay: NewDisplay) {
		const display = omitBy(newDisplay, isNil) as NewDisplay;
		this.incrementGuildStat("displaysAdded");
		return db
			.insert(DISPLAY_TABLE)
			.values(display)
			.onConflictDoUpdate({
				target: [DISPLAY_TABLE.queueId, DISPLAY_TABLE.displayChannelId],
				set: display,
			})
			.returning().get();
	}

	// replace on conflict
	insertMember(newMember: NewMember) {
		const member = omitBy(newMember, isNil) as NewMember;
		this.incrementGuildStat("membersAdded");
		return db
			.insert(MEMBER_TABLE)
			.values(member)
			.onConflictDoUpdate({
				target: [MEMBER_TABLE.queueId, MEMBER_TABLE.userId],
				set: member,
			})
			.returning().get();
	}

	// throws error on conflict
	insertSchedule(newSchedule: NewSchedule) {
		try {
			this.incrementGuildStat("schedulesAdded");
			return db
				.insert(SCHEDULE_TABLE)
				.values(omitBy(newSchedule, isNil) as NewSchedule)
				.returning().get();
		}
		catch (e) {
			if ((e as Error).message.includes("UNIQUE constraint failed")) {
				throw new ScheduleAlreadyExistsWarning();
			}
			else {
				console.error("Store.insertSchedule: unexpected failure:", e);
				throw e;
			}
		}
	}

	// throws error on conflict
	insertWhitelisted(newWhitelisted: NewWhitelisted) {
		try {
			this.incrementGuildStat("whitelistedAdded");
			return db
				.insert(WHITELISTED_TABLE)
				.values(omitBy(newWhitelisted, isNil) as NewWhitelisted)
				.returning().get();
		}
		catch (e) {
			if ((e as Error).message.includes("UNIQUE constraint failed")) {
				throw new WhitelistedAlreadyExistsWarning();
			}
			else {
				console.error("Store.insertWhitelisted: unexpected failure:", e);
				throw e;
			}
		}
	}

	// throws error on conflict
	insertBlacklisted(newBlacklisted: NewBlacklisted) {
		try {
			this.incrementGuildStat("blacklistedAdded");
			return db
				.insert(BLACKLISTED_TABLE)
				.values(omitBy(newBlacklisted, isNil) as NewBlacklisted)
				.returning().get();
		}
		catch (e) {
			if ((e as Error).message.includes("UNIQUE constraint failed")) {
				throw new BlacklistedAlreadyExistsWarning();
			}
			else {
				console.error("Store.insertBlacklisted: unexpected failure:", e);
				throw e;
			}
		}
	}

	// throws error on conflict
	insertPrioritized(newPrioritized: NewPrioritized) {
		try {
			this.incrementGuildStat("prioritizedAdded");
			return db
				.insert(PRIORITIZED_TABLE)
				.values(omitBy(newPrioritized, isNil) as NewPrioritized)
				.returning().get();
		}
		catch (e) {
			if ((e as Error).message.includes("UNIQUE constraint failed")) {
				throw new PrioritizedAlreadyExistsWarning();
			}
			else {
				console.error("Store.insertPrioritized: unexpected failure:", e);
				throw e;
			}
		}
	}

	// throws error on conflict
	insertEventBlacklisted(newEventBlacklisted: NewEventBlacklisted) {
		try {
			this.incrementGuildStat("blacklistedAdded");
			return db
				.insert(EVENT_BLACKLISTED_TABLE)
				.values(omitBy(newEventBlacklisted, isNil) as NewEventBlacklisted)
				.returning().get();
		}
		catch (e) {
			if ((e as Error).message.includes("UNIQUE constraint failed")) {
				throw new BlacklistedAlreadyExistsWarning();
			}
			console.error("Store.insertEventBlacklisted: unexpected failure:", e);
			throw e;
		}
	}

	// throws error on conflict
	insertEventWhitelisted(newEventWhitelisted: NewEventWhitelisted) {
		try {
			this.incrementGuildStat("whitelistedAdded");
			return db
				.insert(EVENT_WHITELISTED_TABLE)
				.values(omitBy(newEventWhitelisted, isNil) as NewEventWhitelisted)
				.returning().get();
		}
		catch (e) {
			if ((e as Error).message.includes("UNIQUE constraint failed")) {
				throw new WhitelistedAlreadyExistsWarning();
			}
			console.error("Store.insertEventWhitelisted: unexpected failure:", e);
			throw e;
		}
	}

	// throws error on conflict
	insertEventPrioritized(newEventPrioritized: NewEventPrioritized) {
		try {
			this.incrementGuildStat("prioritizedAdded");
			return db
				.insert(EVENT_PRIORITIZED_TABLE)
				.values(omitBy(newEventPrioritized, isNil) as NewEventPrioritized)
				.returning().get();
		}
		catch (e) {
			if ((e as Error).message.includes("UNIQUE constraint failed")) {
				throw new PrioritizedAlreadyExistsWarning();
			}
			console.error("Store.insertEventPrioritized: unexpected failure:", e);
			throw e;
		}
	}

	// throws error on conflict
	insertGuildBlacklisted(newGuildBlacklisted: NewGuildBlacklisted) {
		try {
			this.incrementGuildStat("blacklistedAdded");
			return db
				.insert(GUILD_BLACKLISTED_TABLE)
				.values(omitBy(newGuildBlacklisted, isNil) as NewGuildBlacklisted)
				.returning().get();
		}
		catch (e) {
			if ((e as Error).message.includes("UNIQUE constraint failed")) {
				throw new BlacklistedAlreadyExistsWarning();
			}
			console.error("Store.insertGuildBlacklisted: unexpected failure:", e);
			throw e;
		}
	}

	// throws error on conflict
	insertGuildWhitelisted(newGuildWhitelisted: NewGuildWhitelisted) {
		try {
			this.incrementGuildStat("whitelistedAdded");
			return db
				.insert(GUILD_WHITELISTED_TABLE)
				.values(omitBy(newGuildWhitelisted, isNil) as NewGuildWhitelisted)
				.returning().get();
		}
		catch (e) {
			if ((e as Error).message.includes("UNIQUE constraint failed")) {
				throw new WhitelistedAlreadyExistsWarning();
			}
			console.error("Store.insertGuildWhitelisted: unexpected failure:", e);
			throw e;
		}
	}

	// throws error on conflict
	insertGuildPrioritized(newGuildPrioritized: NewGuildPrioritized) {
		try {
			this.incrementGuildStat("prioritizedAdded");
			return db
				.insert(GUILD_PRIORITIZED_TABLE)
				.values(omitBy(newGuildPrioritized, isNil) as NewGuildPrioritized)
				.returning().get();
		}
		catch (e) {
			if ((e as Error).message.includes("UNIQUE constraint failed")) {
				throw new PrioritizedAlreadyExistsWarning();
			}
			console.error("Store.insertGuildPrioritized: unexpected failure:", e);
			throw e;
		}
	}

	// throws error on conflict
	insertAdmin(newAdmin: NewAdmin) {
		try {
			this.incrementGuildStat("adminsAdded");
			return db
				.insert(ADMIN_TABLE)
				.values(omitBy(newAdmin, isNil) as NewAdmin)
				.returning().get();
		}
		catch (e) {
			if ((e as Error).message.includes("UNIQUE constraint failed")) {
				throw new AdminAlreadyExistsWarning();
			}
			else {
				console.error("Store.insertAdmin: unexpected failure:", e);
				throw e;
			}
		}
	}

	// replace on conflict
	insertArchivedMember(newArchivedMember: NewArchivedMember) {
		this.incrementGuildStat("archivedMembersAdded");
		return db
			.insert(ARCHIVED_MEMBER_TABLE)
			.values(newArchivedMember)
			.onConflictDoUpdate({
				target: [ARCHIVED_MEMBER_TABLE.queueId, ARCHIVED_MEMBER_TABLE.userId],
				set: { ...newArchivedMember, archivedTime: BigInt(Date.now()) },
			})
			.returning().get();
	}

	// throws error on conflict
	insertEvent(newEvent: NewEvent) {
		try {
			this.incrementGuildStat("eventsAdded");
			return db
				.insert(EVENT_TABLE)
				.values(omitBy(newEvent, isNil) as NewEvent)
				.returning().get();
		}
		catch (e) {
			if ((e as Error).message.includes("UNIQUE constraint failed")) {
				throw new EventAlreadyExistsWarning();
			}
			console.error("Store.insertEvent: unexpected failure:", e);
			throw e;
		}
	}

	// throws error on conflict
	insertOccurrence(newOccurrence: NewEventOccurrence) {
		try {
			return db
				.insert(EVENT_OCCURRENCE_TABLE)
				.values(omitBy(newOccurrence, isNil) as NewEventOccurrence)
				.returning().get();
		}
		catch (e) {
			if ((e as Error).message.includes("UNIQUE constraint failed")) {
				throw new OccurrenceAlreadyExistsWarning();
			}
			console.error("Store.insertOccurrence: unexpected failure:", e);
			throw e;
		}
	}

	insertEventQueue(newEventQueue: NewEventQueue) {
		return db
			.insert(EVENT_QUEUE_TABLE)
			.values(omitBy(newEventQueue, isNil) as NewEventQueue)
			.returning().get();
	}

	// idempotent: composite PK conflict is a no-op
	insertOccurrenceRoomPing(row: NewEventOccurrenceRoomPing): DbEventOccurrenceRoomPing {
		return db
			.insert(EVENT_OCCURRENCE_ROOM_PING_TABLE)
			.values(row)
			.onConflictDoNothing()
			.returning().get();
	}

	// idempotent: composite PK conflict is a no-op
	insertOccurrenceRoomPull(row: NewEventOccurrenceRoomPull): DbEventOccurrenceRoomPull {
		return db
			.insert(EVENT_OCCURRENCE_ROOM_PULL_TABLE)
			.values(row)
			.onConflictDoNothing()
			.returning().get();
	}

	// upsert on conflict
	insertEventDefault(newEventDefault: NewEventDefault) {
		const values = omitBy(newEventDefault, isNil) as NewEventDefault;
		return db
			.insert(EVENT_DEFAULT_TABLE)
			.values(values)
			.onConflictDoUpdate({
				target: [EVENT_DEFAULT_TABLE.eventId, EVENT_DEFAULT_TABLE.queueRole],
				set: values,
			})
			.returning().get();
	}

	// upsert on conflict
	insertRoomChannelTemplate(row: NewEventRoomChannelTemplate): DbEventRoomChannelTemplate {
		const values = omitBy(row, isNil) as NewEventRoomChannelTemplate;
		return db
			.insert(EVENT_ROOM_CHANNEL_TEMPLATE_TABLE)
			.values(values)
			.onConflictDoUpdate({
				target: [EVENT_ROOM_CHANNEL_TEMPLATE_TABLE.eventId, EVENT_ROOM_CHANNEL_TEMPLATE_TABLE.suffix],
				set: values,
			})
			.returning().get();
	}

	insertEventRoomChannel(row: NewEventRoomChannel): DbEventRoomChannel {
		return db
			.insert(EVENT_ROOM_CHANNEL_TABLE)
			.values(omitBy(row, isNil) as NewEventRoomChannel)
			.returning().get();
	}

	// idempotent additive declare: (eventId, roomIndex, userId) conflict is a no-op
	insertEventWinner(row: NewEventWinner): DbEventWinner {
		return db
			.insert(EVENT_WINNER_TABLE)
			.values(omitBy(row, isNil) as NewEventWinner)
			.onConflictDoNothing()
			.returning().get();
	}

	// ====================================================================
	//                      Condition helper
	// ====================================================================

	/**
	 * Creates a condition for a query based on the provided parameters.
	 * If there is more than one parameter, the condition will be an `AND` condition.
	 * @param table - The table to create the condition for.
	 * @param params - The parameters to create the condition with.
	 * @param connector - The connector to use for multiple parameters.
	 */
	private createCondition(table: any, params: { [key: string]: any }, connector: "AND" | "OR" = "AND") {
		function createSingleCondition(key: string) {
			const col = table[key];
			const value = params[key];
			return isNil(value) ? isNull(col) : eq(col, value);
		}

		// Add guildId to the params
		params.guildId = this.guild.id;

		if (Object.keys(params).length > 1) {
			if (connector === "AND") {
				return and(...Object.keys(params).map(createSingleCondition));
			}
			else {
				return or(...Object.keys(params).map(createSingleCondition));
			}
		}
		else {
			return createSingleCondition(Object.keys(params)[0]);
		}
	}

	// ====================================================================
	//                           Updates
	// ====================================================================

	updateGuild(guild: { logChannelId: Snowflake, logScope: Scope }) {
		// Ensure the guild is in the database
		this.insertGuild({ guildId: this.guild.id });
		return db
			.update(GUILD_TABLE)
			.set(guild)
			.where(eq(GUILD_TABLE.guildId, this.guild.id))
			.returning().get();
	}

	updateQueue(queue: { id: bigint } & Partial<DbQueue>) {
		return db
			.update(QUEUE_TABLE)
			.set(queue)
			.where(and(
				eq(QUEUE_TABLE.id, queue.id),
				eq(QUEUE_TABLE.guildId, this.guild.id)
			))
			.returning().get();
	}

	updateVoice(voice: { id: bigint } & Partial<DbVoice>) {
		return db
			.update(VOICE_TABLE)
			.set(voice)
			.where(and(
				eq(VOICE_TABLE.id, voice.id),
				eq(VOICE_TABLE.guildId, this.guild.id)
			))
			.returning().get();
	}

	updateDisplay(display: { id: bigint } & Partial<DbDisplay>) {
		return db
			.update(DISPLAY_TABLE)
			.set(display)
			.where(and(
				eq(DISPLAY_TABLE.id, display.id),
				eq(DISPLAY_TABLE.guildId, this.guild.id)
			))
			.returning().get();
	}

	updateMember(member: { id: bigint } & Partial<DbMember>) {
		return db
			.update(MEMBER_TABLE)
			.set(member)
			.where(and(
				eq(MEMBER_TABLE.id, member.id),
				eq(MEMBER_TABLE.guildId, this.guild.id)
			))
			.returning().get();
	}

	updateSchedule(schedule: { id: bigint } & Partial<DbSchedule>) {
		return db
			.update(SCHEDULE_TABLE)
			.set(schedule)
			.where(and(
				eq(SCHEDULE_TABLE.id, schedule.id),
				eq(SCHEDULE_TABLE.guildId, this.guild.id)
			))
			.returning().get();
	}

	updateEvent(event: { id: bigint } & Partial<DbEvent>) {
		return db
			.update(EVENT_TABLE)
			.set(event)
			.where(and(
				eq(EVENT_TABLE.id, event.id),
				eq(EVENT_TABLE.guildId, this.guild.id)
			))
			.returning().get();
	}

	updateOccurrence(by: { id: bigint }, update: Partial<DbEventOccurrence>) {
		return db
			.update(EVENT_OCCURRENCE_TABLE)
			.set(update)
			.where(and(
				eq(EVENT_OCCURRENCE_TABLE.id, by.id),
				eq(EVENT_OCCURRENCE_TABLE.guildId, this.guild.id)
			))
			.returning().get();
	}

	updateEventQueue(eventQueue: { id: bigint } & Partial<DbEventQueue>) {
		return db
			.update(EVENT_QUEUE_TABLE)
			.set(eventQueue)
			.where(and(
				eq(EVENT_QUEUE_TABLE.id, eventQueue.id),
				eq(EVENT_QUEUE_TABLE.guildId, this.guild.id)
			))
			.returning().get();
	}

	updateRoomChannelTemplate(
		by: { eventId: bigint, suffix: string },
		update: Partial<NewEventRoomChannelTemplate>,
	) {
		return db
			.update(EVENT_ROOM_CHANNEL_TEMPLATE_TABLE)
			.set(update)
			.where(and(
				eq(EVENT_ROOM_CHANNEL_TEMPLATE_TABLE.guildId, this.guild.id),
				eq(EVENT_ROOM_CHANNEL_TEMPLATE_TABLE.eventId, by.eventId),
				eq(EVENT_ROOM_CHANNEL_TEMPLATE_TABLE.suffix, by.suffix)
			))
			.returning().get();
	}

	updateEventRoomChannel(
		by: { id: bigint },
		update: Partial<DbEventRoomChannel>,
	) {
		return db
			.update(EVENT_ROOM_CHANNEL_TABLE)
			.set(update)
			.where(and(
				eq(EVENT_ROOM_CHANNEL_TABLE.id, by.id),
				eq(EVENT_ROOM_CHANNEL_TABLE.guildId, this.guild.id)
			))
			.returning().get();
	}

	updateEventDefault(
		by: { eventId: bigint, queueRole: EventQueueRole },
		update: Partial<NewEventDefault>,
	) {
		return db
			.update(EVENT_DEFAULT_TABLE)
			.set(update)
			.where(and(
				eq(EVENT_DEFAULT_TABLE.guildId, this.guild.id),
				eq(EVENT_DEFAULT_TABLE.eventId, by.eventId),
				eq(EVENT_DEFAULT_TABLE.queueRole, by.queueRole)
			))
			.returning().get();
	}

	updateWhitelisted(whitelisted: { id: bigint } & Partial<DbWhitelisted>) {
		return db
			.update(WHITELISTED_TABLE)
			.set(whitelisted)
			.where(and(
				eq(WHITELISTED_TABLE.id, whitelisted.id),
				eq(WHITELISTED_TABLE.guildId, this.guild.id)
			))
			.returning().get();
	}

	updateBlacklisted(blacklisted: { id: bigint } & Partial<DbBlacklisted>) {
		return db
			.update(BLACKLISTED_TABLE)
			.set(blacklisted)
			.where(and(
				eq(BLACKLISTED_TABLE.id, blacklisted.id),
				eq(BLACKLISTED_TABLE.guildId, this.guild.id)
			))
			.returning().get();
	}

	updatePrioritized(prioritized: { id: bigint } & Partial<DbPrioritized>) {
		return db
			.update(PRIORITIZED_TABLE)
			.set(prioritized)
			.where(and(
				eq(PRIORITIZED_TABLE.id, prioritized.id),
				eq(PRIORITIZED_TABLE.guildId, this.guild.id)
			))
			.returning().get();
	}

	updateEventBlacklisted(eventBlacklisted: { id: bigint } & Partial<DbEventBlacklisted>) {
		return db
			.update(EVENT_BLACKLISTED_TABLE)
			.set(eventBlacklisted)
			.where(and(
				eq(EVENT_BLACKLISTED_TABLE.id, eventBlacklisted.id),
				eq(EVENT_BLACKLISTED_TABLE.guildId, this.guild.id)
			))
			.returning().get();
	}

	updateEventWhitelisted(eventWhitelisted: { id: bigint } & Partial<DbEventWhitelisted>) {
		return db
			.update(EVENT_WHITELISTED_TABLE)
			.set(eventWhitelisted)
			.where(and(
				eq(EVENT_WHITELISTED_TABLE.id, eventWhitelisted.id),
				eq(EVENT_WHITELISTED_TABLE.guildId, this.guild.id)
			))
			.returning().get();
	}

	updateEventPrioritized(eventPrioritized: { id: bigint } & Partial<DbEventPrioritized>) {
		return db
			.update(EVENT_PRIORITIZED_TABLE)
			.set(eventPrioritized)
			.where(and(
				eq(EVENT_PRIORITIZED_TABLE.id, eventPrioritized.id),
				eq(EVENT_PRIORITIZED_TABLE.guildId, this.guild.id)
			))
			.returning().get();
	}

	updateGuildBlacklisted(guildBlacklisted: { id: bigint } & Partial<DbGuildBlacklisted>) {
		return db
			.update(GUILD_BLACKLISTED_TABLE)
			.set(guildBlacklisted)
			.where(and(
				eq(GUILD_BLACKLISTED_TABLE.id, guildBlacklisted.id),
				eq(GUILD_BLACKLISTED_TABLE.guildId, this.guild.id)
			))
			.returning().get();
	}

	updateGuildWhitelisted(guildWhitelisted: { id: bigint } & Partial<DbGuildWhitelisted>) {
		return db
			.update(GUILD_WHITELISTED_TABLE)
			.set(guildWhitelisted)
			.where(and(
				eq(GUILD_WHITELISTED_TABLE.id, guildWhitelisted.id),
				eq(GUILD_WHITELISTED_TABLE.guildId, this.guild.id)
			))
			.returning().get();
	}

	updateGuildPrioritized(guildPrioritized: { id: bigint } & Partial<DbGuildPrioritized>) {
		return db
			.update(GUILD_PRIORITIZED_TABLE)
			.set(guildPrioritized)
			.where(and(
				eq(GUILD_PRIORITIZED_TABLE.id, guildPrioritized.id),
				eq(GUILD_PRIORITIZED_TABLE.guildId, this.guild.id)
			))
			.returning().get();
	}

	// ====================================================================
	//                           Deletes
	// ====================================================================

	deleteQueue(by: { id: bigint }) {
		const cond = this.createCondition(QUEUE_TABLE, by);
		return db.delete(QUEUE_TABLE).where(cond).returning().get();
	}

	deleteManyQueues() {
		const cond = this.createCondition(QUEUE_TABLE, {});
		return db.delete(QUEUE_TABLE).where(cond).returning().all();
	}

	deleteVoice(by: { id: bigint }) {
		const cond = this.createCondition(VOICE_TABLE, by);
		return db.delete(VOICE_TABLE).where(cond).returning().get();
	}

	deleteManyVoices(by:
		{ id: bigint } |
		{ sourceChannelId: Snowflake }
	) {
		const cond = this.createCondition(VOICE_TABLE, by);
		return db.delete(VOICE_TABLE).where(cond).returning().all();
	}

	deleteDisplay(by:
								{ id: bigint } |
								{ lastMessageId: Snowflake } |
								{ queueId: bigint, displayChannelId: Snowflake }
	) {
		const cond = this.createCondition(DISPLAY_TABLE, by);
		return db.delete(DISPLAY_TABLE).where(cond).returning().get();
	}

	deleteManyDisplays(by:
		{ queueId?: bigint } |
		{ displayChannelId?: Snowflake }
	) {
		const cond = this.createCondition(DISPLAY_TABLE, by);
		return db.delete(DISPLAY_TABLE).where(cond).returning().all();
	}

	deleteMember(by:
		{ id: bigint } |
		{ queueId: bigint, userId?: Snowflake },
	reason: MemberRemovalReason
	) {
		const deletedMember = db.transaction(() => {
			if ("userId" in by) {
				const cond = this.createCondition(MEMBER_TABLE, by);
				return db.delete(MEMBER_TABLE).where(cond).returning().get();
			}
			else {
				const member = Queries.selectMember({ ...by, guildId: this.guild.id });
				if (member) {
					return db.delete(MEMBER_TABLE).where(eq(MEMBER_TABLE.id, member.id)).returning().get();
				}
			}
		});

		if (deletedMember) {
			this.insertArchivedMember({ ...deletedMember, reason });
		}

		return deletedMember;
	}

	deleteManyMembers(by:
		{ userId?: Snowflake } |
		{ queueId: bigint, count?: number },
	reason: MemberRemovalReason
	) {
		let deletedMembers: DbMember[];
		db.transaction(() => {
			const cond = ("count" in by)
				? or(...Queries.selectManyMembers({
					...by,
					guildId: this.guild.id,
				}).map(member => eq(MEMBER_TABLE.id, member.id)))
				: this.createCondition(MEMBER_TABLE, by);
			deletedMembers = db.delete(MEMBER_TABLE).where(cond).returning().all();

			deletedMembers.forEach(deletedMember =>
				this.insertArchivedMember({ ...deletedMember, reason })
			);
		});
		return deletedMembers;
	}

	deleteSchedule(by: { id: bigint }) {
		const cond = this.createCondition(SCHEDULE_TABLE, by);
		return db.delete(SCHEDULE_TABLE).where(cond).returning().get();
	}

	deleteManySchedules() {
		const cond = this.createCondition(SCHEDULE_TABLE, {});
		return db.delete(SCHEDULE_TABLE).where(cond).returning().all();
	}

	deleteWhitelisted(by:
										{ id: bigint } |
										{ queueId: bigint, subjectId: bigint }
	) {
		const cond = this.createCondition(WHITELISTED_TABLE, by);
		return db.delete(WHITELISTED_TABLE).where(cond).returning().get();
	}

	deleteManyWhitelisted(by:
												{ subjectId?: Snowflake } |
												{ queueId: bigint }
	) {
		const cond = this.createCondition(WHITELISTED_TABLE, by);
		return db.delete(WHITELISTED_TABLE).where(cond).returning().all();
	}

	deleteBlacklisted(by:
										{ id: bigint } |
										{ queueId: bigint, subjectId: Snowflake }
	) {
		const cond = this.createCondition(BLACKLISTED_TABLE, by);
		return db.delete(BLACKLISTED_TABLE).where(cond).returning().get();
	}

	deleteManyBlacklisted(by:
												{ subjectId?: Snowflake } |
												{ queueId: bigint }
	) {
		const cond = this.createCondition(BLACKLISTED_TABLE, by);
		return db.delete(BLACKLISTED_TABLE).where(cond).returning().get();
	}

	deletePrioritized(by:
										{ id: bigint } |
										{ queueId: bigint, subjectId: bigint }
	) {
		const cond = this.createCondition(PRIORITIZED_TABLE, by);
		return db.delete(PRIORITIZED_TABLE).where(cond).returning().get();
	}

	deleteManyPrioritized(by:
												{ subjectId?: Snowflake } |
												{ queueId: bigint }
	) {
		const cond = this.createCondition(PRIORITIZED_TABLE, by);
		return db.delete(PRIORITIZED_TABLE).where(cond).returning().get();
	}

	deleteEventBlacklisted(by:
		{ id: bigint } |
		{ eventId: bigint, subjectId: Snowflake }
	) {
		const cond = this.createCondition(EVENT_BLACKLISTED_TABLE, by);
		return db.delete(EVENT_BLACKLISTED_TABLE).where(cond).returning().get();
	}

	deleteManyEventBlacklisted(by:
		{ subjectId?: Snowflake } |
		{ eventId: bigint }
	) {
		const cond = this.createCondition(EVENT_BLACKLISTED_TABLE, by);
		return db.delete(EVENT_BLACKLISTED_TABLE).where(cond).returning().all();
	}

	deleteEventWhitelisted(by:
		{ id: bigint } |
		{ eventId: bigint, subjectId: Snowflake }
	) {
		const cond = this.createCondition(EVENT_WHITELISTED_TABLE, by);
		return db.delete(EVENT_WHITELISTED_TABLE).where(cond).returning().get();
	}

	deleteManyEventWhitelisted(by:
		{ subjectId?: Snowflake } |
		{ eventId: bigint }
	) {
		const cond = this.createCondition(EVENT_WHITELISTED_TABLE, by);
		return db.delete(EVENT_WHITELISTED_TABLE).where(cond).returning().all();
	}

	deleteEventPrioritized(by:
		{ id: bigint } |
		{ eventId: bigint, subjectId: Snowflake }
	) {
		const cond = this.createCondition(EVENT_PRIORITIZED_TABLE, by);
		return db.delete(EVENT_PRIORITIZED_TABLE).where(cond).returning().get();
	}

	deleteManyEventPrioritized(by:
		{ subjectId?: Snowflake } |
		{ eventId: bigint }
	) {
		const cond = this.createCondition(EVENT_PRIORITIZED_TABLE, by);
		return db.delete(EVENT_PRIORITIZED_TABLE).where(cond).returning().all();
	}

	deleteGuildBlacklisted(by:
		{ id: bigint } |
		{ subjectId: Snowflake }
	) {
		const cond = this.createCondition(GUILD_BLACKLISTED_TABLE, by);
		return db.delete(GUILD_BLACKLISTED_TABLE).where(cond).returning().get();
	}

	deleteManyGuildBlacklisted(by: { subjectId?: Snowflake }) {
		const cond = this.createCondition(GUILD_BLACKLISTED_TABLE, by);
		return db.delete(GUILD_BLACKLISTED_TABLE).where(cond).returning().all();
	}

	deleteGuildWhitelisted(by:
		{ id: bigint } |
		{ subjectId: Snowflake }
	) {
		const cond = this.createCondition(GUILD_WHITELISTED_TABLE, by);
		return db.delete(GUILD_WHITELISTED_TABLE).where(cond).returning().get();
	}

	deleteManyGuildWhitelisted(by: { subjectId?: Snowflake }) {
		const cond = this.createCondition(GUILD_WHITELISTED_TABLE, by);
		return db.delete(GUILD_WHITELISTED_TABLE).where(cond).returning().all();
	}

	deleteGuildPrioritized(by:
		{ id: bigint } |
		{ subjectId: Snowflake }
	) {
		const cond = this.createCondition(GUILD_PRIORITIZED_TABLE, by);
		return db.delete(GUILD_PRIORITIZED_TABLE).where(cond).returning().get();
	}

	deleteManyGuildPrioritized(by: { subjectId?: Snowflake }) {
		const cond = this.createCondition(GUILD_PRIORITIZED_TABLE, by);
		return db.delete(GUILD_PRIORITIZED_TABLE).where(cond).returning().all();
	}

	deleteAdmin(by:
							{ id: bigint } |
							{ subjectId: Snowflake }
	) {
		const cond = this.createCondition(ADMIN_TABLE, by);
		return db.delete(ADMIN_TABLE).where(cond).returning().get();
	}

	deleteManyAdmins() {
		const cond = this.createCondition(ADMIN_TABLE, {});
		return db.delete(ADMIN_TABLE).where(cond).returning().get();
	}

	deleteEvent(by: { id: bigint }) {
		const cond = this.createCondition(EVENT_TABLE, by);
		return db.delete(EVENT_TABLE).where(cond).returning().get();
	}

	deleteOccurrence(by: { id: bigint }) {
		const cond = this.createCondition(EVENT_OCCURRENCE_TABLE, by);
		return db.delete(EVENT_OCCURRENCE_TABLE).where(cond).returning().get();
	}

	deleteRoomChannelTemplate(by: { eventId: bigint, suffix: string }) {
		return db
			.delete(EVENT_ROOM_CHANNEL_TEMPLATE_TABLE)
			.where(and(
				eq(EVENT_ROOM_CHANNEL_TEMPLATE_TABLE.guildId, this.guild.id),
				eq(EVENT_ROOM_CHANNEL_TEMPLATE_TABLE.eventId, by.eventId),
				eq(EVENT_ROOM_CHANNEL_TEMPLATE_TABLE.suffix, by.suffix)
			))
			.returning().get();
	}

	deleteEventRoomChannel(by: { id: bigint }) {
		return db
			.delete(EVENT_ROOM_CHANNEL_TABLE)
			.where(and(
				eq(EVENT_ROOM_CHANNEL_TABLE.id, by.id),
				eq(EVENT_ROOM_CHANNEL_TABLE.guildId, this.guild.id)
			))
			.returning().get();
	}

	deleteManyEventRoomChannels(by: { eventId: bigint, suffix?: string }) {
		const conds = [
			eq(EVENT_ROOM_CHANNEL_TABLE.guildId, this.guild.id),
			eq(EVENT_ROOM_CHANNEL_TABLE.eventId, by.eventId),
		];
		if (by.suffix !== undefined) {
			conds.push(eq(EVENT_ROOM_CHANNEL_TABLE.suffix, by.suffix));
		}
		return db
			.delete(EVENT_ROOM_CHANNEL_TABLE)
			.where(and(...conds))
			.returning().all();
	}

	deleteManyEventWinners(by: { eventId: bigint, roomIndex?: bigint }) {
		const conds = [
			eq(EVENT_WINNER_TABLE.guildId, this.guild.id),
			eq(EVENT_WINNER_TABLE.eventId, by.eventId),
		];
		if (by.roomIndex !== undefined) {
			conds.push(eq(EVENT_WINNER_TABLE.roomIndex, by.roomIndex));
		}
		return db
			.delete(EVENT_WINNER_TABLE)
			.where(and(...conds))
			.returning().all();
	}
}
