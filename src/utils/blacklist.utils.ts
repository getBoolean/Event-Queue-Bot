import { type GuildMember, Role } from "discord.js";
import { compact } from "lodash-es";

import { Queries } from "../db/queries.ts";
import type { DbEvent, DbQueue } from "../db/schema.ts";
import type { Store } from "../db/store.ts";
import { MemberRemovalReason } from "../types/db.types.ts";
import type { ArrayOrCollection } from "../types/misc.types.ts";
import type { Mentionable } from "../types/parsing.types.ts";
import { MemberUtils } from "./member.utils.ts";
import { filterDbObjectsOnJsMember, map } from "./misc.utils.ts";
import { SubjectListUtils } from "./subject-list.utils.ts";

export namespace BlacklistUtils {
	export async function insertQueueBlacklisted(
		store: Store,
		queues: ArrayOrCollection<bigint, DbQueue>,
		mentionables: Mentionable[],
		reason?: string,
	) {
		return SubjectListUtils.runTransaction(async () => {
			const insertedBlacklisted = [];
			for (const queue of map(queues, queue => queue)) {
				for (const mentionable of mentionables) {
					await MemberUtils.deleteMembers({
						store,
						queues,
						reason: MemberRemovalReason.Kicked,
						by: SubjectListUtils.mentionableFilter(mentionable),
						force: true,
					});

					insertedBlacklisted.push(store.insertBlacklisted({
						guildId: store.guild.id,
						queueId: queue.id,
						subjectId: mentionable.id,
						isRole: mentionable instanceof Role,
						reason,
					}));
				}
			}

			return {
				insertedBlacklisted,
				updatedQueueIds: SubjectListUtils.updatedQueueIdsForQueueScope(insertedBlacklisted),
			};
		});
	}

	export async function insertEventBlacklisted(
		store: Store,
		events: ArrayOrCollection<bigint, DbEvent>,
		mentionables: Mentionable[],
		reason?: string,
	) {
		return SubjectListUtils.runTransaction(async () => {
			const insertedBlacklisted = [];
			for (const event of map(events, event => event)) {
				const queues = SubjectListUtils.eventQueuesForEvents(store, [event]);
				for (const mentionable of mentionables) {
					await MemberUtils.deleteMembers({
						store,
						queues,
						reason: MemberRemovalReason.Kicked,
						by: SubjectListUtils.mentionableFilter(mentionable),
						force: true,
					});

					insertedBlacklisted.push(store.insertEventBlacklisted({
						guildId: store.guild.id,
						eventId: event.id,
						subjectId: mentionable.id,
						isRole: mentionable instanceof Role,
						reason,
					}));
				}
			}

			return {
				insertedBlacklisted,
				updatedQueueIds: SubjectListUtils.updatedQueueIdsForEventScope(store, insertedBlacklisted),
			};
		});
	}

	export async function insertGuildBlacklisted(
		store: Store,
		mentionables: Mentionable[],
		reason?: string,
	) {
		return SubjectListUtils.runTransaction(async () => {
			const allQueues = store.dbQueues();
			const insertedBlacklisted = [];
			for (const mentionable of mentionables) {
				await MemberUtils.deleteMembers({
					store,
					queues: allQueues,
					reason: MemberRemovalReason.Kicked,
					by: SubjectListUtils.mentionableFilter(mentionable),
					force: true,
				});

				insertedBlacklisted.push(store.insertGuildBlacklisted({
					guildId: store.guild.id,
					subjectId: mentionable.id,
					isRole: mentionable instanceof Role,
					reason,
				}));
			}

			return {
				insertedBlacklisted,
				updatedQueueIds: SubjectListUtils.updatedQueueIdsForGuildScope(store, insertedBlacklisted.length),
			};
		});
	}

	export function deleteBlacklisted(store: Store, blacklistedIds: bigint[]) {
		const deletedBlacklisted = compact(blacklistedIds.map(id => store.deleteBlacklisted({ id })));
		return {
			deletedBlacklisted,
			updatedQueueIds: SubjectListUtils.updatedQueueIdsForQueueScope(deletedBlacklisted),
		};
	}

	export function deleteEventBlacklisted(store: Store, blacklistedIds: bigint[]) {
		const deletedBlacklisted = compact(blacklistedIds.map(id => store.deleteEventBlacklisted({ id })));
		return {
			deletedBlacklisted,
			updatedQueueIds: SubjectListUtils.updatedQueueIdsForEventScope(store, deletedBlacklisted),
		};
	}

	export function deleteGuildBlacklisted(store: Store, blacklistedIds: bigint[]) {
		const deletedBlacklisted = compact(blacklistedIds.map(id => store.deleteGuildBlacklisted({ id })));
		return {
			deletedBlacklisted,
			updatedQueueIds: SubjectListUtils.updatedQueueIdsForGuildScope(store, deletedBlacklisted.length),
		};
	}

	export function isBlockedByBlacklist(store: Store, queueId: bigint, jsMember: GuildMember): boolean {
		const queueBlacklist = store.dbBlacklisted().filter(b => b.queueId === queueId);
		if (filterDbObjectsOnJsMember(queueBlacklist, jsMember).size > 0) return true;

		const eventQueue = Queries.selectEventQueueByQueueId({ guildId: store.guild.id, queueId });
		if (eventQueue) {
			const eventBlacklist = store.dbEventBlacklisted().filter(b => b.eventId === eventQueue.eventId);
			if (filterDbObjectsOnJsMember(eventBlacklist, jsMember).size > 0) return true;
		}

		const guildBlacklist = store.dbGuildBlacklisted();
		if (filterDbObjectsOnJsMember(guildBlacklist, jsMember).size > 0) return true;

		return false;
	}
}
