import { ActionRowBuilder, EmbedBuilder, type ModalActionRowComponentBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, time, TimestampStyles } from "discord.js";
import moment from "moment-timezone";

import { Queries } from "../db/queries.ts";
import { Color } from "../types/db.types.ts";
import type { ModalInteraction } from "../types/interaction.types.ts";
import { CustomError } from "../utils/error.utils.ts";
import { EventUtils } from "../utils/event.utils.ts";
import { ModalUtils } from "../utils/modal.utils.ts";
import { eventMention } from "../utils/string.utils.ts";

export namespace EventScheduleModal {
	export const ID = "event-schedule";

	const DATE_FIELD_ID = "date";
	const TIME_FIELD_ID = "time";
	const TIMEZONE_FIELD_ID = "timezone";

	export function getModal({ eventId }: { eventId: bigint }) {
		const customId = ModalUtils.encodeCustomId(ID, eventId);
		const modal = new ModalBuilder()
			.setCustomId(customId)
			.setTitle("Schedule Event Occurrence");

		const dateInput = new TextInputBuilder()
			.setCustomId(DATE_FIELD_ID)
			.setLabel("Start date")
			.setPlaceholder("YYYY-MM-DD")
			.setStyle(TextInputStyle.Short)
			.setRequired(true)
			.setMinLength(10)
			.setMaxLength(10);

		const timeInput = new TextInputBuilder()
			.setCustomId(TIME_FIELD_ID)
			.setLabel("Start time (24-hour)")
			.setPlaceholder("HH:MM")
			.setStyle(TextInputStyle.Short)
			.setRequired(true)
			.setMinLength(5)
			.setMaxLength(5);

		const timezoneInput = new TextInputBuilder()
			.setCustomId(TIMEZONE_FIELD_ID)
			.setLabel("Timezone (optional)")
			.setPlaceholder(process.env.DEFAULT_SCHEDULE_TIMEZONE ?? "UTC")
			.setStyle(TextInputStyle.Short)
			.setRequired(false)
			.setMaxLength(64);

		modal.addComponents(
			new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(dateInput),
			new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(timeInput),
			new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(timezoneInput),
		);

		return modal;
	}

	export async function handle(inter: ModalInteraction) {
		const { queueId: eventId } = ModalUtils.decodeCustomId(inter.customId);

		const event = Queries.selectEvent({ guildId: inter.store.guild.id, id: eventId });
		if (!event) {
			throw new CustomError({ message: "Event not found" });
		}

		const dateStr = inter.fields.getTextInputValue(DATE_FIELD_ID);
		const timeStr = inter.fields.getTextInputValue(TIME_FIELD_ID);
		let timezoneStr: string;
		try {
			timezoneStr = inter.fields.getTextInputValue(TIMEZONE_FIELD_ID);
		}
		catch (e) {
			console.error(`EventScheduleModal.handle: timezone field missing, defaulting to "":`, e);
			timezoneStr = "";
		}

		const tz = timezoneStr || process.env.DEFAULT_SCHEDULE_TIMEZONE || "UTC";
		const parsed = moment.tz(`${dateStr} ${timeStr}`, "YYYY-MM-DD HH:mm", tz);

		if (!parsed.isValid()) {
			throw new CustomError({ message: "Invalid date/time. Use YYYY-MM-DD and HH:MM formats." });
		}

		const startTimeMs = BigInt(parsed.valueOf());

		const occurrence = await EventUtils.scheduleOccurrence(
			inter.store,
			event,
			startTimeMs,
			timezoneStr || undefined,
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
				`**Cleans up:** ${time(new Date(Number(occurrence.startTime) + Number(event.cleanupOffsetMs)), TimestampStyles.RelativeTime)}`,
			);

		await inter.respond({ embeds: [embed] });
	}
}
