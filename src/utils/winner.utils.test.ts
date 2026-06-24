import { describe, expect, it, vi } from "vitest";

import { Queries } from "../db/queries.ts";
import { MemberUtils } from "./member.utils.ts";
import { WinnerUtils } from "./winner.utils.ts";

describe("WinnerUtils.declareWinners", () => {
	it("returns [] when winnerRoleId is null without touching Discord or DB", async () => {
		const insertEventWinner = vi.fn();
		const applyRoleSpy = vi.spyOn(MemberUtils, "modifyMemberRoles");

		const store = {
			guild: { id: "guild1" },
			jsMember: vi.fn(),
			insertEventWinner,
		} as any;
		const event = { id: 1n, guildId: "guild1", winnerRoleId: null } as any;

		const result = await WinnerUtils.declareWinners(store, event, new Set(["user1"]));

		expect(result).toEqual([]);
		expect(insertEventWinner).not.toHaveBeenCalled();
		expect(applyRoleSpy).not.toHaveBeenCalled();
		applyRoleSpy.mockRestore();
	});

	it("grants role before DB insert and revokes on insert failure", async () => {
		const callOrder: string[] = [];
		vi.spyOn(Queries, "selectManyEventWinners").mockReturnValue([]);
		vi.spyOn(MemberUtils, "modifyMemberRoles").mockImplementation(async (_store, _userId, _roleId, mod) => {
			callOrder.push(mod === "add" ? "add" : "remove");
		});

		const store = {
			guild: { id: "guild1" },
			jsMember: vi.fn().mockResolvedValue({ id: "user1" }),
			insertEventWinner: vi.fn(() => {
				callOrder.push("insert");
				throw new Error("db fail");
			}),
		} as any;
		const event = { id: 1n, guildId: "guild1", winnerRoleId: "role1" } as any;

		const result = await WinnerUtils.declareWinners(store, event, new Set(["user1"]));

		expect(result).toEqual([]);
		expect(callOrder).toEqual(["add", "insert", "remove"]);
	});
});

describe("WinnerUtils.clearEventWinners", () => {
	it("revokes roles before deleting DB rows", async () => {
		const callOrder: string[] = [];
		vi.spyOn(Queries, "selectManyEventWinners").mockReturnValue([
			{ userId: "user1", roleId: "role1" },
		] as any);
		vi.spyOn(MemberUtils, "modifyMemberRoles").mockImplementation(async () => {
			callOrder.push("remove");
		});

		const deleteManyEventWinners = vi.fn(() => {
			callOrder.push("delete");
		});
		const store = {
			guild: { id: "guild1" },
			jsMember: vi.fn().mockResolvedValue({ id: "user1" }),
			deleteManyEventWinners,
		} as any;
		const event = { id: 1n, guildId: "guild1" } as any;

		await WinnerUtils.clearEventWinners(store, event);

		expect(callOrder).toEqual(["remove", "delete"]);
	});

	it("re-grants roles when delete fails", async () => {
		const callOrder: string[] = [];
		vi.spyOn(Queries, "selectManyEventWinners").mockReturnValue([
			{ userId: "user1", roleId: "role1" },
		] as any);
		vi.spyOn(MemberUtils, "modifyMemberRoles").mockImplementation(async (_store, _userId, _roleId, mod) => {
			callOrder.push(mod === "add" ? "add" : "remove");
		});

		const store = {
			guild: { id: "guild1" },
			jsMember: vi.fn().mockResolvedValue({ id: "user1" }),
			deleteManyEventWinners: vi.fn(() => {
				throw new Error("delete fail");
			}),
		} as any;
		const event = { id: 1n, guildId: "guild1" } as any;

		await expect(WinnerUtils.clearEventWinners(store, event)).rejects.toThrow("delete fail");
		expect(callOrder).toEqual(["remove", "add"]);
	});
});
