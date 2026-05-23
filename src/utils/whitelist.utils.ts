import { type GuildMember, Role } from "discord.js";
import { compact, uniq } from "lodash-es";

import { db } from "../db/db.ts";
import { Queries } from "../db/queries.ts";
import type { DbEvent, DbQueue } from "../db/schema.ts";
import type { Store } from "../db/store.ts";
import type { ArrayOrCollection } from "../types/misc.types.ts";
import type { Mentionable } from "../types/parsing.types.ts";
import { filterDbObjectsOnJsMember, map } from "./misc.utils.ts";

export namespace WhitelistUtils {
	export function insertQueueWhitelisted(
		store: Store,
		queues: ArrayOrCollection<bigint, DbQueue>,
		mentionables: Mentionable[],
		reason?: string,
	) {
		return db.transaction(() => {
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
			const updatedQueueIds = uniq(insertedWhitelisted.map(whitelisted => whitelisted.queueId));

			return { insertedWhitelisted, updatedQueueIds };
		});
	}

	export function insertEventWhitelisted(
		store: Store,
		events: ArrayOrCollection<bigint, DbEvent>,
		mentionables: Mentionable[],
		reason?: string,
	) {
		return db.transaction(() => {
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

			const updatedQueueIds = uniq(insertedWhitelisted.flatMap(whitelisted =>
				store.dbEventQueues(whitelisted.eventId).map(eq => eq.queueId)
			));

			return { insertedWhitelisted, updatedQueueIds };
		});
	}

	export function insertGuildWhitelisted(
		store: Store,
		mentionables: Mentionable[],
		reason?: string,
	) {
		return db.transaction(() => {
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
			const updatedQueueIds = insertedWhitelisted.length
				? uniq([...store.dbQueues().values()].map(queue => queue.id))
				: [];

			return { insertedWhitelisted, updatedQueueIds };
		});
	}

	export function deleteWhitelisted(store: Store, whitelistedIds: bigint[]) {
		const deletedWhitelisted = compact(whitelistedIds.map(id => store.deleteWhitelisted({ id })));
		const updatedQueueIds = uniq(deletedWhitelisted.map(whitelisted => whitelisted.queueId));
		return { deletedWhitelisted, updatedQueueIds };
	}

	export function deleteEventWhitelisted(store: Store, whitelistedIds: bigint[]) {
		const deletedWhitelisted = compact(whitelistedIds.map(id => store.deleteEventWhitelisted({ id })));
		const updatedQueueIds = uniq(deletedWhitelisted.flatMap(whitelisted =>
			store.dbEventQueues(whitelisted.eventId).map(eq => eq.queueId)
		));
		return { deletedWhitelisted, updatedQueueIds };
	}

	export function deleteGuildWhitelisted(store: Store, whitelistedIds: bigint[]) {
		const deletedWhitelisted = compact(whitelistedIds.map(id => store.deleteGuildWhitelisted({ id })));
		const updatedQueueIds = deletedWhitelisted.length
			? uniq([...store.dbQueues().values()].map(queue => queue.id))
			: [];
		return { deletedWhitelisted, updatedQueueIds };
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
