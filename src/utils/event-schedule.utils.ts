import nodeSchedule, { type Job } from "node-schedule";

import { Queries } from "../db/queries.ts";
import type { DbEvent, DbEventOccurrence, DbEventQueue } from "../db/schema.ts";
import { Store } from "../db/store.ts";
import { EventQueueRole, RoomScheduling } from "../types/db.types.ts";
import { ClientUtils } from "./client.utils.ts";
import {
	OccurrenceInPastWarning,
	SequentialEventRequiresRoomLengthWarning,
} from "./error.utils.ts";
import * as EventCore from "./event-core.utils.ts";
import { occurrenceIdToJobs, type OccurrenceJobs, unregisterJobs } from "./event-jobs.registry.ts";
import {
	createDiscordScheduledEvent,
	deleteDiscordScheduledEvent,
	runCleanupAction,
	runLockAction,
	runOpenAction,
	runRoomPingAction,
	runRoomPullAction,
	updateDiscordScheduledEvent,
} from "./event-lifecycle.utils.ts";

const PHASE_RETRY_BACKOFF_MS = [5_000, 30_000, 120_000];

export type ArmOccurrenceContext = {
	pingedQueueIdsByOccurrence?: Map<bigint, Set<bigint>>
	pulledQueueIdsByOccurrence?: Map<bigint, Set<bigint>>
	roomEventQueuesByEvent?: Map<bigint, DbEventQueue[]>
};

async function runPhaseWithRetry(label: string, run: () => Promise<void>, markDone: () => void) {
	for (let attempt = 0; attempt <= PHASE_RETRY_BACKOFF_MS.length; attempt++) {
		try {
			await run();
			markDone();
			return;
		}
		catch (e) {
			if (attempt === PHASE_RETRY_BACKOFF_MS.length) {
				console.error(`Event ${label} action failed after retries:`, (e as Error).message);
				return;
			}
			const delay = PHASE_RETRY_BACKOFF_MS[attempt];
			console.error(`Event ${label} action failed (attempt ${attempt + 1}), retrying in ${delay}ms:`, (e as Error).message);
			await new Promise(resolve => setTimeout(resolve, delay));
		}
	}
}

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
		await runPhaseWithRetry(label, run, markDone);
		return;
	}
	return nodeSchedule.scheduleJob(new Date(at), async () => {
		await runPhaseWithRetry(label, run, markDone);
	});
}

function computeRoomPingAt(event: DbEvent, startMs: number, queueIndex: bigint): number {
	if (event.roomScheduling === RoomScheduling.Sequential && event.roomLengthMs) {
		return startMs + (Number(queueIndex) - 1) * Number(event.roomLengthMs);
	}
	return startMs;
}

function groupEventQueueIdsByOccurrence(
	rows: Array<{ occurrenceId: bigint, eventQueueId: bigint }>,
): Map<bigint, Set<bigint>> {
	const map = new Map<bigint, Set<bigint>>();
	for (const row of rows) {
		let set = map.get(row.occurrenceId);
		if (!set) {
			set = new Set();
			map.set(row.occurrenceId, set);
		}
		set.add(row.eventQueueId);
	}
	return map;
}

function roomQueuesForEvent(guildId: string, eventId: bigint): DbEventQueue[] {
	return Queries.selectManyEventQueues({ guildId, eventId })
		.filter(eq => eq.queueRole === EventQueueRole.Room);
}

export function buildArmOccurrenceContext(
	guildId: string,
	occurrences: DbEventOccurrence[],
): ArmOccurrenceContext {
	const occurrenceIds = occurrences.map(o => o.id);
	const pingedQueueIdsByOccurrence = groupEventQueueIdsByOccurrence(
		Queries.selectManyOccurrenceRoomPingsByOccurrenceIds({ guildId, occurrenceIds }),
	);
	const pulledQueueIdsByOccurrence = groupEventQueueIdsByOccurrence(
		Queries.selectManyOccurrenceRoomPullsByOccurrenceIds({ guildId, occurrenceIds }),
	);

	const roomEventQueuesByEvent = new Map<bigint, DbEventQueue[]>();
	for (const eventId of new Set(occurrences.map(o => o.eventId))) {
		roomEventQueuesByEvent.set(eventId, roomQueuesForEvent(guildId, eventId));
	}

	return {
		pingedQueueIdsByOccurrence,
		pulledQueueIdsByOccurrence,
		roomEventQueuesByEvent,
	};
}

export async function armOccurrence(
	event: DbEvent,
	occurrence: DbEventOccurrence,
	ctx?: ArmOccurrenceContext,
) {
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
	const cleanupAt = EventCore.getRoomsFinishMs(event, startMs) + Number(event.cleanupOffsetMs);

	const guild = await ClientUtils.getGuild(occurrence.guildId);
	if (!guild) return;
	const store = new Store(guild);

	const pingedQueueIds = ctx?.pingedQueueIdsByOccurrence?.get(occurrence.id)
		?? new Set(
			Queries.selectOccurrenceRoomPings({ guildId: occurrence.guildId, occurrenceId: occurrence.id })
				.map(r => r.eventQueueId),
		);
	const pulledRoomIds = ctx?.pulledQueueIdsByOccurrence?.get(occurrence.id)
		?? new Set(
			Queries.selectOccurrenceRoomPulls({ guildId: occurrence.guildId, occurrenceId: occurrence.id })
				.map(r => r.eventQueueId),
		);

	const jobs: OccurrenceJobs = { roomPings: new Map(), roomPulls: new Map() };

	// Open action
	jobs.open = await armPhase(
		openAt,
		now,
		occurrence.openHandledAt != null,
		() => runOpenAction(occurrence.guildId, occurrence.id),
		() => store.updateOccurrence({ id: occurrence.id }, { openHandledAt: BigInt(Date.now()) }),
		"open",
	);

	// Lock action
	jobs.lock = await armPhase(
		lockAt,
		now,
		occurrence.lockHandledAt != null,
		() => runLockAction(occurrence.guildId, occurrence.id),
		() => store.updateOccurrence({ id: occurrence.id }, { lockHandledAt: BigInt(Date.now()) }),
		"lock",
	);

	// Room pings (and optional room-start auto-pulls)
	const roomEventQueues = ctx?.roomEventQueuesByEvent?.get(event.id)
		?? roomQueuesForEvent(event.guildId, event.id);

	for (const eq of roomEventQueues) {
		const pingAt = computeRoomPingAt(event, startMs, eq.queueIndex);

		const pingJob = await armPhase(
			pingAt,
			now,
			pingedQueueIds.has(eq.id),
			() => runRoomPingAction(occurrence.guildId, occurrence.id, eq),
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
				() => runRoomPullAction(occurrence.guildId, occurrence.id, eq),
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
		await runPhaseWithRetry("cleanup", () => runCleanupAction(occurrence.guildId, occurrence.id), () => undefined);
	}
	else {
		jobs.cleanup = nodeSchedule.scheduleJob(new Date(cleanupAt), async () => {
			await runPhaseWithRetry("cleanup", () => runCleanupAction(occurrence.guildId, occurrence.id), () => undefined);
		});
	}

	occurrenceIdToJobs.set(occurrence.id, jobs);
}

export async function rearmAllOccurrences(store: Store, event: DbEvent) {
	const occurrences = Queries.selectManyOccurrences({ guildId: store.guild.id, eventId: event.id });
	const ctx = buildArmOccurrenceContext(store.guild.id, occurrences);
	for (const occ of occurrences) {
		await armOccurrence(event, occ, ctx);
		await updateDiscordScheduledEvent(store, event, occ);
	}
}

export async function scheduleOccurrence(
	store: Store,
	event: DbEvent,
	startTime: bigint,
	timezone?: string,
) {
	const cleanupAt = EventCore.getRoomsFinishMs(event, Number(startTime)) + Number(event.cleanupOffsetMs);
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

	const occurrencesByGuild = new Map<string, DbEventOccurrence[]>();
	for (const occurrence of occurrences) {
		const list = occurrencesByGuild.get(occurrence.guildId);
		if (list) {
			list.push(occurrence);
		}
		else {
			occurrencesByGuild.set(occurrence.guildId, [occurrence]);
		}
	}

	for (const [guildId, guildOccurrences] of occurrencesByGuild) {
		const eventIds = [...new Set(guildOccurrences.map(o => o.eventId))];
		const events = Queries.selectManyEventsByIds({ guildId, ids: eventIds });
		const eventsById = new Map(events.map(event => [event.id, event]));
		const ctx = buildArmOccurrenceContext(guildId, guildOccurrences);

		for (const occurrence of guildOccurrences) {
			const event = eventsById.get(occurrence.eventId);
			if (!event) {
				continue;
			}
			await armOccurrence(event, occurrence, ctx);
		}
	}

	console.timeEnd(`Loaded ${occurrences.length} event occurrences`);
}
