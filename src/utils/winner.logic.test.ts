import { describe, expect, it } from "vitest";

import type { DbEventWinner } from "../db/schema.ts";
import { computeRoleRemovals, computeWinnersToAdd, groupWinnersByRoom } from "./winner.logic.ts";

function winnerRow(overrides: Partial<DbEventWinner>): DbEventWinner {
	return {
		id: 1n,
		guildId: "g",
		eventId: 1n,
		roomIndex: 1n,
		userId: "u",
		roleId: "r",
		declaredAt: 0n,
		...overrides,
	};
}

describe("computeWinnersToAdd", () => {
	it("dedupes repeated requested users", () => {
		expect(computeWinnersToAdd(new Set(), new Set(["a", "a", "b"]))).toEqual(["a", "b"]);
	});

	it("returns [] when every requested user is already a winner", () => {
		expect(computeWinnersToAdd(new Set(["a", "b"]), new Set(["a", "b"]))).toEqual([]);
	});

	it("returns only the requested users not already winners", () => {
		expect(computeWinnersToAdd(new Set(["a"]), new Set(["a", "b", "c"]))).toEqual(["b", "c"]);
	});
});

describe("computeRoleRemovals", () => {
	it("does not remove a user who still has a remaining row (multi-room win)", () => {
		const deleted = [{ userId: "a", roleId: "r" }];
		const remaining = [{ userId: "a" }];
		expect(computeRoleRemovals(deleted, remaining)).toEqual([]);
	});

	it("removes a user whose only row was deleted, carrying the snapshotted roleId", () => {
		const deleted = [{ userId: "b", roleId: "role-123" }];
		expect(computeRoleRemovals(deleted, [])).toEqual([{ userId: "b", roleId: "role-123" }]);
	});

	it("removes everyone exactly once on whole-event delete even when duplicated across rooms", () => {
		const deleted = [
			{ userId: "a", roleId: "r" },
			{ userId: "a", roleId: "r" },
			{ userId: "b", roleId: "r" },
		];
		expect(computeRoleRemovals(deleted, [])).toEqual([
			{ userId: "a", roleId: "r" },
			{ userId: "b", roleId: "r" },
		]);
	});
});

describe("groupWinnersByRoom", () => {
	it("groups winners by room ordered ascending, preserving multiple winners per room", () => {
		const rows = [
			winnerRow({ id: 1n, roomIndex: 2n, userId: "x" }),
			winnerRow({ id: 2n, roomIndex: 1n, userId: "z" }),
			winnerRow({ id: 3n, roomIndex: 2n, userId: "y" }),
		];

		const grouped = groupWinnersByRoom(rows);

		expect([...grouped.keys()]).toEqual([1n, 2n]);
		expect(grouped.get(1n)).toEqual(["z"]);
		expect(grouped.get(2n)).toEqual(["x", "y"]);
	});
});
