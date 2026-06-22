import { afterAll, describe, expect, it } from "vitest";

import { CLIENT } from "../client/client.ts";
import { DISCORD_COMMAND_SIZE_LIMIT, getCommandSize } from "../utils/command-size.utils.ts";
import { COMMANDS } from "./commands.loader.ts";

// Constructing CLIENT (via the import graph) starts sweeper intervals; clear
// them so Vitest exits cleanly.
afterAll(() => CLIENT.destroy());

describe("slash command registration constraints", () => {
	const built = COMMANDS.map(command => command.data.toJSON());

	it("builds every command without throwing", () => {
		expect(built.length).toBe(COMMANDS.size);
	});

	it("keeps every command within Discord's 8000-character limit", () => {
		const offenders = built
			.map(command => ({ name: command.name, size: getCommandSize(command) }))
			.filter(command => command.size > DISCORD_COMMAND_SIZE_LIMIT);

		expect(
			offenders,
			`Commands exceeding the ${DISCORD_COMMAND_SIZE_LIMIT}-char limit: ${JSON.stringify(offenders)}`,
		).toEqual([]);
	});

	it("has no duplicate command names", () => {
		const names = built.map(command => command.name);
		expect(new Set(names).size).toBe(names.length);
	});
});
