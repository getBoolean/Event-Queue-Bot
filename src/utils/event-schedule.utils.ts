import nodeSchedule, { type Job } from "node-schedule";

import { Queries } from "../db/queries.ts";
import type { DbEvent, DbEventOccurrence } from "../db/schema.ts";
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

export async function armOccurrence(event: DbEvent, occurrence: DbEventOccurrence) {
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

	const pingedQueueIds = new Set(
		Queries.selectOccurrenceRoomPings({ guildId: occurrence.guildId, occurrenceId: occurrence.id }).map(r => r.eventQueueId)
	);
	const pulledRoomIds = new Set(
		Queries.selectOccurrenceRoomPulls({ guildId: occurrence.guildId, occurrenceId: occurrence.id }).map(r => r.eventQueueId)
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
	const roomEventQueues = Queries.selectManyEventQueues({ guildId: event.guildId, eventId: event.id })
		.filter(eq => eq.queueRole === EventQueueRole.Room);

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
	for (const occ of occurrences) {
		await armOccurrence(event, occ);
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

	const eventsByGuild = new Map<string, Map<bigint, DbEvent>>();
	for (const occurrence of occurrences) {
		let guildEvents = eventsByGuild.get(occurrence.guildId);
		if (!guildEvents) {
			const eventIds = [...new Set(
				occurrences.filter(o => o.guildId === occurrence.guildId).map(o => o.eventId),
			)];
			const events = Queries.selectManyEventsByIds({
				guildId: occurrence.guildId,
				ids: eventIds,
			});
			guildEvents = new Map(events.map(event => [event.id, event]));
			eventsByGuild.set(occurrence.guildId, guildEvents);
		}
		const event = guildEvents.get(occurrence.eventId);
		if (!event) {
			continue;
		}
		await armOccurrence(event, occurrence);
	}

	console.timeEnd(`Loaded ${occurrences.length} event occurrences`);
}
