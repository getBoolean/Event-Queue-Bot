import { EmbedBuilder, time, TimestampStyles } from "discord.js";

import { Queries } from "../../../db/queries.ts";
import { Color } from "../../../types/db.types.ts";
import type { SlashInteraction } from "../../../types/interaction.types.ts";
import { DateUtils } from "../../../utils/date.utils.ts";
import { EventUtils } from "../../../utils/event.utils.ts";
import { SelectMenuTransactor } from "../../../utils/message-utils/select-menu-transactor.ts";
import { eventMention } from "../../../utils/string.utils.ts";
import { EventsOptions } from "./options.ts";

export namespace EventsScheduleHandlers {
	export async function schedule(inter: SlashInteraction) {
		await inter.deferReply();

		const event = await EventsOptions.SCHEDULE_OPTIONS.event.get(inter);

		const yearStr = await EventsOptions.SCHEDULE_OPTIONS.year.get(inter);
		const monthStr = await EventsOptions.SCHEDULE_OPTIONS.month.get(inter);
		const dayStr = await EventsOptions.SCHEDULE_OPTIONS.day.get(inter);
		const startTime = await EventsOptions.SCHEDULE_OPTIONS.startTime.get(inter);
		const timezoneRaw = await EventsOptions.SCHEDULE_OPTIONS.timezone.get(inter);

		const parsed = DateUtils.parseScheduledStart({
			yearStr,
			monthStr,
			dayStr,
			startTime,
			timezone: timezoneRaw || process.env.DEFAULT_SCHEDULE_TIMEZONE || "UTC",
		});

		const startTimeMs = BigInt(parsed.valueOf());
		const occurrence = await EventUtils.scheduleOccurrence(
			inter.store,
			event,
			startTimeMs,
			timezoneRaw || undefined,
		);

		const startDate = new Date(Number(occurrence.startTime));
		const embed = new EmbedBuilder()
			.setTitle(`Scheduled ${event.name}`)
			.setColor(Color.Green)
			.setDescription(
				`Occurrence scheduled for ${time(startDate, TimestampStyles.LongDateTime)} (${time(startDate, TimestampStyles.RelativeTime)}).\n\n` +
				`**Event:** ${eventMention(event)}\n` +
				`**Opens:** ${time(new Date(Number(occurrence.startTime) - Number(event.createOffsetMs)), TimestampStyles.RelativeTime)}\n` +
				`**Locks rooms:** ${time(new Date(Number(occurrence.startTime) + Number(event.lockOffsetMs)), TimestampStyles.RelativeTime)}\n` +
				`**Cleans up:** ${time(new Date(EventUtils.getRoomsFinishMs(event, Number(occurrence.startTime)) + Number(event.cleanupOffsetMs)), TimestampStyles.RelativeTime)}`,
			);

		await inter.respond({ embeds: [embed] });
	}

	export async function cancel(inter: SlashInteraction) {
		await inter.deferReply();
		const event = await EventsOptions.CANCEL_OPTIONS.event.get(inter);
		const occurrences = Queries.selectManyOccurrences({ guildId: inter.guildId, eventId: event.id });

		if (occurrences.length === 0) {
			await inter.respond(`No pending occurrences for ${eventMention(event)}.`);
			return;
		}

		const selectMenuOptions = occurrences
			.sort((a, b) => Number(a.startTime) - Number(b.startTime))
			.map(occ => ({
				name: `${time(new Date(Number(occ.startTime)), TimestampStyles.LongDateTime)}`,
				value: occ.id.toString(),
			}));

		const selectMenuTransactor = new SelectMenuTransactor(inter);
		const result = await selectMenuTransactor.sendAndReceive("Select occurrence to cancel", selectMenuOptions);
		if (!result || result.length === 0) return;

		for (const idStr of result) {
			const occ = occurrences.find(o => o.id === BigInt(idStr));
			if (occ) {
				await EventUtils.cancelOccurrence(inter.store, occ);
			}
		}

		await inter.respond(
			`Cancelled ${result.length} occurrence(s) of ${eventMention(event)}. (NOTE: queues remain in their current state.)`,
			true,
		);
	}
}
