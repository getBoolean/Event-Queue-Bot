import type { Snowflake } from "discord.js";

import { Queries } from "../db/queries.ts";
import type { DbEvent } from "../db/schema.ts";
import type { Store } from "../db/store.ts";
import { MemberUtils } from "./member.utils.ts";
import { computeWinnersToAdd } from "./winner.logic.ts";

/**
 * `WinnerUtils` orchestrates the event-winner Store/Queries writes and the Discord role
 * side-effects, delegating every non-trivial rule to the pure functions in `winner.logic.ts`.
 */
export namespace WinnerUtils {

	// Add/remove a role for one user. Guards against a user who has left the guild
	// (`store.jsMember` returns undefined) and logs — rather than throws — so one missing
	// member or permission issue never aborts the rest of a tie.
	async function applyRole(store: Store, userId: Snowflake, roleId: Snowflake, modification: "add" | "remove") {
		const jsMember = await store.jsMember(userId);
		if (!jsMember) return;
		try {
			await MemberUtils.modifyMemberRoles(store, userId, roleId, modification);
		}
		catch (e) {
			console.error(`WinnerUtils.applyRole: failed to ${modification} role ${roleId} for user ${userId}:`, e);
		}
	}

	/**
	 * Additive declaration: grants the event's winner role to the requested users, skipping any who
	 * are already winners of the event. Returns the userIds newly added.
	 */
	export async function declareWinners(
		store: Store,
		event: DbEvent,
		requested: Set<Snowflake>,
	): Promise<string[]> {
		const rows = Queries.selectManyEventWinners({ guildId: store.guild.id, eventId: event.id });
		const existing = new Set(rows.map(row => row.userId));
		const toAdd = computeWinnersToAdd(existing, requested);

		for (const userId of toAdd) {
			store.insertEventWinner({
				guildId: store.guild.id,
				eventId: event.id,
				userId,
				roleId: event.winnerRoleId,
			});
			await applyRole(store, userId, event.winnerRoleId, "add");
		}

		return toAdd;
	}

	/**
	 * Clears all of the event's winner rows, revoking the role from each winner. Uses each row's
	 * snapshotted `roleId`, so it works even if `event.winnerRoleId` was later changed or cleared.
	 * With one row per winner there is nothing to dedup. Returns the role removals.
	 */
	export async function clearEventWinners(
		store: Store,
		event: DbEvent,
	): Promise<{ userId: string, roleId: string }[]> {
		const deleted = Queries.selectManyEventWinners({ guildId: store.guild.id, eventId: event.id });

		store.deleteManyEventWinners({ eventId: event.id });

		const removals = deleted.map(row => ({ userId: row.userId, roleId: row.roleId }));
		for (const { userId, roleId } of removals) {
			await applyRole(store, userId, roleId, "remove");
		}
		return removals;
	}

	/**
	 * Revokes all of an event's winners — the single implementation called from the open-phase
	 * hook so the badge lasts exactly until the next occurrence opens. A redundant call (e.g. a
	 * restart re-running a handled open) simply finds no rows and is a no-op.
	 */
	export async function revokeEventWinners(store: Store, event: DbEvent) {
		return clearEventWinners(store, event);
	}
}
