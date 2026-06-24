import { Queries } from "../db/queries.ts";
import type { DbEvent } from "../db/schema.ts";
import { EventQueueRole, RoomScheduling } from "../types/db.types.ts";
import { LockBeforeOpenWarning } from "./error.utils.ts";

export const DEFAULT_ROOM_LENGTH_MS = 60 * 60 * 1000;

export const EVENT_DEFAULT_NON_QUEUE_KEYS = new Set(["id", "guildId", "eventId", "queueRole"]);

export function getRoomsFinishMs(event: DbEvent, startMs: number): number {
	const perRoomMs = event.roomLengthMs != null
		? Number(event.roomLengthMs)
		: DEFAULT_ROOM_LENGTH_MS;
	const totalRoomsDurationMs = event.roomScheduling === RoomScheduling.Sequential
		? perRoomMs * Number(event.roomCount)
		: perRoomMs;
	return startMs + totalRoomsDurationMs;
}

export function shouldEventQueueBeUnlocked(
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

export function validateEventOffsets(createOffsetMs: bigint, lockOffsetMs: bigint) {
	if (lockOffsetMs < -createOffsetMs) {
		throw new LockBeforeOpenWarning();
	}
}
