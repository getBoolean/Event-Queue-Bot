import { inlineCode } from "discord.js";

import { type DbEvent } from "../../../db/schema.ts";
import type { SlashInteraction } from "../../../types/interaction.types.ts";
import { EventNotFoundWarning } from "../../../utils/error.utils.ts";
import { EventUtils } from "../../../utils/event.utils.ts";
import { EventSyncLock } from "../../../utils/event-sync-lock.utils.ts";
import { commandMention, eventMention } from "../../../utils/string.utils.ts";
import { EventsOptions } from "./options.ts";

export namespace EventsSyncHandlers {
	export async function syncQueues(inter: SlashInteraction) {
		const event = await EventsOptions.SYNC_QUEUES_OPTIONS.event.get(inter).catch((e: unknown) => {
			if (e instanceof EventNotFoundWarning) return undefined;
			throw e;
		});

		if (event) {
			const result = await EventUtils.syncEventQueues(inter.store, event);
			await inter.respond(
				`Synced queues for ${eventMention(event)}: recreated ${result.recreatedCount} queue(s), ` +
				`re-applied defaults to ${result.reappliedRoomCount} room + ${result.reappliedSubCount} sub queue(s), ` +
				`re-posted ${result.reshownCount} display(s).`,
				true,
			);
			return;
		}

		const allEvents = [...inter.store.dbEvents().values()];
		const targeted = allEvents.filter(e => !!e.roomCategoryId);

		if (targeted.length === 0) {
			await inter.respond(`No events have a ${inlineCode("room_category")} configured. Set one with ${commandMention("events", "set")}.`);
			return;
		}

		let recreatedTotal = 0;
		let reappliedRoomTotal = 0;
		let reappliedSubTotal = 0;
		let reshownTotal = 0;
		const skipped: DbEvent[] = [];
		for (const ev of targeted) {
			const result = await EventSyncLock.tryWithLock(inter.store.guild.id, ev.id, () =>
				EventUtils.syncEventQueues(inter.store, ev)
			);
			if (result === "skipped") {
				skipped.push(ev);
				continue;
			}
			recreatedTotal += result.recreatedCount;
			reappliedRoomTotal += result.reappliedRoomCount;
			reappliedSubTotal += result.reappliedSubCount;
			reshownTotal += result.reshownCount;
		}

		const syncedCount = targeted.length - skipped.length;
		const skippedSuffix = skipped.length > 0
			? `, skipped ${skipped.length} event(s) already in progress: ${skipped.map(e => inlineCode(e.name)).join(", ")}`
			: "";
		await inter.respond(
			`Synced queues for ${syncedCount} event(s): recreated ${recreatedTotal} queue(s), ` +
			`re-applied defaults to ${reappliedRoomTotal} room + ${reappliedSubTotal} sub queue(s), ` +
			`re-posted ${reshownTotal} display(s)${skippedSuffix}.`,
			true,
		);
	}
}
