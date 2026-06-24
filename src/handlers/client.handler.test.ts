import { beforeEach, describe, expect, it, vi } from "vitest";

const { handleMock, interactionHandlerMock } = vi.hoisted(() => ({
	handleMock: vi.fn().mockResolvedValue(undefined),
	interactionHandlerMock: vi.fn(),
}));

vi.mock("../db/queries.ts", () => ({
	Queries: {
		deleteGuild: vi.fn(),
	},
}));

vi.mock("./interaction.handler.ts", () => ({
	InteractionHandler: class {
		handle = handleMock;

		constructor(inter: unknown) {
			interactionHandlerMock(inter);
		}
	},
}));

import { Queries } from "../db/queries.ts";
import { ClientHandler } from "./client.handler.ts";

describe("ClientHandler", () => {
	beforeEach(() => {
		vi.mocked(Queries.deleteGuild).mockReset();
		handleMock.mockClear();
		interactionHandlerMock.mockClear();
	});

	it("handleGuildDelete removes guild data", () => {
		ClientHandler.handleGuildDelete({ id: "guild-1" } as any);

		expect(Queries.deleteGuild).toHaveBeenCalledWith({ guildId: "guild-1" });
	});

	it("handleGuildDelete logs when deleteGuild throws", () => {
		vi.mocked(Queries.deleteGuild).mockImplementation(() => {
			throw new Error("db unavailable");
		});
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

		ClientHandler.handleGuildDelete({ id: "guild-1" } as any);

		expect(errorSpy).toHaveBeenCalledWith(
			expect.stringContaining("ClientHandler.handleGuildDelete"),
			expect.any(Error),
		);
		errorSpy.mockRestore();
	});

	it("handleInteraction delegates guild interactions to InteractionHandler", async () => {
		const inter = { guild: { id: "guild-1" } } as any;
		await ClientHandler.handleInteraction(inter);

		expect(interactionHandlerMock).toHaveBeenCalledWith(inter);
		expect(handleMock).toHaveBeenCalled();
	});

	it("handleInteraction replies when used outside a guild", async () => {
		const reply = vi.fn().mockResolvedValue(undefined);
		const inter = { guild: null, reply } as any;

		await ClientHandler.handleInteraction(inter);

		expect(reply).toHaveBeenCalledWith("This command can only be used in servers");
		expect(interactionHandlerMock).not.toHaveBeenCalled();
	});
});
