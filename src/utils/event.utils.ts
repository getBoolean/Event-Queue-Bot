import { channelMention, type GuildTextBasedChannel, type Snowflake, time, TimestampStyles } from "discord.js";
import { SQLiteColumn } from "drizzle-orm/sqlite-core";
import { compact, findKey, isNil, omitBy } from "lodash-es";
import nodeSchedule, { type Job } from "node-schedule";

import { Queries } from "../db/queries.ts";
import {
	type DbEvent,
	type DbEventOccurrence,
	type DbEventQueue,
	type DbQueue,
	EVENT_DEFAULT_TABLE,
	type NewEvent,
	type NewEventDefault,
	QUEUE_TABLE,
} from "../db/schema.ts";
import { Store } from "../db/store.ts";
import { DisplayUpdateType, EventQueueRole, MemberRemovalReason, RoomScheduling } from "../types/db.types.ts";
import { ClientUtils } from "./client.utils.ts";
import { DisplayUtils } from "./display.utils.ts";
import {
	CustomError,
	EventRoomCountShrinkError,
	LockBeforeOpenError,
	OccurrenceInPastError,
	QueueAlreadyExistsError,
	SequentialEventRequiresRoomLengthError,
} from "./error.utils.ts";
import { EventChannelUtils } from "./event-channel.utils.ts";
import { MemberUtils } from "./member.utils.ts";
import { QueueUtils } from "./queue.utils.ts";

export namespace EventUtils {

	// ====================================================================
	//                        In-memory job tracking
	// ====================================================================

	interface OccurrenceJobs {
		open?: Job;
		lock?: Job;
		cleanup?: Job;
		roomPings: Map<bigint, Job>;
	}

	const occurrenceIdToJobs = new Map<bigint, OccurrenceJobs>();

	// ====================================================================
	//                        Public API
	// ====================================================================

	export function assertHasRoomCategory(event: DbEvent) {
		if (!event.roomCategoryId) {
			throw new CustomError({
				message: `Event "${event.name}" has no \`room_category\`. Run \`/events set event:${event.name} room_category:…\` first.`,
			});
		}
	}

	export async function insertEvent(store: Store, newEvent: Omit<NewEvent, "guildId">) {
		validateEventOffsets(
			BigInt(newEvent.createOffsetMs ?? 86_400_000n),
			BigInt(newEvent.lockOffsetMs ?? 0n),
		);

		if (newEvent.roomScheduling === RoomScheduling.Sequential) {
			if (!newEvent.roomLengthMs || BigInt(newEvent.roomLengthMs) <= 0n) {
				throw new SequentialEventRequiresRoomLengthError();
			}
		}

		const event = store.insertEvent({ guildId: store.guild.id, ...newEvent });

		const roomCount = Number(event.roomCount);
		for (let i = 1; i <= roomCount; i++) {
			await createEventQueue(store, event, EventQueueRole.Room, i, event.roomChannelId);
			await createEventQueue(store, event, EventQueueRole.Sub, i, event.subChannelId);
		}

		if (event.roomCategoryId) {
			await EventChannelUtils.reconcileRoomChannels(store, event);
		}

		return event;
	}

	export async function updateEvent(store: Store, event: DbEvent, update: Partial<DbEvent>) {
		const newCreateOffset = BigInt(update.createOffsetMs ?? event.createOffsetMs);
		const newLockOffset = BigInt(update.lockOffsetMs ?? event.lockOffsetMs);
		validateEventOffsets(newCreateOffset, newLockOffset);

		const newScheduling = (update.roomScheduling ?? event.roomScheduling) as RoomScheduling;
		const newRoomLengthMs = update.roomLengthMs !== undefined ? update.roomLengthMs : event.roomLengthMs;
		if (newScheduling === RoomScheduling.Sequential) {
			if (!newRoomLengthMs || BigInt(newRoomLengthMs) <= 0n) {
				throw new SequentialEventRequiresRoomLengthError();
			}
		}

		if (update.roomCount !== undefined) {
			const oldCount = Number(event.roomCount);
			const newCount = Number(update.roomCount);
			if (newCount < oldCount) {
				throw new EventRoomCountShrinkError();
			}
			if (newCount > oldCount) {
				for (let i = oldCount + 1; i <= newCount; i++) {
					await createEventQueue(store, event, EventQueueRole.Room, i, event.roomChannelId);
					await createEventQueue(store, event, EventQueueRole.Sub, i, event.subChannelId);
				}
			}
		}

		const oldModeratorRoleId = event.moderatorRoleId;
		const updatedEvent = store.updateEvent({ id: event.id, ...update });

		// Re-arm pending occurrences if timing-related fields changed
		const timingChanged = update.createOffsetMs !== undefined
			|| update.lockOffsetMs !== undefined
			|| update.cleanupOffsetMs !== undefined
			|| update.roomScheduling !== undefined
			|| update.roomLengthMs !== undefined
			|| update.roomCount !== undefined;

		if (timingChanged) {
			await rearmAllOccurrences(store, updatedEvent);
		}

		const channelsChanged = update.roomCategoryId !== undefined
			|| update.moderatorRoleId !== undefined
			|| update.roomCount !== undefined
			|| (update.moderatorRoleId === undefined && oldModeratorRoleId !== updatedEvent.moderatorRoleId);

		const roleFlagsChanged = update.roleInRoomQueue !== undefined
			|| update.roleOnRoomPull !== undefined
			|| update.roleInSubQueue !== undefined
			|| update.roleOnSubPull !== undefined;

		if (channelsChanged && updatedEvent.roomCategoryId) {
			await EventChannelUtils.reconcileRoomChannels(store, updatedEvent);
		}
		else if (roleFlagsChanged && updatedEvent.roomCategoryId) {
			await EventChannelUtils.reconcileRoleAssignments(store, updatedEvent);
		}

		return updatedEvent;
	}

	export async function deleteEvent(store: Store, event: DbEvent) {
		await EventChannelUtils.deleteAllEventChannels(store, event);
		await EventChannelUtils.deleteAutoCreatedRoles(store, event);

		const eventQueues = Queries.selectManyEventQueues({ guildId: store.guild.id, eventId: event.id });
		for (const eq of eventQueues) {
			store.deleteQueue({ id: eq.queueId });
		}

		const occurrences = Queries.selectManyOccurrences({ guildId: store.guild.id, eventId: event.id });
		for (const occ of occurrences) {
			unregisterJobs(occ.id);
		}

		store.deleteEvent({ id: event.id });
	}

	export async function setRoleDefaults(
		store: Store,
		event: DbEvent,
		role: EventQueueRole,
		updates: Partial<Omit<NewEventDefault, "guildId" | "eventId" | "queueRole">>,
	) {
		store.insertEventDefault({
			guildId: store.guild.id,
			eventId: event.id,
			queueRole: role,
			...updates,
		});

		const eventQueues = Queries.selectManyEventQueues({ guildId: store.guild.id, eventId: event.id })
			.filter(eq => eq.queueRole === role);
		const queues = compact(eventQueues.map(eq => Queries.selectQueue({ guildId: store.guild.id, id: eq.queueId })));

		if (queues.length > 0) {
			await QueueUtils.updateQueues(store, queues, updates as Partial<DbQueue>);
		}
	}

	export async function resetRoleDefaults(
		store: Store,
		event: DbEvent,
		role: EventQueueRole,
		columnNames: string[],
	) {
		const eventDefaultUpdate: Record<string, unknown> = {};
		const queueUpdate: Record<string, unknown> = {};
		for (const columnName of columnNames) {
			const eventDefaultKey = findKey(EVENT_DEFAULT_TABLE, (col: SQLiteColumn) => col.name === columnName);
			if (eventDefaultKey) {
				eventDefaultUpdate[eventDefaultKey] = null;
			}
			const queueKey = findKey(QUEUE_TABLE, (col: SQLiteColumn) => col.name === columnName);
			if (queueKey) {
				queueUpdate[queueKey] = (QUEUE_TABLE as any)[queueKey]?.default ?? null;
			}
		}

		const existingDefault = Queries.selectEventDefault({
			guildId: store.guild.id,
			eventId: event.id,
			queueRole: role,
		});
		if (existingDefault && Object.keys(eventDefaultUpdate).length > 0) {
			store.updateEventDefault({ eventId: event.id, queueRole: role }, eventDefaultUpdate);
		}

		const eventQueues = Queries.selectManyEventQueues({ guildId: store.guild.id, eventId: event.id })
			.filter(eq => eq.queueRole === role);
		const queues = compact(eventQueues.map(eq => Queries.selectQueue({ guildId: store.guild.id, id: eq.queueId })));

		if (queues.length > 0 && Object.keys(queueUpdate).length > 0) {
			await QueueUtils.updateQueues(store, queues, queueUpdate as Partial<DbQueue>);
		}
	}

	export async function scheduleOccurrence(
		store: Store,
		event: DbEvent,
		startTime: bigint,
		timezone?: string,
	) {
		const cleanupAt = Number(startTime) + Number(event.cleanupOffsetMs);
		if (cleanupAt < Date.now()) {
			throw new OccurrenceInPastError();
		}

		if (event.roomScheduling === RoomScheduling.Sequential) {
			if (!event.roomLengthMs || BigInt(event.roomLengthMs) <= 0n) {
				throw new SequentialEventRequiresRoomLengthError();
			}
		}

		const occurrence = store.insertOccurrence({
			guildId: store.guild.id,
			eventId: event.id,
			startTime,
			timezone,
		});

		await armOccurrence(event, occurrence);

		return occurrence;
	}

	export async function cancelOccurrence(store: Store, occurrence: DbEventOccurrence) {
		unregisterJobs(occurrence.id);
		store.deleteOccurrence({ id: occurrence.id });
	}

	export async function loadOccurrences() {
		const occurrences = Queries.selectAllOccurrences();
		console.time(`Loaded ${occurrences.length} event occurrences`);

		for (const occurrence of occurrences) {
			const event = Queries.selectEvent({ guildId: occurrence.guildId, id: occurrence.eventId });
			if (!event) {
				continue;
			}
			await armOccurrence(event, occurrence);
		}

		console.timeEnd(`Loaded ${occurrences.length} event occurrences`);
	}

	// ====================================================================
	//                        Job scheduling
	// ====================================================================

	async function armPhase(
		at: number,
		now: number,
		alreadyDone: boolean,
		run: () => Promise<void>,
		markDone: () => void,
		label: string,
	): Promise<Job | undefined> {
		if (alreadyDone) return;
		if (at <= now) {
			await run();
			markDone();
			return;
		}
		return nodeSchedule.scheduleJob(new Date(at), async () => {
			try {
				await run();
				markDone();
			}
			catch (e) {
				console.error(`Event ${label} action failed:`, (e as Error).message);
			}
		});
	}

	async function armOccurrence(event: DbEvent, occurrence: DbEventOccurrence) {
		unregisterJobs(occurrence.id);

		const now = Date.now();
		const startMs = Number(occurrence.startTime);
		const openAt = startMs - Number(event.createOffsetMs);
		const lockAt = startMs + Number(event.lockOffsetMs);
		const cleanupAt = startMs + Number(event.cleanupOffsetMs);

		const guild = await ClientUtils.getGuild(occurrence.guildId);
		if (!guild) return;
		const store = new Store(guild);

		const pingedQueueIds = new Set(
			Queries.selectOccurrenceRoomPings({ occurrenceId: occurrence.id }).map(r => r.eventQueueId)
		);

		const jobs: OccurrenceJobs = { roomPings: new Map() };

		// Open action
		jobs.open = await armPhase(
			openAt,
			now,
			occurrence.openHandledAt != null,
			() => runOpenAction(occurrence.id),
			() => store.updateOccurrence({ id: occurrence.id }, { openHandledAt: BigInt(Date.now()) }),
			"open",
		);

		// Lock action
		jobs.lock = await armPhase(
			lockAt,
			now,
			occurrence.lockHandledAt != null,
			() => runLockAction(occurrence.id),
			() => store.updateOccurrence({ id: occurrence.id }, { lockHandledAt: BigInt(Date.now()) }),
			"lock",
		);

		// Room pings
		const eventQueues = Queries.selectManyEventQueues({ guildId: event.guildId, eventId: event.id })
			.filter(eq => eq.queueRole === EventQueueRole.Room);

		for (const eq of eventQueues) {
			let pingAt: number;
			if (event.roomScheduling === RoomScheduling.Sequential && event.roomLengthMs) {
				pingAt = startMs + (Number(eq.queueIndex) - 1) * Number(event.roomLengthMs);
			}
			else {
				pingAt = startMs;
			}

			const pingJob = await armPhase(
				pingAt,
				now,
				pingedQueueIds.has(eq.id),
				() => runRoomPingAction(occurrence.id, eq),
				() => store.insertOccurrenceRoomPing({
					occurrenceId: occurrence.id,
					eventQueueId: eq.id,
					handledAt: BigInt(Date.now()),
				}),
				"room ping",
			);
			if (pingJob) jobs.roomPings.set(eq.id, pingJob);
		}

		// Cleanup action — no flag needed; cleanup deletes the row (cascades the junction)
		if (cleanupAt <= now) {
			await runCleanupAction(occurrence.id);
		}
		else {
			jobs.cleanup = nodeSchedule.scheduleJob(new Date(cleanupAt), async () => {
				try { await runCleanupAction(occurrence.id); }
				catch (e) { console.error("Event cleanup action failed:", (e as Error).message); }
			});
		}

		occurrenceIdToJobs.set(occurrence.id, jobs);
	}

	function unregisterJobs(occurrenceId: bigint) {
		const jobs = occurrenceIdToJobs.get(occurrenceId);
		if (!jobs) return;
		jobs.open?.cancel();
		jobs.lock?.cancel();
		jobs.cleanup?.cancel();
		jobs.roomPings.forEach(job => job.cancel());
		occurrenceIdToJobs.delete(occurrenceId);
	}

	async function rearmAllOccurrences(store: Store, event: DbEvent) {
		const occurrences = Queries.selectManyOccurrences({ guildId: store.guild.id, eventId: event.id });
		for (const occ of occurrences) {
			await armOccurrence(event, occ);
		}
	}

	// ====================================================================
	//                        Actions
	// ====================================================================

	async function getEventContext(occurrenceId: bigint) {
		const occurrence = Queries.selectOccurrence({ id: occurrenceId });
		if (!occurrence) return;

		const event = Queries.selectEvent({ guildId: occurrence.guildId, id: occurrence.eventId });
		if (!event) return;

		const guild = await ClientUtils.getGuild(occurrence.guildId);
		if (!guild) return;

		const store = new Store(guild);
		const eventQueues = Queries.selectManyEventQueues({ guildId: occurrence.guildId, eventId: event.id });
		const queues = compact(eventQueues.map(eq => Queries.selectQueue({ guildId: occurrence.guildId, id: eq.queueId })));

		return { occurrence, event, store, eventQueues, queues };
	}

	async function runOpenAction(occurrenceId: bigint) {
		const ctx = await getEventContext(occurrenceId);
		if (!ctx) return;
		const { occurrence, event, store, queues } = ctx;

		// Unlock all event queues
		if (queues.length > 0) {
			await QueueUtils.updateQueues(store, queues, { lockToggle: false } as Partial<DbQueue>);
		}

		// Force-refresh displays
		const queueIds = queues.map(q => q.id);
		DisplayUtils.requestDisplaysUpdate({
			store,
			queueIds,
			opts: { updateTypeOverride: DisplayUpdateType.Replace },
		});

		// Send announcement
		if (event.announcementChannelId && event.announcementMessage) {
			try {
				const channel = await store.jsChannel(event.announcementChannelId) as GuildTextBasedChannel;
				if (channel) {
					const content = renderTemplate(event.announcementMessage, buildAnnouncementContext(event, occurrence));
					await channel.send({
						content,
						allowedMentions: { parse: ["everyone", "roles", "users"] },
					});
				}
			}
			catch (e) {
				console.error("Failed to send event announcement:", (e as Error).message);
			}
		}
	}

	async function runLockAction(occurrenceId: bigint) {
		const ctx = await getEventContext(occurrenceId);
		if (!ctx) return;
		const { store, eventQueues } = ctx;

		// Lock only room queues
		const roomQueues = compact(
			eventQueues
				.filter(eq => eq.queueRole === EventQueueRole.Room)
				.map(eq => Queries.selectQueue({ guildId: store.guild.id, id: eq.queueId }))
		);

		if (roomQueues.length > 0) {
			await QueueUtils.updateQueues(store, roomQueues, { lockToggle: true } as Partial<DbQueue>);
		}
	}

	async function runRoomPingAction(occurrenceId: bigint, eventQueue: DbEventQueue) {
		const occurrence = Queries.selectOccurrence({ id: occurrenceId });
		if (!occurrence) return;

		const event = Queries.selectEvent({ guildId: occurrence.guildId, id: occurrence.eventId });
		if (!event) return;

		const queue = Queries.selectQueue({ guildId: occurrence.guildId, id: eventQueue.queueId });
		if (!queue) return;

		const guild = await ClientUtils.getGuild(occurrence.guildId);
		if (!guild) return;
		const store = new Store(guild);

		const pingChannelId = eventQueue.pingChannelId ?? event.roomChannelId;

		try {
			const channel = await store.jsChannel(pingChannelId) as GuildTextBasedChannel;
			if (!channel) return;

			const template = event.roomPingMessage ?? "{room_role} — {room_name} is starting soon!";
			const ctx = buildRoomPingContext(event, occurrence, eventQueue, queue);
			const content = renderTemplate(template, ctx);

			if (content.trim()) {
				await channel.send({
					content,
					allowedMentions: { parse: ["roles", "users"] },
				});
			}
		}
		catch (e) {
			console.error("Failed to send room ping:", (e as Error).message);
		}
	}

	async function runCleanupAction(occurrenceId: bigint) {
		const ctx = await getEventContext(occurrenceId);
		if (!ctx) return;
		const { store, queues } = ctx;

		// Clear all members from all event queues
		if (queues.length > 0) {
			await MemberUtils.deleteMembers({
				store,
				queues,
				reason: MemberRemovalReason.Kicked,
				by: { count: 9999 },
				force: true,
			});

			// Lock all queues
			await QueueUtils.updateQueues(store, queues, { lockToggle: true } as Partial<DbQueue>);
		}

		// Delete the occurrence row
		store.deleteOccurrence({ id: occurrenceId });
		unregisterJobs(occurrenceId);
	}

	// ====================================================================
	//                        Template rendering
	// ====================================================================

	function renderTemplate(template: string, ctx: Record<string, string>): string {
		return template.replace(/\{(\w+)\}/g, (_, k) => ctx[k] ?? "");
	}

	function buildAnnouncementContext(event: DbEvent, occurrence: DbEventOccurrence): Record<string, string> {
		const startDate = new Date(Number(occurrence.startTime));
		return {
			event_name: event.name,
			start_time: time(startDate, TimestampStyles.LongDateTime),
			start_time_relative: time(startDate, TimestampStyles.RelativeTime),
			room_channel: channelMention(event.roomChannelId),
			sub_channel: channelMention(event.subChannelId),
		};
	}

	function buildRoomPingContext(
		event: DbEvent,
		occurrence: DbEventOccurrence,
		eventQueue: DbEventQueue,
		queue: DbQueue,
	): Record<string, string> {
		const startDate = new Date(Number(occurrence.startTime));
		const roleStr = queue.roleInQueueId ? `<@&${queue.roleInQueueId}>` : "";
		const pingChId = eventQueue.pingChannelId ?? event.roomChannelId;
		return {
			event_name: event.name,
			room_name: queue.name,
			room_role: roleStr,
			room_index: String(eventQueue.queueIndex),
			room_channel: channelMention(event.roomChannelId),
			ping_channel: channelMention(pingChId),
			start_time: time(startDate, TimestampStyles.LongDateTime),
			start_time_relative: time(startDate, TimestampStyles.RelativeTime),
		};
	}

	// ====================================================================
	//                        Helpers
	// ====================================================================

	function validateEventOffsets(createOffsetMs: bigint, lockOffsetMs: bigint) {
		// lockAt = startTime + lockOffsetMs
		// openAt = startTime - createOffsetMs
		// lockAt must be >= openAt => lockOffsetMs >= -createOffsetMs
		if (lockOffsetMs < -createOffsetMs) {
			throw new LockBeforeOpenError();
		}
	}

	async function createEventQueue(
		store: Store,
		event: DbEvent,
		role: EventQueueRole,
		index: number,
		displayChannelId: Snowflake,
	) {
		const roleLabel = role === EventQueueRole.Room ? "Room" : "Sub";
		let queueName = `${event.name} ${roleLabel} ${index}`;

		// Load defaults for this role
		const defaults = Queries.selectEventDefault({
			guildId: store.guild.id,
			eventId: event.id,
			queueRole: role,
		});
		const queueConfig = defaults ? omitBy(defaults, isNil) : {};
		delete queueConfig.id;
		delete queueConfig.guildId;
		delete queueConfig.eventId;
		delete queueConfig.queueRole;

		let insertedQueue: DbQueue;
		try {
			const result = await QueueUtils.insertQueue(store, {
				guildId: store.guild.id,
				name: queueName,
				...queueConfig,
			});
			insertedQueue = result.insertedQueue;
		}
		catch (e) {
			if (e instanceof QueueAlreadyExistsError) {
				queueName = `${queueName} (event)`;
				const result = await QueueUtils.insertQueue(store, {
					guildId: store.guild.id,
					name: queueName,
					...queueConfig,
				});
				insertedQueue = result.insertedQueue;
			}
			else {
				throw e;
			}
		}

		// Create display for the queue
		await DisplayUtils.insertDisplays(store, [insertedQueue], displayChannelId);

		// Create junction row
		store.insertEventQueue({
			guildId: store.guild.id,
			eventId: event.id,
			queueId: insertedQueue.id,
			queueRole: role,
			queueIndex: BigInt(index),
		});

		return insertedQueue;
	}
}
