import { AsyncLocalStorage } from "node:async_hooks";

import { Queries } from "../db/queries.ts";
import { EventSyncInProgressWarning } from "./error.utils.ts";

/** Cross-process lock via SQLite; in-process re-entrancy via AsyncLocalStorage. */
export namespace EventSyncLock {

	const SYNC_LOCK_TTL_MS = 10 * 60 * 1000;

	const held = new Set<string>();
	const localHeld = new AsyncLocalStorage<Set<string>>();

	function key(guildId: string, eventId: bigint): string {
		return `${guildId}:${eventId}`;
	}

	export function cleanupStaleLocks(ttlMs = SYNC_LOCK_TTL_MS) {
		Queries.deleteStaleEventSyncLocks(BigInt(Date.now() - ttlMs));
	}

	// Throw-on-contention. If the current async chain already holds the lock,
	// runs `fn` directly (re-entrant — needed because syncEventQueues itself
	// calls reconcileRoomChannels, which is also lock-wrapped).
	export async function withLock<T>(guildId: string, eventId: bigint, fn: () => Promise<T>): Promise<T> {
		const k = key(guildId, eventId);
		const localSet = localHeld.getStore();
		if (localSet?.has(k)) {
			return fn();
		}
		if (held.has(k)) {
			throw new EventSyncInProgressWarning();
		}
		if (!Queries.tryAcquireEventSyncLock({ guildId, eventId })) {
			throw new EventSyncInProgressWarning();
		}
		held.add(k);
		try {
			const next = new Set(localSet ?? []);
			next.add(k);
			return await localHeld.run(next, fn);
		}
		finally {
			held.delete(k);
			Queries.releaseEventSyncLock({ guildId, eventId });
		}
	}

	// Skip-on-contention. Returns the literal "skipped" sentinel instead of throwing.
	// Used by bulk-sync forms so one in-progress event does not abort the whole batch.
	export async function tryWithLock<T>(
		guildId: string,
		eventId: bigint,
		fn: () => Promise<T>,
	): Promise<T | "skipped"> {
		const k = key(guildId, eventId);
		const localSet = localHeld.getStore();
		if (localSet?.has(k)) {
			return fn();
		}
		if (held.has(k)) {
			return "skipped";
		}
		if (!Queries.tryAcquireEventSyncLock({ guildId, eventId })) {
			return "skipped";
		}
		held.add(k);
		try {
			const next = new Set(localSet ?? []);
			next.add(k);
			return await localHeld.run(next, fn);
		}
		finally {
			held.delete(k);
			Queries.releaseEventSyncLock({ guildId, eventId });
		}
	}

}
