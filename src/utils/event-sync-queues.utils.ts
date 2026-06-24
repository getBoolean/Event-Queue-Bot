import type { GuildTextBasedChannel, Snowflake } from "discord.js";
import { compact, isNil, omitBy } from "lodash-es";

import { db } from "../db/db.ts";
import { Queries } from "../db/queries.ts";
import {
	type DbEvent,
	type DbQueue,
	QUEUE_CONFIG_COLUMN_KEYS,
	QUEUE_TABLE,
} from "../db/schema.ts";
import { Store } from "../db/store.ts";
import { DisplayUpdateType, EventQueueRole } from "../types/db.types.ts";
import { DisplayUtils } from "./display.utils.ts";
import { QueueAlreadyExistsWarning } from "./error.utils.ts";
import { EventChannelUtils } from "./event-channel.utils.ts";
import * as EventCore from "./event-core.utils.ts";
import { EventSyncLock } from "./event-sync-lock.utils.ts";
import { QueueUtils } from "./queue.utils.ts";

// Mirrored queue-config keys live in QUEUE_CONFIG_COLUMN_KEYS (schema.ts).
const SYNC_QUEUE_CONFIG_KEYS = QUEUE_CONFIG_COLUMN_KEYS.filter(k => k !== "lockToggle");

export function insertEventQueueRowWithoutDisplayDb(
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
	queueConfig.lockToggle = !EventCore.shouldEventQueueBeUnlocked(event, role);

	let insertedQueue: DbQueue;
	try {
		insertedQueue = store.insertQueue({
			guildId: store.guild.id,
			name: queueName,
			...queueConfig,
		});
	}
	catch (e) {
		if (e instanceof QueueAlreadyExistsWarning) {
			queueName = `${queueName} (event)`;
			insertedQueue = store.insertQueue({
				guildId: store.guild.id,
				name: queueName,
				...queueConfig,
			});
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

export async function insertEventQueueRowWithoutDisplay(
	store: Store,
	event: DbEvent,
	role: EventQueueRole,
	index: number,
) {
	return db.transaction(() =>
		insertEventQueueRowWithoutDisplayDb(store, event, role, index)
	);
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

// Sequentially re-shows every event-queue display in queue-index order across the event's Room
// and Sub display channels: deletes each existing display (and its posted Discord message) then
// inserts a fresh row and awaits a Replace refresh. Awaiting per queue guarantees the new
// messages have landed before the caller continues (used by `syncEventQueues` Step C and
// `runOpenAction` so a same-channel announcement stays as the most-recent message).
export async function reshowEventQueueDisplays(store: Store, event: DbEvent): Promise<number> {
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

export async function syncEventQueues(store: Store, event: DbEvent) {
	return EventSyncLock.withLock(store.guild.id, event.id, async () => {
		let recreatedCount = 0;
		let reappliedRoomCount = 0;
		let reappliedSubCount = 0;
		const roleInQueueUpdates: DbQueue[] = [];

		const roomCount = Number(event.roomCount);
		const roles: EventQueueRole[] = [EventQueueRole.Room, EventQueueRole.Sub];

		db.transaction(() => {
			// Lock every existing event queue up-front so the sync runs from a known-locked baseline.
			// Step A's new queues lock themselves via insertEventQueueRowWithoutDisplayDb; Step E unlocks
			// any whose pre-start window contains now. Direct store.updateQueue (not QueueUtils.updateQueues)
			// — its requestDisplaysUpdate is fire-and-forget and would race Step C. No display refresh
			// needed: Step C reposts every display.
			{
				const existingEqs = Queries.selectManyEventQueues({ guildId: store.guild.id, eventId: event.id });
				const existingQueuesById = new Map(
					Queries.selectManyQueuesByIds({
						guildId: store.guild.id,
						ids: existingEqs.map(eq => eq.queueId),
					}).map(queue => [queue.id, queue]),
				);
				for (const eq of existingEqs) {
					const q = existingQueuesById.get(eq.queueId);
					if (!q) continue;
					store.updateQueue({ id: q.id, lockToggle: true });
				}
			}

			let allEventQueues = Queries.selectManyEventQueues({ guildId: store.guild.id, eventId: event.id });
			let allQueuesById = new Map(
				Queries.selectManyQueuesByIds({
					guildId: store.guild.id,
					ids: allEventQueues.map(eq => eq.queueId),
				}).map(queue => [queue.id, queue]),
			);

			// Step A — recreate any missing (role, queueIndex) slots. Skip display creation here;
			// Step C is the sole writer of displays so its sequential post order isn't racing
			// against fire-and-forget updates from DisplayUtils.insertDisplays.
			for (const role of roles) {
				for (let i = 1; i <= roomCount; i++) {
					const match = allEventQueues.find(eq => eq.queueRole === role && Number(eq.queueIndex) === i);
					const existingQueue = match ? allQueuesById.get(match.queueId) : undefined;
					if (!match || !existingQueue) {
						insertEventQueueRowWithoutDisplayDb(store, event, role, i);
						recreatedCount++;
					}
				}
			}

			if (recreatedCount > 0) {
				allEventQueues = Queries.selectManyEventQueues({ guildId: store.guild.id, eventId: event.id });
				allQueuesById = new Map(
					Queries.selectManyQueuesByIds({
						guildId: store.guild.id,
						ids: allEventQueues.map(eq => eq.queueId),
					}).map(queue => [queue.id, queue]),
				);
			}

			// Step B — reset queue-config columns to schema defaults, then overlay the stored event defaults.
			// Direct store.updateQueue writes (not QueueUtils.updateQueues) so we don't fire an async
			// requestDisplaysUpdate that would race with Step C and leave orphan messages in the channel.
			// `lockToggle` is intentionally excluded — it's owned by the up-front lock above and Step E below.
			for (const role of roles) {
				const resetPatch: Record<string, unknown> = {};
				for (const key of SYNC_QUEUE_CONFIG_KEYS) {
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
				delete overlay.lockToggle;

				const update = { ...resetPatch, ...overlay } as Partial<DbQueue>;

				const eventQueues = allEventQueues.filter(eq => eq.queueRole === role);
				const queues = compact(eventQueues.map(eq => allQueuesById.get(eq.queueId)));

				if (queues.length > 0) {
					const updatedQueues = compact(queues.map(q => store.updateQueue({ id: q.id, ...update })));
					if (update.roleInQueueId) {
						roleInQueueUpdates.push(...updatedQueues);
					}
					if (role === EventQueueRole.Room) {
						reappliedRoomCount = updatedQueues.length;
					}
					else {
						reappliedSubCount = updatedQueues.length;
					}
				}
			}
		});

		if (roleInQueueUpdates.length > 0) {
			await QueueUtils.setRoleInQueue(store, roleInQueueUpdates);
		}

		const allEventQueues = Queries.selectManyEventQueues({ guildId: store.guild.id, eventId: event.id });
		const allQueuesById = new Map(
			Queries.selectManyQueuesByIds({
				guildId: store.guild.id,
				ids: allEventQueues.map(eq => eq.queueId),
			}).map(queue => [queue.id, queue]),
		);

		// Step C — re-show every queue display in queue-index order in the event's display channels.
		const reshownCount = await reshowEventQueueDisplays(store, event);

		// Step D — reconcile channels + auto-created room roles
		if (event.roomCategoryId) {
			await EventChannelUtils.reconcileRoomChannels(store, event);
		}

		// Step E — unlock any event queues whose role-appropriate pre-start window contains now.
		{
			const toUnlock: DbQueue[] = [];
			for (const eq of allEventQueues) {
				const q = allQueuesById.get(eq.queueId);
				if (!q) continue;
				if (EventCore.shouldEventQueueBeUnlocked(event, eq.queueRole as EventQueueRole)) {
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
