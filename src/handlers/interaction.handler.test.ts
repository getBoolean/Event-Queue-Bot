import { EmbedBuilder, InteractionType } from "discord.js";
import { describe, expect, it, vi } from "vitest";

import { CustomError } from "../utils/error.utils.ts";
import { InteractionHandler } from "./interaction.handler.ts";

function makeInteraction(overrides: Record<string, unknown> = {}) {
	const respond = vi.fn().mockResolvedValue(undefined);
	return {
		guild: { id: "guild1" },
		guildId: "guild1",
		type: InteractionType.ApplicationCommand,
		isChatInputCommand: () => true,
		isAutocomplete: () => false,
		isButton: () => false,
		isModalSubmit: () => false,
		respond,
		...overrides,
	};
}

describe("InteractionHandler error responses", () => {
	it("always replies ephemeral on command errors", async () => {
		const inter = makeInteraction();
		const handler = new InteractionHandler(inter as any);

		await (handler as any).handleInteractionError(new CustomError({ message: "test failure" }));

		expect(inter.respond).toHaveBeenCalledWith(expect.objectContaining({ ephemeral: true }));
	});

	it("always replies ephemeral on command warnings", async () => {
		const inter = makeInteraction();
		const handler = new InteractionHandler(inter as any);

		await (handler as any).handleInteractionError(new CustomError({ message: "test warning" }));

		expect(inter.respond).toHaveBeenCalledWith(expect.objectContaining({ ephemeral: true }));
	});

	it("uses error styling for CustomError after taxonomy fix", async () => {
		const inter = makeInteraction();
		const handler = new InteractionHandler(inter as any);

		await (handler as any).handleInteractionError(new CustomError({ message: "permission denied" }));

		const payload = inter.respond.mock.calls[0][0];
		const embed = payload.embeds[0] as EmbedBuilder;
		expect(embed.data.title).toContain("ERROR");
	});
});
