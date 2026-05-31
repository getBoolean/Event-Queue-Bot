import type { DbEventWinner } from "../db/schema.ts";

/**
 * Pure decision functions for the event-winner feature.
 *
 * No Discord, no DB — plain data in, plain data out — so they unit-test with no mocks.
 * The side-effectful orchestration lives in `winner.utils.ts`.
 */

/**
 * Additive union, deduped: the requested userIds that are not already winners of the room.
 */
export function computeWinnersToAdd(existingRoomUserIds: Set<string>, requested: Set<string>): string[] {
	return [...requested].filter(userId => !existingRoomUserIds.has(userId));
}

/**
 * Given the winner rows being deleted and the rows that remain for the event, return the
 * (userId, roleId) pairs whose role must be removed — i.e. users with NO remaining row.
 *
 * Encodes the multi-room-win safety rule: a user who still holds a winning row elsewhere keeps
 * the role. Deduped by (userId, roleId) so a user duplicated across rooms is removed exactly once.
 */
export function computeRoleRemovals(
	deleted: { userId: string, roleId: string }[],
	remaining: { userId: string }[],
): { userId: string, roleId: string }[] {
	const remainingUserIds = new Set(remaining.map(row => row.userId));
	const seen = new Set<string>();
	const removals: { userId: string, roleId: string }[] = [];
	for (const { userId, roleId } of deleted) {
		if (remainingUserIds.has(userId)) continue;
		const key = JSON.stringify([userId, roleId]);
		if (seen.has(key)) continue;
		seen.add(key);
		removals.push({ userId, roleId });
	}
	return removals;
}

/**
 * For the list command: rows -> ordered map of roomIndex -> userIds (rooms ascending,
 * within-room order preserved).
 */
export function groupWinnersByRoom(rows: DbEventWinner[]): Map<bigint, string[]> {
	const grouped = new Map<bigint, string[]>();
	const ordered = [...rows].sort((a, b) => Number(a.roomIndex) - Number(b.roomIndex));
	for (const row of ordered) {
		const userIds = grouped.get(row.roomIndex) ?? [];
		userIds.push(row.userId);
		grouped.set(row.roomIndex, userIds);
	}
	return grouped;
}
