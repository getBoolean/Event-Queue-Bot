import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DbEventOccurrence } from "../db/schema.ts";

const {
	selectManyOccurrenceRoomPingsByOccurrenceIds,
	selectManyOccurrenceRoomPullsByOccurrenceIds,
	selectManyEventQueues,
} = vi.hoisted(() => ({
	selectManyOccurrenceRoomPingsByOccurrenceIds: vi.fn(() => []),
	selectManyOccurrenceRoomPullsByOccurrenceIds: vi.fn(() => []),
	selectManyEventQueues: vi.fn(() => []),
}));

vi.mock("../db/queries.ts", () => ({
	Queries: {
		selectManyOccurrenceRoomPingsByOccurrenceIds,
		selectManyOccurrenceRoomPullsByOccurrenceIds,
		selectManyEventQueues,
	},
}));

import { buildArmOccurrenceContext } from "./event-schedule.utils.ts";

describe("buildArmOccurrenceContext", () => {
	beforeEach(() => {
		selectManyOccurrenceRoomPingsByOccurrenceIds.mockClear();
		selectManyOccurrenceRoomPullsByOccurrenceIds.mockClear();
		selectManyEventQueues.mockClear();
	});

	it("batches junction queries once for multiple occurrences", () => {
		const occurrences: DbEventOccurrence[] = [
			{ id: 1n, guildId: "g1", eventId: 10n, startTime: 0n } as DbEventOccurrence,
			{ id: 2n, guildId: "g1", eventId: 10n, startTime: 0n } as DbEventOccurrence,
			{ id: 3n, guildId: "g1", eventId: 10n, startTime: 0n } as DbEventOccurrence,
		];

		buildArmOccurrenceContext("g1", occurrences);

		expect(selectManyOccurrenceRoomPingsByOccurrenceIds).toHaveBeenCalledTimes(1);
		expect(selectManyOccurrenceRoomPingsByOccurrenceIds).toHaveBeenCalledWith({
			guildId: "g1",
			occurrenceIds: [1n, 2n, 3n],
		});
		expect(selectManyOccurrenceRoomPullsByOccurrenceIds).toHaveBeenCalledTimes(1);
		expect(selectManyOccurrenceRoomPullsByOccurrenceIds).toHaveBeenCalledWith({
			guildId: "g1",
			occurrenceIds: [1n, 2n, 3n],
		});
	});

	it("loads room queues once per unique event id", () => {
		const occurrences: DbEventOccurrence[] = [
			{ id: 1n, guildId: "g1", eventId: 10n, startTime: 0n } as DbEventOccurrence,
			{ id: 2n, guildId: "g1", eventId: 20n, startTime: 0n } as DbEventOccurrence,
		];

		buildArmOccurrenceContext("g1", occurrences);

		expect(selectManyEventQueues).toHaveBeenCalledTimes(2);
		expect(selectManyEventQueues).toHaveBeenCalledWith({ guildId: "g1", eventId: 10n });
		expect(selectManyEventQueues).toHaveBeenCalledWith({ guildId: "g1", eventId: 20n });
	});
});
