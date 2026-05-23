import { type GuildMember, Role } from "discord.js";
import { compact, uniq } from "lodash-es";

import { db } from "../db/db.ts";
import { Queries } from "../db/queries.ts";
import type { DbEvent, DbQueue } from "../db/schema.ts";
import type { Store } from "../db/store.ts";
import { MemberRemovalReason } from "../types/db.types.ts";
import type { ArrayOrCollection } from "../types/misc.types.ts";
import type { Mentionable } from "../types/parsing.types.ts";
import { MemberUtils } from "./member.utils.ts";
import { filterDbObjectsOnJsMember, map } from "./misc.utils.ts";

export namespace BlacklistUtils {
	export async function insertQueueBlacklisted(
		store: Store,
		queues: ArrayOrCollection<bigint, DbQueue>,
		mentionables: Mentionable[],
		reason?: string,
	) {
		return db.transaction(async () => {
			const insertedBlacklisted = compact(
				map(queues, queue =>
					mentionables.map(mentionable => {
						const by = (mentionable instanceof Role) ? { roleId: mentionable.id } : { userId: mentionable.id };
						MemberUtils.deleteMembers({ store, queues, reason: MemberRemovalReason.Kicked, by, force: true });

						return store.insertBlacklisted({
							guildId: store.guild.id,
							queueId: queue.id,
							subjectId: mentionable.id,
							isRole: mentionable instanceof Role,
							reason,
						});
					})
				)
			).flat(2);
			const updatedQueueIds = uniq(insertedBlacklisted.map(blacklisted => blacklisted.queueId));

			return { insertedBlacklisted, updatedQueueIds };
		});
	}

	export async function insertEventBlacklisted(
		store: Store,
		events: ArrayOrCollection<bigint, DbEvent>,
		mentionables: Mentionable[],
		reason?: string,
	) {
		return db.transaction(async () => {
			const insertedBlacklisted = compact(
				map(events, event => {
					const eventQueues = store.dbEventQueues(event.id);
					return mentionables.map(mentionable => {
						const by = (mentionable instanceof Role) ? { roleId: mentionable.id } : { userId: mentionable.id };
						MemberUtils.deleteMembers({
							store,
							queues: eventQueues.map(eq => store.dbQueues().get(eq.queueId)).filter(Boolean) as DbQueue[],
							reason: MemberRemovalReason.Kicked,
							by,
							force: true,
						});

						return store.insertEventBlacklisted({
							guildId: store.guild.id,
							eventId: event.id,
							subjectId: mentionable.id,
							isRole: mentionable instanceof Role,
							reason,
						});
					});
				})
			).flat(2);

			const updatedQueueIds = uniq(insertedBlacklisted.flatMap(blacklisted =>
				store.dbEventQueues(blacklisted.eventId).map(eq => eq.queueId)
			));

			return { insertedBlacklisted, updatedQueueIds };
		});
	}

	export async function insertGuildBlacklisted(
		store: Store,
		mentionables: Mentionable[],
		reason?: string,
	) {
		return db.transaction(async () => {
			const allQueues = store.dbQueues();
			const insertedBlacklisted = compact(
				mentionables.map(mentionable => {
					const by = (mentionable instanceof Role) ? { roleId: mentionable.id } : { userId: mentionable.id };
					MemberUtils.deleteMembers({
						store,
						queues: allQueues,
						reason: MemberRemovalReason.Kicked,
						by,
						force: true,
					});

					return store.insertGuildBlacklisted({
						guildId: store.guild.id,
						subjectId: mentionable.id,
						isRole: mentionable instanceof Role,
						reason,
					});
				})
			);

			const updatedQueueIds = uniq([...allQueues.values()].map(queue => queue.id));

			return { insertedBlacklisted, updatedQueueIds };
		});
	}

	export function deleteBlacklisted(store: Store, blacklistedIds: bigint[]) {
		const deletedBlacklisted = compact(blacklistedIds.map(id => store.deleteBlacklisted({ id })));
		const updatedQueueIds = uniq(deletedBlacklisted.map(blacklisted => blacklisted.queueId));
		return { deletedBlacklisted, updatedQueueIds };
	}

	export function deleteEventBlacklisted(store: Store, blacklistedIds: bigint[]) {
		const deletedBlacklisted = compact(blacklistedIds.map(id => store.deleteEventBlacklisted({ id })));
		const updatedQueueIds = uniq(deletedBlacklisted.flatMap(blacklisted =>
			store.dbEventQueues(blacklisted.eventId).map(eq => eq.queueId)
		));
		return { deletedBlacklisted, updatedQueueIds };
	}

	export function deleteGuildBlacklisted(store: Store, blacklistedIds: bigint[]) {
		const deletedBlacklisted = compact(blacklistedIds.map(id => store.deleteGuildBlacklisted({ id })));
		const updatedQueueIds = deletedBlacklisted.length
			? uniq([...store.dbQueues().values()].map(queue => queue.id))
			: [];
		return { deletedBlacklisted, updatedQueueIds };
	}

	export function isBlockedByBlacklist(store: Store, queueId: bigint, jsMember: GuildMember): boolean {
		// Queue scope
		const queueBlacklist = store.dbBlacklisted().filter(b => b.queueId === queueId);
		if (filterDbObjectsOnJsMember(queueBlacklist, jsMember).size > 0) return true;

		// Event scope: find the event this queue belongs to, if any
		const eventQueue = Queries.selectEventQueueByQueueId({ guildId: store.guild.id, queueId });
		if (eventQueue) {
			const eventBlacklist = store.dbEventBlacklisted().filter(b => b.eventId === eventQueue.eventId);
			if (filterDbObjectsOnJsMember(eventBlacklist, jsMember).size > 0) return true;
		}

		// Guild scope
		const guildBlacklist = store.dbGuildBlacklisted();
		if (filterDbObjectsOnJsMember(guildBlacklist, jsMember).size > 0) return true;

		return false;
	}
}
