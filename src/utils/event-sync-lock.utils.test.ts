import { beforeEach, describe, expect, it, vi } from "vitest";

import { EventSyncInProgressWarning } from "./error.utils.ts";

const {
	tryAcquireEventSyncLock,
	releaseEventSyncLock,
} = vi.hoisted(() => ({
	tryAcquireEventSyncLock: vi.fn(() => true),
	releaseEventSyncLock: vi.fn(),
}));

vi.mock("../db/queries.ts", () => ({
	Queries: {
		tryAcquireEventSyncLock,
		releaseEventSyncLock,
		deleteStaleEventSyncLocks: vi.fn(),
	},
}));

import { EventSyncLock } from "./event-sync-lock.utils.ts";

describe("EventSyncLock", () => {
	beforeEach(() => {
		tryAcquireEventSyncLock.mockReset();
		tryAcquireEventSyncLock.mockReturnValue(true);
		releaseEventSyncLock.mockReset();
	});

	it("releases DB lock after withLock completes", async () => {
		await EventSyncLock.withLock("guild1", 42n, async () => "ok");
		expect(tryAcquireEventSyncLock).toHaveBeenCalledWith({ guildId: "guild1", eventId: 42n });
		expect(releaseEventSyncLock).toHaveBeenCalledWith({ guildId: "guild1", eventId: 42n });
	});

	it("throws when DB lock cannot be acquired", async () => {
		tryAcquireEventSyncLock.mockReturnValue(false);
		await expect(
			EventSyncLock.withLock("guild1", 42n, async () => undefined),
		).rejects.toBeInstanceOf(EventSyncInProgressWarning);
		expect(releaseEventSyncLock).not.toHaveBeenCalled();
	});

	it("re-entrant withLock does not double-acquire", async () => {
		await EventSyncLock.withLock("guild1", 42n, async () => {
			await EventSyncLock.withLock("guild1", 42n, async () => undefined);
		});
		expect(tryAcquireEventSyncLock).toHaveBeenCalledTimes(1);
		expect(releaseEventSyncLock).toHaveBeenCalledTimes(1);
	});

	it("tryWithLock returns skipped when lock is held", async () => {
		tryAcquireEventSyncLock.mockReturnValue(false);
		const result = await EventSyncLock.tryWithLock("guild1", 42n, async () => "done");
		expect(result).toBe("skipped");
	});
});
