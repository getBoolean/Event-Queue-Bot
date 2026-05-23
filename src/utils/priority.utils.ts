import { type GuildMember, Role } from "discord.js";
import { compact, min, uniq } from "lodash-es";

import { db } from "../db/db.ts";
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

export namespace PriorityUtils {
	export function insertQueuePrioritized(
		store: Store,
		queues: ArrayOrCollection<bigint, DbQueue>,
		mentionables: Mentionable[],
		priorityOrder?: bigint,
		reason?: string,
	) {
		const result = db.transaction(() => {
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
			const updatedQueueIds = uniq(insertedPrioritized.map(prioritized => prioritized.queueId));

			return { insertedPrioritized, updatedQueueIds };
		});

		reEvaluatePrioritized(store, result.updatedQueueIds);

		return result;
	}

	export function insertEventPrioritized(
		store: Store,
		events: ArrayOrCollection<bigint, DbEvent>,
		mentionables: Mentionable[],
		priorityOrder?: bigint,
		reason?: string,
	) {
		const result = db.transaction(() => {
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

			const updatedQueueIds = uniq(insertedPrioritized.flatMap(prioritized =>
				store.dbEventQueues(prioritized.eventId).map(eq => eq.queueId)
			));

			return { insertedPrioritized, updatedQueueIds };
		});

		reEvaluatePrioritized(store, result.updatedQueueIds);

		return result;
	}

	export function insertGuildPrioritized(
		store: Store,
		mentionables: Mentionable[],
		priorityOrder?: bigint,
		reason?: string,
	) {
		const result = db.transaction(() => {
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
			const updatedQueueIds = insertedPrioritized.length
				? uniq([...store.dbQueues().values()].map(queue => queue.id))
				: [];

			return { insertedPrioritized, updatedQueueIds };
		});

		reEvaluatePrioritized(store, result.updatedQueueIds);

		return result;
	}

	export function updatePrioritized(store: Store, prioritizedIds: bigint[], update: Partial<DbPrioritized>) {
		const result = db.transaction(() => {
			const updatedPrioritized = compact(prioritizedIds.map(id => store.updatePrioritized({ id, ...update })));
			const updatedQueueIds = uniq(updatedPrioritized.map(prioritized => prioritized.queueId));
			return { updatedPrioritized, updatedQueueIds };
		});

		reEvaluatePrioritized(store, result.updatedQueueIds);

		return result;
	}

	export function updateEventPrioritized(store: Store, prioritizedIds: bigint[], update: Partial<DbEventPrioritized>) {
		const result = db.transaction(() => {
			const updatedPrioritized = compact(prioritizedIds.map(id => store.updateEventPrioritized({ id, ...update })));
			const updatedQueueIds = uniq(updatedPrioritized.flatMap(prioritized =>
				store.dbEventQueues(prioritized.eventId).map(eq => eq.queueId)
			));
			return { updatedPrioritized, updatedQueueIds };
		});

		reEvaluatePrioritized(store, result.updatedQueueIds);

		return result;
	}

	export function updateGuildPrioritized(store: Store, prioritizedIds: bigint[], update: Partial<DbGuildPrioritized>) {
		const result = db.transaction(() => {
			const updatedPrioritized = compact(prioritizedIds.map(id => store.updateGuildPrioritized({ id, ...update })));
			const updatedQueueIds = updatedPrioritized.length
				? uniq([...store.dbQueues().values()].map(queue => queue.id))
				: [];
			return { updatedPrioritized, updatedQueueIds };
		});

		reEvaluatePrioritized(store, result.updatedQueueIds);

		return result;
	}

	export function deletePrioritized(store: Store, prioritizedIds: bigint[]) {
		const result = db.transaction(() => {
			const deletedPrioritized = compact(prioritizedIds.map(id => store.deletePrioritized({ id })));
			const updatedQueueIds = uniq(deletedPrioritized.map(prioritized => prioritized.queueId));
			return { deletedPrioritized, updatedQueueIds };
		});

		reEvaluatePrioritized(store, result.updatedQueueIds);

		return result;
	}

	export function deleteEventPrioritized(store: Store, prioritizedIds: bigint[]) {
		const result = db.transaction(() => {
			const deletedPrioritized = compact(prioritizedIds.map(id => store.deleteEventPrioritized({ id })));
			const updatedQueueIds = uniq(deletedPrioritized.flatMap(prioritized =>
				store.dbEventQueues(prioritized.eventId).map(eq => eq.queueId)
			));
			return { deletedPrioritized, updatedQueueIds };
		});

		reEvaluatePrioritized(store, result.updatedQueueIds);

		return result;
	}

	export function deleteGuildPrioritized(store: Store, prioritizedIds: bigint[]) {
		const result = db.transaction(() => {
			const deletedPrioritized = compact(prioritizedIds.map(id => store.deleteGuildPrioritized({ id })));
			const updatedQueueIds = deletedPrioritized.length
				? uniq([...store.dbQueues().values()].map(queue => queue.id))
				: [];
			return { deletedPrioritized, updatedQueueIds };
		});

		reEvaluatePrioritized(store, result.updatedQueueIds);

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
				const priorityOrder = getMemberPriority(store, queueId, jsMember);
				store.updateMember({ ...member, priorityOrder });
			}
		}
		DisplayUtils.requestDisplaysUpdate({ store, queueIds });
	}
}
