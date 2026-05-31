import {
	channelMention,
	type DiscordAPIError,
	type GuildScheduledEventCreateOptions,
	GuildScheduledEventEntityType,
	GuildScheduledEventPrivacyLevel,
	type GuildTextBasedChannel,
	type Snowflake,
	time,
	TimestampStyles,
} from "discord.js";
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
import { DisplayUpdateType, EventQueueRole, MemberRemovalReason, RoomScheduling, SubAutoPullMode } from "../types/db.types.ts";
import { ClientUtils } from "./client.utils.ts";
import { DisplayUtils } from "./display.utils.ts";
import {
	CustomError,
	EventRoomCountShrinkWarning,
	LockBeforeOpenWarning,
	OccurrenceInPastWarning,
	QueueAlreadyExistsWarning,
	SequentialEventRequiresRoomLengthWarning,
} from "./error.utils.ts";
import { EventChannelUtils } from "./event-channel.utils.ts";
import { EventSyncLock } from "./event-sync-lock.utils.ts";
import { MemberUtils } from "./member.utils.ts";
import { QueueUtils } from "./queue.utils.ts";
import { WinnerUtils } from "./winner.utils.ts";

export namespace EventUtils {

	// ====================================================================
	//                        In-memory job tracking
	// ====================================================================

	interface OccurrenceJobs {
		open?: Job;
		lock?: Job;
		cleanup?: Job;
		roomPings: Map<bigint, Job>;
		roomPulls: Map<bigint, Job>;
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

	const DEFAULT_ROOM_LENGTH_MS = 60 * 60 * 1000;

	export function getRoomsFinishMs(event: DbEvent, startMs: number): number {
		const perRoomMs = event.roomLengthMs != null
			? Number(event.roomLengthMs)
			: DEFAULT_ROOM_LENGTH_MS;
		const totalRoomsDurationMs = event.roomScheduling === RoomScheduling.Sequential
			? perRoomMs * Number(event.roomCount)
			: perRoomMs;
		return startMs + totalRoomsDurationMs;
	}

	export async function insertEvent(store: Store, newEvent: Omit<NewEvent, "guildId">) {
		validateEventOffsets(
			BigInt(newEvent.createOffsetMs ?? 86_400_000n),
			BigInt(newEvent.lockOffsetMs ?? 0n),
		);

		if (newEvent.roomScheduling === RoomScheduling.Sequential) {
			if (!newEvent.roomLengthMs || BigInt(newEvent.roomLengthMs) <= 0n) {
				throw new SequentialEventRequiresRoomLengthWarning();
			}
		}

		const event = store.insertEvent({ guildId: store.guild.id, ...newEvent });

		const roomCount = Number(event.roomCount);
		for (let i = 1; i <= roomCount; i++) {
			await createEventQueue(store, event, EventQueueRole.Room, i, event.roomQueuesChannelId);
			await createEventQueue(store, event, EventQueueRole.Sub, i, event.subQueuesChannelId);
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
				throw new SequentialEventRequiresRoomLengthWarning();
			}
		}

		if (update.roomCount !== undefined) {
			const oldCount = Number(event.roomCount);
			const newCount = Number(update.roomCount);
			if (newCount < oldCount) {
				throw new EventRoomCountShrinkWarning();
			}
			if (newCount > oldCount) {
				for (let i = oldCount + 1; i <= newCount; i++) {
					await createEventQueue(store, event, EventQueueRole.Room, i, event.roomQueuesChannelId);
					await createEventQueue(store, event, EventQueueRole.Sub, i, event.subQueuesChannelId);
				}
			}
		}

		const updatedEvent = store.updateEvent({ id: event.id, ...update });

		// Re-arm pending occurrences if timing-related fields changed
		const timingChanged = update.createOffsetMs !== undefined
			|| update.lockOffsetMs !== undefined
			|| update.cleanupOffsetMs !== undefined
			|| update.roomScheduling !== undefined
			|| update.roomLengthMs !== undefined
			|| update.roomCount !== undefined
			|| update.autoPullSubsAtRoomStartToggle !== undefined
			|| update.shuffleSubsBeforeAutoPullToggle !== undefined
			|| update.subAutoPullMode !== undefined;

		if (timingChanged) {
			await rearmAllOccurrences(store, updatedEvent);
		}

		const channelsChanged = update.roomCategoryId !== undefined
			|| update.roomCount !== undefined;

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
		EventChannelUtils.untrackAllEventChannels(store, event);
		await EventChannelUtils.deleteAutoCreatedRoles(store, event);

		const eventQueues = Queries.selectManyEventQueues({ guildId: store.guild.id, eventId: event.id });
		for (const eq of eventQueues) {
			await QueueUtils.deleteQueue(store, eq.queueId);
		}

		const occurrences = Queries.selectManyOccurrences({ guildId: store.guild.id, eventId: event.id });
		for (const occ of occurrences) {
			await deleteDiscordScheduledEvent(store, occ);
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

	// Columns on EVENT_DEFAULT_TABLE that mirror queue-config columns on QUEUE_TABLE.
	// Anything not in this set is junction/identity metadata that must not be applied to a queue.
	const EVENT_DEFAULT_NON_QUEUE_KEYS = new Set(["id", "guildId", "eventId", "queueRole"]);

	export async function syncEventQueues(store: Store, event: DbEvent) {
		return EventSyncLock.withLock(store.guild.id, event.id, async () => {
			let recreatedCount = 0;
			let reappliedRoomCount = 0;
			let reappliedSubCount = 0;

			const roomCount = Number(event.roomCount);
			const roles: EventQueueRole[] = [EventQueueRole.Room, EventQueueRole.Sub];

			// Lock every existing event queue up-front so the sync runs from a known-locked baseline.
			// Step A's new queues lock themselves via insertEventQueueRowWithoutDisplay; Step E unlocks
			// any whose pre-start window contains now. Direct store.updateQueue (not QueueUtils.updateQueues)
			// — its requestDisplaysUpdate is fire-and-forget and would race Step C. No display refresh
			// needed: Step C reposts every display.
			{
				const existingEqs = Queries.selectManyEventQueues({ guildId: store.guild.id, eventId: event.id });
				const existingQueues = compact(existingEqs.map(eq =>
					Queries.selectQueue({ guildId: store.guild.id, id: eq.queueId })
				));
				for (const q of existingQueues) {
					store.updateQueue({ id: q.id, lockToggle: true });
				}
			}

			// Step A — recreate any missing (role, queueIndex) slots. Skip display creation here;
			// Step C is the sole writer of displays so its sequential post order isn't racing
			// against fire-and-forget updates from DisplayUtils.insertDisplays.
			for (const role of roles) {
				for (let i = 1; i <= roomCount; i++) {
					const eqs = Queries.selectManyEventQueues({ guildId: store.guild.id, eventId: event.id });
					const match = eqs.find(eq => eq.queueRole === role && Number(eq.queueIndex) === i);
					const existingQueue = match
						? Queries.selectQueue({ guildId: store.guild.id, id: match.queueId })
						: undefined;
					if (!match || !existingQueue) {
						await insertEventQueueRowWithoutDisplay(store, event, role, i);
						recreatedCount++;
					}
				}
			}

			// Step B — reset queue-config columns to schema defaults, then overlay the stored event defaults.
			// Direct store.updateQueue writes (not QueueUtils.updateQueues) so we don't fire an async
			// requestDisplaysUpdate that would race with Step C and leave orphan messages in the channel.
			// `lockToggle` is intentionally excluded — it's owned by the up-front lock above and Step E below.
			const LOCK_KEY = "lockToggle";
			const defaultColumnKeys = Object.keys(EVENT_DEFAULT_TABLE)
				.filter(k => !EVENT_DEFAULT_NON_QUEUE_KEYS.has(k) && k !== LOCK_KEY);

			for (const role of roles) {
				const resetPatch: Record<string, unknown> = {};
				for (const key of defaultColumnKeys) {
					resetPatch[key] = (QUEUE_TABLE as any)[key]?.default ?? null;
				}

				const storedDefault = Queries.selectEventDefault({
					guildId: store.guild.id,
					eventId: event.id,
					queueRole: role,
				});
				const overlay = storedDefault ? omitBy(storedDefault, isNil) : {};
				delete overlay.id;
				delete overlay.guildId;
				delete overlay.eventId;
				delete overlay.queueRole;
				delete overlay[LOCK_KEY];

				const update = { ...resetPatch, ...overlay } as Partial<DbQueue>;

				const eventQueues = Queries.selectManyEventQueues({ guildId: store.guild.id, eventId: event.id })
					.filter(eq => eq.queueRole === role);
				const queues = compact(eventQueues.map(eq =>
					Queries.selectQueue({ guildId: store.guild.id, id: eq.queueId })
				));

				if (queues.length > 0) {
					const updatedQueues = compact(queues.map(q => store.updateQueue({ id: q.id, ...update })));
					if (update.roleInQueueId) {
						await QueueUtils.setRoleInQueue(store, updatedQueues);
					}
					if (role === EventQueueRole.Room) {
						reappliedRoomCount = updatedQueues.length;
					}
					else {
						reappliedSubCount = updatedQueues.length;
					}
				}
			}

			// Step C — re-show every queue display in queue-index order in the event's display channels.
			const reshownCount = await reshowEventQueueDisplays(store, event);

			// Step D — reconcile channels + auto-created room roles
			if (event.roomCategoryId) {
				await EventChannelUtils.reconcileRoomChannels(store, event);
			}

			// Step E — unlock any event queues whose role-appropriate pre-start window contains now.
			{
				const allEqs = Queries.selectManyEventQueues({ guildId: store.guild.id, eventId: event.id });
				const toUnlock: DbQueue[] = [];
				for (const eq of allEqs) {
					const q = Queries.selectQueue({ guildId: store.guild.id, id: eq.queueId });
					if (!q) continue;
					if (shouldEventQueueBeUnlocked(event, eq.queueRole as EventQueueRole)) {
						toUnlock.push(q);
					}
				}
				if (toUnlock.length > 0) {
					await QueueUtils.updateQueues(store, toUnlock, { lockToggle: false } as Partial<DbQueue>);
				}
			}

			return { recreatedCount, reappliedRoomCount, reappliedSubCount, reshownCount };
		});
	}

	export async function scheduleOccurrence(
		store: Store,
		event: DbEvent,
		startTime: bigint,
		timezone?: string,
	) {
		const cleanupAt = getRoomsFinishMs(event, Number(startTime)) + Number(event.cleanupOffsetMs);
		if (cleanupAt < Date.now()) {
			throw new OccurrenceInPastWarning();
		}

		if (event.roomScheduling === RoomScheduling.Sequential) {
			if (!event.roomLengthMs || BigInt(event.roomLengthMs) <= 0n) {
				throw new SequentialEventRequiresRoomLengthWarning();
			}
		}

		const occurrence = store.insertOccurrence({
			guildId: store.guild.id,
			eventId: event.id,
			startTime,
			timezone,
		});

		await armOccurrence(event, occurrence);

		if (event.createDiscordEvent) {
			await createDiscordScheduledEvent(store, event, occurrence);
		}

		return occurrence;
	}

	export async function cancelOccurrence(store: Store, occurrence: DbEventOccurrence) {
		await deleteDiscordScheduledEvent(store, occurrence);
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

	// True iff any of the event's occurrences has a window (role-dependent) that contains `nowMs`.
	// Room window: [start − createOffsetMs, start + lockOffsetMs). Sub window extends to cleanup.
	// When autoPullSubsAtRoomStartToggle is on, the room lock fires at exact start (lockOffsetMs is ignored).
	// Empty occurrence list → false (covers `/events add` before any occurrence is scheduled).
	function shouldEventQueueBeUnlocked(
		event: DbEvent,
		role: EventQueueRole,
		nowMs: number = Date.now(),
	): boolean {
		const occurrences = Queries.selectManyOccurrences({ guildId: event.guildId, eventId: event.id });
		return occurrences.some((occ) => {
			const start = Number(occ.startTime);
			const openAt = start - Number(event.createOffsetMs);
			const closeAt = role === EventQueueRole.Room
				? (event.autoPullSubsAtRoomStartToggle ? start : start + Number(event.lockOffsetMs))
				: getRoomsFinishMs(event, start) + Number(event.cleanupOffsetMs);
			return nowMs >= openAt && nowMs < closeAt;
		});
	}

	function computeRoomPingAt(event: DbEvent, startMs: number, queueIndex: bigint): number {
		if (event.roomScheduling === RoomScheduling.Sequential && event.roomLengthMs) {
			return startMs + (Number(queueIndex) - 1) * Number(event.roomLengthMs);
		}
		return startMs;
	}

	async function armOccurrence(event: DbEvent, occurrence: DbEventOccurrence) {
		unregisterJobs(occurrence.id);

		const now = Date.now();
		const startMs = Number(occurrence.startTime);
		const openAt = startMs - Number(event.createOffsetMs);
		// When autoPullSubsAtRoomStartToggle is on, the room queue must lock at exact startTime so the
		// per-room auto-pull (which locks the paired sub queue) sees a consistent snapshot. lockOffsetMs
		// is preserved on the schema for the legacy path but ignored here.
		const lockAt = event.autoPullSubsAtRoomStartToggle
			? startMs
			: startMs + Number(event.lockOffsetMs);
		const cleanupAt = getRoomsFinishMs(event, startMs) + Number(event.cleanupOffsetMs);

		const guild = await ClientUtils.getGuild(occurrence.guildId);
		if (!guild) return;
		const store = new Store(guild);

		const pingedQueueIds = new Set(
			Queries.selectOccurrenceRoomPings({ occurrenceId: occurrence.id }).map(r => r.eventQueueId)
		);
		const pulledRoomIds = new Set(
			Queries.selectOccurrenceRoomPulls({ occurrenceId: occurrence.id }).map(r => r.eventQueueId)
		);

		const jobs: OccurrenceJobs = { roomPings: new Map(), roomPulls: new Map() };

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

		// Room pings (and optional room-start auto-pulls)
		const roomEventQueues = Queries.selectManyEventQueues({ guildId: event.guildId, eventId: event.id })
			.filter(eq => eq.queueRole === EventQueueRole.Room);

		for (const eq of roomEventQueues) {
			const pingAt = computeRoomPingAt(event, startMs, eq.queueIndex);

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

		if (event.autoPullSubsAtRoomStartToggle) {
			for (const eq of roomEventQueues) {
				const pullAt = computeRoomPingAt(event, startMs, eq.queueIndex);

				const pullJob = await armPhase(
					pullAt,
					now,
					pulledRoomIds.has(eq.id),
					() => runRoomPullAction(occurrence.id, eq),
					() => store.insertOccurrenceRoomPull({
						occurrenceId: occurrence.id,
						eventQueueId: eq.id,
						handledAt: BigInt(Date.now()),
					}),
					"room pull",
				);
				if (pullJob) jobs.roomPulls.set(eq.id, pullJob);
			}
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
		jobs.roomPulls.forEach(job => job.cancel());
		occurrenceIdToJobs.delete(occurrenceId);
	}

	async function rearmAllOccurrences(store: Store, event: DbEvent) {
		const occurrences = Queries.selectManyOccurrences({ guildId: store.guild.id, eventId: event.id });
		for (const occ of occurrences) {
			await armOccurrence(event, occ);
			await updateDiscordScheduledEvent(store, event, occ);
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

	// Sequentially re-shows every event-queue display in queue-index order across the event's Room
	// and Sub display channels: deletes each existing display (and its posted Discord message) then
	// inserts a fresh row and awaits a Replace refresh. Awaiting per queue guarantees the new
	// messages have landed before the caller continues (used by `syncEventQueues` Step C and
	// `runOpenAction` so a same-channel announcement stays as the most-recent message).
	async function reshowEventQueueDisplays(store: Store, event: DbEvent): Promise<number> {
		let reshownCount = 0;
		const roles: EventQueueRole[] = [EventQueueRole.Room, EventQueueRole.Sub];

		for (const role of roles) {
			const displayChannelId = role === EventQueueRole.Room
				? event.roomQueuesChannelId
				: event.subQueuesChannelId;
			const orderedEqs = Queries.selectManyEventQueues({ guildId: store.guild.id, eventId: event.id })
				.filter(eq => eq.queueRole === role)
				.sort((a, b) => Number(a.queueIndex) - Number(b.queueIndex));

			for (const eq of orderedEqs) {
				const queue = Queries.selectQueue({ guildId: store.guild.id, id: eq.queueId });
				if (!queue) continue;

				const existingDisplays = [...store.dbDisplays().filter(d => d.queueId === queue.id).values()];
				for (const display of existingDisplays) {
					if (display.lastMessageId) {
						const channel = await store.jsChannel(display.displayChannelId) as GuildTextBasedChannel | undefined;
						if (channel) {
							const message = await channel.messages.fetch(display.lastMessageId).catch(e => {
								console.error(`EventUtils.reshowEventQueueDisplays: failed to fetch stale display message ${display.lastMessageId} in channel ${display.displayChannelId}:`, e);
								return null;
							});
							if (message) {
								await message.delete().catch(e => {
									console.error(`EventUtils.reshowEventQueueDisplays: failed to delete stale display message ${display.lastMessageId} in channel ${display.displayChannelId}:`, e);
									return null;
								});
							}
						}
					}
					store.deleteDisplay({ id: display.id });
				}

				const newDisplay = store.insertDisplay({
					guildId: store.guild.id,
					queueId: queue.id,
					displayChannelId,
				});
				if (!newDisplay) continue;

				await DisplayUtils.updateDisplays({
					store,
					queueId: queue.id,
					opts: {
						displayIds: [newDisplay.id],
						updateTypeOverride: DisplayUpdateType.Replace,
					},
				});

				reshownCount++;
			}
		}

		return reshownCount;
	}

	async function runOpenAction(occurrenceId: bigint) {
		const ctx = await getEventContext(occurrenceId);
		if (!ctx) return;
		const { occurrence, event, store, queues } = ctx;

		// Revoke the previous occurrence's winner roles — the badge lasts only until the next opens.
		await WinnerUtils.revokeEventWinners(store, event);

		// Unlock all event queues
		if (queues.length > 0) {
			await QueueUtils.updateQueues(store, queues, { lockToggle: false } as Partial<DbQueue>);
		}

		// Re-show every event-queue display sequentially before announcing so the announcement
		// remains the most-recent message when announcementChannelId coincides with a display channel.
		await reshowEventQueueDisplays(store, event);

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

		const pingChannelId = eventQueue.pingChannelId ?? event.roomQueuesChannelId;

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

	async function runRoomPullAction(occurrenceId: bigint, roomEventQueue: DbEventQueue) {
		const ctx = await getEventContext(occurrenceId);
		if (!ctx) return;
		const { event, store, eventQueues } = ctx;

		const subEventQueue = eventQueues.find(eq =>
			eq.queueRole === EventQueueRole.Sub && eq.queueIndex === roomEventQueue.queueIndex
		);
		if (!subEventQueue) {
			console.warn(`EventUtils.runRoomPullAction: no paired sub event-queue for room index ${roomEventQueue.queueIndex} of event ${event.id} — skipping`);
			return;
		}

		const roomQueue = Queries.selectQueue({ guildId: store.guild.id, id: roomEventQueue.queueId });
		const subQueue = Queries.selectQueue({ guildId: store.guild.id, id: subEventQueue.queueId });
		if (!roomQueue || !subQueue) {
			console.warn(`EventUtils.runRoomPullAction: missing queue rows for event ${event.id} room index ${roomEventQueue.queueIndex} — skipping`);
			return;
		}

		// Always lock the paired sub queue first — auto-pull bundles sub-lock atomically.
		await QueueUtils.updateQueues(store, [subQueue], { lockToggle: true } as Partial<DbQueue>);

		if (event.shuffleSubsBeforeAutoPullToggle) {
			await MemberUtils.shuffleMembers(store, subQueue, undefined);
		}

		const currentRoomCount = Queries.selectManyMembers({ guildId: store.guild.id, queueId: roomQueue.id }).length;
		const subAvailable = Queries.selectManyMembers({ guildId: store.guild.id, queueId: subQueue.id }).length;
		const count = roomQueue.size == null
			? subAvailable
			: Math.min(Number(roomQueue.size) - currentRoomCount, subAvailable);

		if (count <= 0) {
			console.log(`EventUtils.runRoomPullAction: nothing to pull for event ${event.id} room index ${roomEventQueue.queueIndex} (currentRoomCount=${currentRoomCount}, subAvailable=${subAvailable}, size=${roomQueue.size}) — skipping pull`);
			return;
		}

		if (event.subAutoPullMode === SubAutoPullMode.Promote) {
			const subMembers = Queries.selectManyMembers({
				guildId: store.guild.id,
				queueId: subQueue.id,
				count,
			});
			for (const subMember of subMembers) {
				const jsMember = await store.jsMember(subMember.userId);
				if (!jsMember) continue;

				// Delete from sub queue directly via store (skips MemberUtils.deleteMembers messaging,
				// DM-on-pull, voice destination, and role-on-pull side effects — we promote silently).
				store.deleteMember({ id: subMember.id }, MemberRemovalReason.Pulled);

				if (subQueue.roleInQueueId) {
					await MemberUtils.modifyMemberRoles(store, subMember.userId, subQueue.roleInQueueId, "remove")
						.catch(e => console.error(`EventUtils.runRoomPullAction: failed to remove sub roleInQueueId from user ${subMember.userId}:`, e));
				}

				try {
					// force:true bypasses verifyMemberEligibility so the room queue's lockToggle=true
					// (set by runLockAction) does not block this system insert.
					await MemberUtils.insertMember({
						store,
						queue: roomQueue,
						jsMember,
						message: subMember.message ?? undefined,
						force: true,
					});
				}
				catch (e) {
					console.error(`EventUtils.runRoomPullAction: failed to promote user ${subMember.userId} into room queue ${roomQueue.id}:`, e);
				}
			}
			await DisplayUtils.requestDisplayUpdate({ store, queueId: subQueue.id });
			await DisplayUtils.requestDisplayUpdate({ store, queueId: roomQueue.id });
		}
		else {
			await MemberUtils.deleteMembers({
				store,
				queues: [subQueue],
				reason: MemberRemovalReason.Pulled,
				by: { count },
				force: true,
			});
			await DisplayUtils.requestDisplayUpdate({ store, queueId: roomQueue.id });
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
			room_queues_channel: channelMention(event.roomQueuesChannelId),
			sub_queues_channel: channelMention(event.subQueuesChannelId),
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
		const pingChId = eventQueue.pingChannelId ?? event.roomQueuesChannelId;
		return {
			event_name: event.name,
			room_name: queue.name,
			room_role: roleStr,
			room_index: String(eventQueue.queueIndex),
			room_queues_channel: channelMention(event.roomQueuesChannelId),
			ping_channel: channelMention(pingChId),
			start_time: time(startDate, TimestampStyles.LongDateTime),
			start_time_relative: time(startDate, TimestampStyles.RelativeTime),
		};
	}

	// ====================================================================
	//                        Discord scheduled events
	// ====================================================================

	const DISCORD_EVENT_NAME_LIMIT = 100;
	const DISCORD_EVENT_DESCRIPTION_LIMIT = 1000;
	const DISCORD_EVENT_LOCATION_LIMIT = 100;
	const DISCORD_UNKNOWN_GUILD_SCHEDULED_EVENT = 10070;

	function resolveRoomChannelName(store: Store, event: DbEvent): string {
		const cached = store.guild.channels.cache.get(event.roomQueuesChannelId);
		return cached?.name ?? event.roomQueuesChannelId;
	}

	function renderDiscordEventDescription(event: DbEvent, occurrence: DbEventOccurrence): string {
		if (event.discordEventDescription) {
			return renderTemplate(event.discordEventDescription, buildAnnouncementContext(event, occurrence));
		}
		const scheduling = (event.roomScheduling as RoomScheduling) === RoomScheduling.Sequential
			? "sequential"
			: "parallel";
		return [
			`Room queues channel: ${channelMention(event.roomQueuesChannelId)}`,
			`Sub queues channel: ${channelMention(event.subQueuesChannelId)}`,
			`Rooms: ${event.roomCount} (${scheduling})`,
		].join("\n");
	}

	function buildDiscordEventOptions(
		event: DbEvent,
		occurrence: DbEventOccurrence,
		roomChannelName: string,
	): GuildScheduledEventCreateOptions {
		const startMs = Number(occurrence.startTime);
		const endMs = getRoomsFinishMs(event, startMs) + Number(event.cleanupOffsetMs);
		return {
			name: event.name.substring(0, DISCORD_EVENT_NAME_LIMIT),
			scheduledStartTime: new Date(startMs),
			scheduledEndTime: new Date(endMs),
			privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
			entityType: GuildScheduledEventEntityType.External,
			description: renderDiscordEventDescription(event, occurrence).substring(0, DISCORD_EVENT_DESCRIPTION_LIMIT),
			entityMetadata: {
				location: roomChannelName.substring(0, DISCORD_EVENT_LOCATION_LIMIT),
			},
		};
	}

	function isUnknownDiscordEventError(e: unknown): boolean {
		const err = e as DiscordAPIError;
		return err?.code === DISCORD_UNKNOWN_GUILD_SCHEDULED_EVENT || err?.status === 404;
	}

	async function createDiscordScheduledEvent(store: Store, event: DbEvent, occurrence: DbEventOccurrence) {
		if (Number(occurrence.startTime) <= Date.now()) {
			// Discord rejects external events whose start time is not in the future
			return;
		}
		try {
			const options = buildDiscordEventOptions(event, occurrence, resolveRoomChannelName(store, event));
			const created = await store.guild.scheduledEvents.create(options);
			store.updateOccurrence({ id: occurrence.id }, { discordEventId: created.id });
		}
		catch (e) {
			console.error(`Failed to create Discord scheduled event for occurrence ${occurrence.id}:`, e);
		}
	}

	async function updateDiscordScheduledEvent(store: Store, event: DbEvent, occurrence: DbEventOccurrence) {
		if (!occurrence.discordEventId) return;
		try {
			const options = buildDiscordEventOptions(event, occurrence, resolveRoomChannelName(store, event));
			await store.guild.scheduledEvents.edit(occurrence.discordEventId, options);
		}
		catch (e) {
			if (isUnknownDiscordEventError(e)) return;
			console.error(`Failed to update Discord scheduled event for occurrence ${occurrence.id}:`, e);
		}
	}

	async function deleteDiscordScheduledEvent(store: Store, occurrence: DbEventOccurrence) {
		if (!occurrence.discordEventId) return;
		try {
			await store.guild.scheduledEvents.delete(occurrence.discordEventId);
		}
		catch (e) {
			if (isUnknownDiscordEventError(e)) return;
			console.error(`Failed to delete Discord scheduled event for occurrence ${occurrence.id}:`, e);
		}
	}

	// ====================================================================
	//                        Helpers
	// ====================================================================

	function validateEventOffsets(createOffsetMs: bigint, lockOffsetMs: bigint) {
		// lockAt = startTime + lockOffsetMs
		// openAt = startTime - createOffsetMs
		// lockAt must be >= openAt => lockOffsetMs >= -createOffsetMs
		if (lockOffsetMs < -createOffsetMs) {
			throw new LockBeforeOpenWarning();
		}
	}

	async function insertEventQueueRowWithoutDisplay(
		store: Store,
		event: DbEvent,
		role: EventQueueRole,
		index: number,
	) {
		const roleLabel = role === EventQueueRole.Room ? "Room" : "Sub";
		let queueName = `${event.name} ${roleLabel} ${index}`;

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
		// Event queues are gated by their pre-start window — the schema default / event-default
		// overlay must not be used to leave a queue unlocked outside that window.
		queueConfig.lockToggle = !shouldEventQueueBeUnlocked(event, role);

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
			if (e instanceof QueueAlreadyExistsWarning) {
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

		store.insertEventQueue({
			guildId: store.guild.id,
			eventId: event.id,
			queueId: insertedQueue.id,
			queueRole: role,
			queueIndex: BigInt(index),
		});

		return insertedQueue;
	}

	export async function createEventQueue(
		store: Store,
		event: DbEvent,
		role: EventQueueRole,
		index: number,
		displayChannelId: Snowflake,
	) {
		const insertedQueue = await insertEventQueueRowWithoutDisplay(store, event, role, index);
		await DisplayUtils.insertDisplays(store, [insertedQueue], displayChannelId);
		return insertedQueue;
	}
}
