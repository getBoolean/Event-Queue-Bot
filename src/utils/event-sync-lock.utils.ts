import { AsyncLocalStorage } from "node:async_hooks";

import { EventSyncInProgressWarning } from "./error.utils.ts";

export namespace EventSyncLock {

	const held = new Set<string>();
	const localHeld = new AsyncLocalStorage<Set<string>>();

	function key(guildId: string, eventId: bigint): string {
		return `${guildId}:${eventId}`;
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
		held.add(k);
		try {
			const next = new Set(localSet ?? []);
			next.add(k);
			return await localHeld.run(next, fn);
		}
		finally {
			held.delete(k);
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
		held.add(k);
		try {
			const next = new Set(localSet ?? []);
			next.add(k);
			return await localHeld.run(next, fn);
		}
		finally {
			held.delete(k);
		}
	}

	export function isHeld(guildId: string, eventId: bigint): boolean {
		return held.has(key(guildId, eventId));
	}
}
