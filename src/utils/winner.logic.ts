/**
 * Pure decision functions for the event-winner feature.
 *
 * No Discord, no DB — plain data in, plain data out — so they unit-test with no mocks.
 * The side-effectful orchestration lives in `winner.utils.ts`.
 */

/**
 * Additive union, deduped: the requested userIds that are not already winners of the event.
 */
export function computeWinnersToAdd(existingUserIds: Set<string>, requested: Set<string>): string[] {
	return [...requested].filter(userId => !existingUserIds.has(userId));
}
