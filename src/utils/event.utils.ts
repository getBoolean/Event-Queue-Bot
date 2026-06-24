import type { Snowflake } from "discord.js";
import { SQLiteColumn } from "drizzle-orm/sqlite-core";
import { compact, findKey } from "lodash-es";

import { db } from "../db/db.ts";
import { Queries } from "../db/queries.ts";
import {
	type DbEvent,
	type DbQueue,
	EVENT_DEFAULT_TABLE,
	type NewEvent,
	type NewEventDefault,
	QUEUE_TABLE,
} from "../db/schema.ts";
import { Store } from "../db/store.ts";
import { EventQueueRole, RoomScheduling } from "../types/db.types.ts";
import { DisplayUtils } from "./display.utils.ts";
import {
	CustomError,
	EventRoomCountShrinkWarning,
	SequentialEventRequiresRoomLengthWarning,
} from "./error.utils.ts";
import { EventChannelUtils } from "./event-channel.utils.ts";
import * as EventCore from "./event-core.utils.ts";
import { unregisterJobs } from "./event-jobs.registry.ts";
import { deleteDiscordScheduledEvent } from "./event-lifecycle.utils.ts";
import * as EventSchedule from "./event-schedule.utils.ts";
import * as EventSyncQueues from "./event-sync-queues.utils.ts";
import { QueueUtils } from "./queue.utils.ts";

export namespace EventUtils {

	export function assertHasRoomCategoryForChannelSync(event: DbEvent) {
		if (!event.roomCategoryId) {
			throw new CustomError({
				message: `Event "${event.name}" has no \`room_category\`. Run \`/events set event:${event.name} room_category:…\` first.`,
			});
		}
	}

	/** @deprecated Use assertHasRoomCategoryForChannelSync */
	export const assertHasRoomCategory = assertHasRoomCategoryForChannelSync;

	export const getRoomsFinishMs = EventCore.getRoomsFinishMs;

	export async function insertEvent(store: Store, newEvent: Omit<NewEvent, "guildId">) {
		EventCore.validateEventOffsets(
			BigInt(newEvent.createOffsetMs ?? 86_400_000n),
			BigInt(newEvent.lockOffsetMs ?? 0n),
		);

		if (newEvent.roomScheduling === RoomScheduling.Sequential) {
			if (!newEvent.roomLengthMs || BigInt(newEvent.roomLengthMs) <= 0n) {
				throw new SequentialEventRequiresRoomLengthWarning();
			}
		}

		const displayTargets: { queue: DbQueue, channelId: Snowflake }[] = [];

		const event = db.transaction(() => {
			const insertedEvent = store.insertEvent({ guildId: store.guild.id, ...newEvent });
			const roomCount = Number(insertedEvent.roomCount);
			for (let i = 1; i <= roomCount; i++) {
				const roomQueue = EventSyncQueues.insertEventQueueRowWithoutDisplayDb(store, insertedEvent, EventQueueRole.Room, i);
				displayTargets.push({ queue: roomQueue, channelId: insertedEvent.roomQueuesChannelId });
				const subQueue = EventSyncQueues.insertEventQueueRowWithoutDisplayDb(store, insertedEvent, EventQueueRole.Sub, i);
				displayTargets.push({ queue: subQueue, channelId: insertedEvent.subQueuesChannelId });
			}
			return insertedEvent;
		});

		for (const { queue, channelId } of displayTargets) {
			await DisplayUtils.insertDisplays(store, [queue], channelId);
		}

		if (event.roomCategoryId) {
			await EventChannelUtils.reconcileRoomChannels(store, event);
		}

		return event;
	}

	export async function updateEvent(store: Store, event: DbEvent, update: Partial<DbEvent>) {
		const newCreateOffset = BigInt(update.createOffsetMs ?? event.createOffsetMs);
		const newLockOffset = BigInt(update.lockOffsetMs ?? event.lockOffsetMs);
		EventCore.validateEventOffsets(newCreateOffset, newLockOffset);

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
					await EventSyncQueues.createEventQueue(store, event, EventQueueRole.Room, i, event.roomQueuesChannelId);
					await EventSyncQueues.createEventQueue(store, event, EventQueueRole.Sub, i, event.subQueuesChannelId);
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
			await EventSchedule.rearmAllOccurrences(store, updatedEvent);
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
			await QueueUtils.deleteQueueDisplayMessages(store, eq.queueId);
		}

		const occurrences = Queries.selectManyOccurrences({ guildId: store.guild.id, eventId: event.id });
		for (const occ of occurrences) {
			await deleteDiscordScheduledEvent(store, occ);
			unregisterJobs(occ.id);
		}

		// Discord cleanup above; atomic DB delete of queues then event row.
		db.transaction(() => {
			for (const eq of eventQueues) {
				store.deleteQueue({ id: eq.queueId });
			}
			store.deleteEvent({ id: event.id });
		});
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

	export const syncEventQueues = EventSyncQueues.syncEventQueues;
	export const createEventQueue = EventSyncQueues.createEventQueue;
	export const scheduleOccurrence = EventSchedule.scheduleOccurrence;
	export const cancelOccurrence = EventSchedule.cancelOccurrence;
	export const loadOccurrences = EventSchedule.loadOccurrences;
}
