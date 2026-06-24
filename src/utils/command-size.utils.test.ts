import { describe, expect, it } from "vitest";

import { DISCORD_COMMAND_SIZE_LIMIT, findOversizedCommands, getCommandSize } from "./command-size.utils.ts";

describe("getCommandSize", () => {
	it("counts nested options and choice values", () => {
		const node = {
			name: "cmd",
			description: "desc",
			options: [{
				name: "sub",
				description: "subdesc",
				choices: [{ name: "a", value: "val" }],
			}],
		};

		expect(getCommandSize(node)).toBe(
			"cmd".length + "desc".length + "sub".length + "subdesc".length + "a".length + "val".length,
		);
	});

	it("treats missing fields as zero length", () => {
		expect(getCommandSize({})).toBe(0);
	});

	it("does not flag a command exactly at the limit", () => {
		const pad = "x".repeat(DISCORD_COMMAND_SIZE_LIMIT - 2);
		const command = { name: "ok", description: pad };

		expect(getCommandSize(command)).toBe(DISCORD_COMMAND_SIZE_LIMIT);
		expect(findOversizedCommands([command])).toEqual([]);
	});

	it("findOversizedCommands returns offenders with computed sizes", () => {
		const command = { name: "big", description: "x".repeat(DISCORD_COMMAND_SIZE_LIMIT) };
		const size = getCommandSize(command);

		expect(findOversizedCommands([command])).toEqual([{ name: "big", size }]);
		expect(size).toBeGreaterThan(DISCORD_COMMAND_SIZE_LIMIT);
	});
});
