import { Role } from "discord.js";
import { uniq } from "lodash-es";

import { db } from "../db/db.ts";
import type { DbEvent, DbQueue } from "../db/schema.ts";
import type { Store } from "../db/store.ts";
import type { ArrayOrCollection } from "../types/misc.types.ts";
import type { Mentionable } from "../types/parsing.types.ts";
import { map } from "./misc.utils.ts";

export namespace SubjectListUtils {

	export function mentionableFilter(mentionable: Mentionable) {
		return mentionable instanceof Role ? { roleId: mentionable.id } : { userId: mentionable.id };
	}

	export async function runTransaction<T>(fn: () => Promise<T>): Promise<T> {
		return db.transaction(fn);
	}

	export function updatedQueueIdsForQueueScope(rows: { queueId: bigint }[]): bigint[] {
		return uniq(rows.map(row => row.queueId));
	}

	export function updatedQueueIdsForEventScope(store: Store, rows: { eventId: bigint }[]): bigint[] {
		return uniq(rows.flatMap(row => store.dbEventQueues(row.eventId).map(eq => eq.queueId)));
	}

	export function updatedQueueIdsForGuildScope(store: Store, rowCount: number): bigint[] {
		return rowCount ? uniq([...store.dbQueues().values()].map(queue => queue.id)) : [];
	}

	export function eventQueuesForEvents(
		store: Store,
		events: ArrayOrCollection<bigint, DbEvent>,
	): DbQueue[] {
		return map(events, event =>
			store.dbEventQueues(event.id)
				.map(eq => store.dbQueues().get(eq.queueId))
				.filter(Boolean) as DbQueue[]
		).flat();
	}

}
