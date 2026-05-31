import { describe, expect, it } from "vitest";

import { computeWinnersToAdd } from "./winner.logic.ts";

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
