import { describe, expect, it } from "vitest";

import { SCHEDULE_TABLE } from "../db/schema.ts";
import type { Store } from "../db/store.ts";
import { Color } from "../types/db.types.ts";
import { describeTable } from "./string.utils.ts";

describe("describeTable", () => {
	it("uses entry label fallback in title when queue lookup misses", () => {
		const store = {
			dbQueues: () => new Map(),
		} as Store;

		const result = describeTable({
			store,
			table: SCHEDULE_TABLE,
			tableLabel: "Schedules",
			entryLabelProperty: "command",
			entries: [{
				queueId: 999n,
				command: "pull",
				cron: "0 * * * *",
				color: Color.Blue,
			}],
		});

		expect(result.embeds).toHaveLength(1);
		expect(result.embeds![0].data.title).toBe("**pull** schedules");
	});

	it("returns empty-state content when there are no entries", () => {
		const store = {
			dbQueues: () => new Map(),
		} as Store;

		const result = describeTable({
			store,
			table: SCHEDULE_TABLE,
			tableLabel: "Schedules",
			entries: [],
		});

		expect(result).toEqual({ content: "No schedules found." });
	});
});
