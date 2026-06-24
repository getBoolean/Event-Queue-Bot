import { type GuildMember, Role } from "discord.js";
import { compact, min } from "lodash-es";

import { Queries } from "../db/queries.ts";
import type {
	DbEvent,
	DbEventPrioritized,
	DbGuildPrioritized,
	DbPrioritized,
	DbQueue,
} from "../db/schema.ts";
import type { Store } from "../db/store.ts";
import type { ArrayOrCollection } from "../types/misc.types.ts";
import type { Mentionable } from "../types/parsing.types.ts";
import { DisplayUtils } from "./display.utils.ts";
import { filterDbObjectsOnJsMember, map } from "./misc.utils.ts";
import { SubjectListUtils } from "./subject-list.utils.ts";

export namespace PriorityUtils {
	export async function insertQueuePrioritized(
		store: Store,
		queues: ArrayOrCollection<bigint, DbQueue>,
		mentionables: Mentionable[],
		priorityOrder?: bigint,
		reason?: string,
	) {
		const result = await SubjectListUtils.runTransaction(async () => {
			const insertedPrioritized = compact(
				map(queues, queue =>
					mentionables.map(mentionable =>
						store.insertPrioritized({
							guildId: store.guild.id,
							queueId: queue.id,
							subjectId: mentionable.id,
							isRole: mentionable instanceof Role,
							priorityOrder,
							reason,
						})
					)
				)
			).flat(2);

			return {
				insertedPrioritized,
				updatedQueueIds: SubjectListUtils.updatedQueueIdsForQueueScope(insertedPrioritized),
			};
		});

		await reEvaluatePrioritized(store, result.updatedQueueIds);

		return result;
	}

	export async function insertEventPrioritized(
		store: Store,
		events: ArrayOrCollection<bigint, DbEvent>,
		mentionables: Mentionable[],
		priorityOrder?: bigint,
		reason?: string,
	) {
		const result = await SubjectListUtils.runTransaction(async () => {
			const insertedPrioritized = compact(
				map(events, event =>
					mentionables.map(mentionable =>
						store.insertEventPrioritized({
							guildId: store.guild.id,
							eventId: event.id,
							subjectId: mentionable.id,
							isRole: mentionable instanceof Role,
							priorityOrder,
							reason,
						})
					)
				)
			).flat(2);

			return {
				insertedPrioritized,
				updatedQueueIds: SubjectListUtils.updatedQueueIdsForEventScope(store, insertedPrioritized),
			};
		});

		await reEvaluatePrioritized(store, result.updatedQueueIds);

		return result;
	}

	export async function insertGuildPrioritized(
		store: Store,
		mentionables: Mentionable[],
		priorityOrder?: bigint,
		reason?: string,
	) {
		const result = await SubjectListUtils.runTransaction(async () => {
			const insertedPrioritized = compact(
				mentionables.map(mentionable =>
					store.insertGuildPrioritized({
						guildId: store.guild.id,
						subjectId: mentionable.id,
						isRole: mentionable instanceof Role,
						priorityOrder,
						reason,
					})
				)
			);

			return {
				insertedPrioritized,
				updatedQueueIds: SubjectListUtils.updatedQueueIdsForGuildScope(store, insertedPrioritized.length),
			};
		});

		await reEvaluatePrioritized(store, result.updatedQueueIds);

		return result;
	}

	export async function updatePrioritized(store: Store, prioritizedIds: bigint[], update: Partial<DbPrioritized>) {
		const result = await SubjectListUtils.runTransaction(async () => {
			const updatedPrioritized = compact(prioritizedIds.map(id => store.updatePrioritized({ id, ...update })));
			return {
				updatedPrioritized,
				updatedQueueIds: SubjectListUtils.updatedQueueIdsForQueueScope(updatedPrioritized),
			};
		});

		await reEvaluatePrioritized(store, result.updatedQueueIds);

		return result;
	}

	export async function updateEventPrioritized(store: Store, prioritizedIds: bigint[], update: Partial<DbEventPrioritized>) {
		const result = await SubjectListUtils.runTransaction(async () => {
			const updatedPrioritized = compact(prioritizedIds.map(id => store.updateEventPrioritized({ id, ...update })));
			return {
				updatedPrioritized,
				updatedQueueIds: SubjectListUtils.updatedQueueIdsForEventScope(store, updatedPrioritized),
			};
		});

		await reEvaluatePrioritized(store, result.updatedQueueIds);

		return result;
	}

	export async function updateGuildPrioritized(store: Store, prioritizedIds: bigint[], update: Partial<DbGuildPrioritized>) {
		const result = await SubjectListUtils.runTransaction(async () => {
			const updatedPrioritized = compact(prioritizedIds.map(id => store.updateGuildPrioritized({ id, ...update })));
			return {
				updatedPrioritized,
				updatedQueueIds: SubjectListUtils.updatedQueueIdsForGuildScope(store, updatedPrioritized.length),
			};
		});

		await reEvaluatePrioritized(store, result.updatedQueueIds);

		return result;
	}

	export async function deletePrioritized(store: Store, prioritizedIds: bigint[]) {
		const result = await SubjectListUtils.runTransaction(async () => {
			const deletedPrioritized = compact(prioritizedIds.map(id => store.deletePrioritized({ id })));
			return {
				deletedPrioritized,
				updatedQueueIds: SubjectListUtils.updatedQueueIdsForQueueScope(deletedPrioritized),
			};
		});

		await reEvaluatePrioritized(store, result.updatedQueueIds);

		return result;
	}

	export async function deleteEventPrioritized(store: Store, prioritizedIds: bigint[]) {
		const result = await SubjectListUtils.runTransaction(async () => {
			const deletedPrioritized = compact(prioritizedIds.map(id => store.deleteEventPrioritized({ id })));
			return {
				deletedPrioritized,
				updatedQueueIds: SubjectListUtils.updatedQueueIdsForEventScope(store, deletedPrioritized),
			};
		});

		await reEvaluatePrioritized(store, result.updatedQueueIds);

		return result;
	}

	export async function deleteGuildPrioritized(store: Store, prioritizedIds: bigint[]) {
		const result = await SubjectListUtils.runTransaction(async () => {
			const deletedPrioritized = compact(prioritizedIds.map(id => store.deleteGuildPrioritized({ id })));
			return {
				deletedPrioritized,
				updatedQueueIds: SubjectListUtils.updatedQueueIdsForGuildScope(store, deletedPrioritized.length),
			};
		});

		await reEvaluatePrioritized(store, result.updatedQueueIds);

		return result;
	}

	export function getMemberPriority(store: Store, queueId: bigint, jsMember: GuildMember): bigint | null {
		const queueMatches = filterDbObjectsOnJsMember(
			store.dbPrioritized().filter(p => p.queueId === queueId),
			jsMember,
		);

		const eventQueue = Queries.selectEventQueueByQueueId({ guildId: store.guild.id, queueId });
		const eventMatches = eventQueue
			? filterDbObjectsOnJsMember(
				store.dbEventPrioritized().filter(p => p.eventId === eventQueue.eventId),
				jsMember,
			)
			: null;

		const guildMatches = filterDbObjectsOnJsMember(store.dbGuildPrioritized(), jsMember);

		const orders: bigint[] = [
			...queueMatches.map(p => p.priorityOrder),
			...(eventMatches ? eventMatches.map(p => p.priorityOrder) : []),
			...guildMatches.map(p => p.priorityOrder),
		];

		return orders.length ? min(orders) : null;
	}

	async function reEvaluatePrioritized(store: Store, queueIds: bigint[]) {
		for (const queueId of queueIds) {
			const members = store.dbMembers().filter(member => member.queueId === queueId);
			for (const member of members.values()) {
				const jsMember = await store.jsMember(member.userId);
				if (!jsMember) continue;
				const priorityOrder = getMemberPriority(store, queueId, jsMember);
				store.updateMember({ ...member, priorityOrder });
			}
		}
		await DisplayUtils.requestDisplaysUpdate({ store, queueIds });
	}
}
