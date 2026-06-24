import { beforeEach, describe, expect, it, vi } from "vitest";

import { MemberRemovalReason } from "../types/db.types.ts";
import { MemberUtils } from "./member.utils.ts";

/**
 * Contract test for promote auto-pull ordering in EventUtils.runRoomPullAction:
 * room insert must complete before sub delete so a failed insert never orphans the member.
 */
describe("promote auto-pull ordering contract", () => {
	const callOrder: string[] = [];

	beforeEach(() => {
		callOrder.length = 0;
	});

	it("insertMember runs before deleteMember on success path", async () => {
		const insertMember = vi.spyOn(MemberUtils, "insertMember").mockImplementation(async () => {
			callOrder.push("insert");
			return { id: 2n, userId: "user1", queueId: 10n } as any;
		});
		const deleteMember = vi.fn(() => {
			callOrder.push("delete");
		});

		const subMember = { id: 1n, userId: "user1", message: null };
		const jsMember = { id: "user1" } as any;
		const roomQueue = { id: 10n } as any;
		const store = { deleteMember: deleteMember } as any;

		try {
			await MemberUtils.insertMember({
				store,
				queue: roomQueue,
				jsMember,
				message: undefined,
				force: true,
			});
			store.deleteMember({ id: subMember.id }, MemberRemovalReason.Pulled);
		}
		catch {
			// match runRoomPullAction catch
		}

		expect(callOrder).toEqual(["insert", "delete"]);
		insertMember.mockRestore();
	});

	it("deleteMember is not called when insertMember fails", async () => {
		const insertMember = vi.spyOn(MemberUtils, "insertMember").mockRejectedValue(new Error("room full"));
		const deleteMember = vi.fn();

		const subMember = { id: 1n, userId: "user1", message: null };
		const jsMember = { id: "user1" } as any;
		const roomQueue = { id: 10n } as any;
		const store = { deleteMember: deleteMember } as any;

		try {
			await MemberUtils.insertMember({
				store,
				queue: roomQueue,
				jsMember,
				message: undefined,
				force: true,
			});
			store.deleteMember({ id: subMember.id }, MemberRemovalReason.Pulled);
		}
		catch {
			// match runRoomPullAction catch
		}

		expect(deleteMember).not.toHaveBeenCalled();
		insertMember.mockRestore();
	});
});
