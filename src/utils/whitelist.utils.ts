import { type GuildMember, Role } from "discord.js";
import { compact } from "lodash-es";

import { Queries } from "../db/queries.ts";
import type { DbEvent, DbQueue } from "../db/schema.ts";
import type { Store } from "../db/store.ts";
import type { ArrayOrCollection } from "../types/misc.types.ts";
import type { Mentionable } from "../types/parsing.types.ts";
import { filterDbObjectsOnJsMember, map } from "./misc.utils.ts";
import { SubjectListUtils } from "./subject-list.utils.ts";

export namespace WhitelistUtils {
	export async function insertQueueWhitelisted(
		store: Store,
		queues: ArrayOrCollection<bigint, DbQueue>,
		mentionables: Mentionable[],
		reason?: string,
	) {
		return SubjectListUtils.runTransaction(async () => {
			const insertedWhitelisted = compact(
				map(queues, queue =>
					mentionables.map(mentionable =>
						store.insertWhitelisted({
							guildId: store.guild.id,
							queueId: queue.id,
							subjectId: mentionable.id,
							isRole: mentionable instanceof Role,
							reason,
						})
					)
				)
			).flat(2);

			return {
				insertedWhitelisted,
				updatedQueueIds: SubjectListUtils.updatedQueueIdsForQueueScope(insertedWhitelisted),
			};
		});
	}

	export async function insertEventWhitelisted(
		store: Store,
		events: ArrayOrCollection<bigint, DbEvent>,
		mentionables: Mentionable[],
		reason?: string,
	) {
		return SubjectListUtils.runTransaction(async () => {
			const insertedWhitelisted = compact(
				map(events, event =>
					mentionables.map(mentionable =>
						store.insertEventWhitelisted({
							guildId: store.guild.id,
							eventId: event.id,
							subjectId: mentionable.id,
							isRole: mentionable instanceof Role,
							reason,
						})
					)
				)
			).flat(2);

			return {
				insertedWhitelisted,
				updatedQueueIds: SubjectListUtils.updatedQueueIdsForEventScope(store, insertedWhitelisted),
			};
		});
	}

	export async function insertGuildWhitelisted(
		store: Store,
		mentionables: Mentionable[],
		reason?: string,
	) {
		return SubjectListUtils.runTransaction(async () => {
			const insertedWhitelisted = compact(
				mentionables.map(mentionable =>
					store.insertGuildWhitelisted({
						guildId: store.guild.id,
						subjectId: mentionable.id,
						isRole: mentionable instanceof Role,
						reason,
					})
				)
			);

			return {
				insertedWhitelisted,
				updatedQueueIds: SubjectListUtils.updatedQueueIdsForGuildScope(store, insertedWhitelisted.length),
			};
		});
	}

	export function deleteWhitelisted(store: Store, whitelistedIds: bigint[]) {
		const deletedWhitelisted = compact(whitelistedIds.map(id => store.deleteWhitelisted({ id })));
		return {
			deletedWhitelisted,
			updatedQueueIds: SubjectListUtils.updatedQueueIdsForQueueScope(deletedWhitelisted),
		};
	}

	export function deleteEventWhitelisted(store: Store, whitelistedIds: bigint[]) {
		const deletedWhitelisted = compact(whitelistedIds.map(id => store.deleteEventWhitelisted({ id })));
		return {
			deletedWhitelisted,
			updatedQueueIds: SubjectListUtils.updatedQueueIdsForEventScope(store, deletedWhitelisted),
		};
	}

	export function deleteGuildWhitelisted(store: Store, whitelistedIds: bigint[]) {
		const deletedWhitelisted = compact(whitelistedIds.map(id => store.deleteGuildWhitelisted({ id })));
		return {
			deletedWhitelisted,
			updatedQueueIds: SubjectListUtils.updatedQueueIdsForGuildScope(store, deletedWhitelisted.length),
		};
	}

	// Union-of-allow-lists: if any applicable scope (queue / event / guild) has any whitelist rows,
	// the member must appear in the aggregate across all scopes — otherwise they are blocked.
	export function isBlockedByWhitelist(store: Store, queueId: bigint, jsMember: GuildMember): boolean {
		const queueRows = store.dbWhitelisted().filter(w => w.queueId === queueId);

		const eventQueue = Queries.selectEventQueueByQueueId({ guildId: store.guild.id, queueId });
		const eventRows = eventQueue
			? store.dbEventWhitelisted().filter(w => w.eventId === eventQueue.eventId)
			: null;

		const guildRows = store.dbGuildWhitelisted();

		const anyScopeHasEntries = queueRows.size > 0 || (eventRows && eventRows.size > 0) || guildRows.size > 0;
		if (!anyScopeHasEntries) return false;

		const memberMatches =
			filterDbObjectsOnJsMember(queueRows, jsMember).size > 0 ||
			(eventRows && filterDbObjectsOnJsMember(eventRows, jsMember).size > 0) ||
			filterDbObjectsOnJsMember(guildRows, jsMember).size > 0;

		return !memberMatches;
	}
}
