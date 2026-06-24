import { Collection } from "discord.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("DisplayUtils.requestDisplayUpdate coalescing", () => {
	beforeEach(() => {
		vi.resetModules();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("coalesces duplicate queue updates into one immediate updateDisplays call", async () => {
		const { DisplayUtils } = await import("./display.utils.ts");
		const updateSpy = vi.spyOn(DisplayUtils, "updateDisplays");
		const store = {
			guild: { id: "1" },
			dbQueues: () => new Collection(),
			dbDisplays: () => new Collection(),
		} as any;

		await DisplayUtils.requestDisplayUpdate({ store, queueId: 99n });
		await DisplayUtils.requestDisplayUpdate({ store, queueId: 99n });

		expect(updateSpy).toHaveBeenCalledTimes(1);
		expect(updateSpy).toHaveBeenCalledWith({ store, queueId: 99n });
	}, 15_000);
});
