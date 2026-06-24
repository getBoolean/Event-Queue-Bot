import { EmbedBuilder, inlineCode } from "discord.js";

import { Queries } from "../../../db/queries.ts";
import type { SlashInteraction } from "../../../types/interaction.types.ts";
import { CustomError, EventNotFoundWarning } from "../../../utils/error.utils.ts";
import { EventUtils } from "../../../utils/event.utils.ts";
import { EventChannelUtils } from "../../../utils/event-channel.utils.ts";
import { commandMention, eventMention } from "../../../utils/string.utils.ts";
import { EventsOptions } from "./options.ts";
import { DISCORD_MESSAGE_LIMIT, renderSyncReport } from "./shared.ts";

export namespace EventsChannelsHandlers {
	export async function addRoomChannel(inter: SlashInteraction) {
		const event = await EventsOptions.ADD_ROOM_CHANNEL_OPTIONS.event.get(inter);
		EventUtils.assertHasRoomCategoryForChannelSync(event);
		const suffix = EventsOptions.ADD_ROOM_CHANNEL_OPTIONS.suffix.get(inter);
		const slowmode = EventsOptions.ADD_ROOM_CHANNEL_OPTIONS.slowmode.get(inter);
		const slowmodeTime = EventsOptions.ADD_ROOM_CHANNEL_OPTIONS.slowmodeTime.get(inter);
		const slowmodeSeconds = EventChannelUtils.toSlowmodeSeconds(slowmode, slowmodeTime);

		const cleanSuffix = suffix.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
		if (!cleanSuffix) {
			throw new CustomError({
				message: "Suffix must contain at least one alphanumeric character.",
			});
		}

		inter.store.insertRoomChannelTemplate({
			guildId: inter.guildId,
			eventId: event.id,
			suffix: cleanSuffix,
			slowmodeSeconds: slowmodeSeconds > 0 ? BigInt(slowmodeSeconds) : null,
		});

		const report = await EventChannelUtils.reconcileRoomChannels(inter.store, event);

		const adoptedSuffix = report.adopted.length > 0
			? ` Adopted ${report.adopted.length} existing channel${report.adopted.length === 1 ? "" : "s"}.`
			: "";
		await inter.respond(
			`Added ${inlineCode(`room-${cleanSuffix}-{N}`)} channel template to ${eventMention(event)}${slowmodeSeconds > 0 ? ` (slowmode: ${slowmodeSeconds}s)` : ""}.${adoptedSuffix}`,
			true,
		);
	}

	export async function removeRoomChannel(inter: SlashInteraction) {
		const event = await EventsOptions.REMOVE_ROOM_CHANNEL_OPTIONS.event.get(inter);
		EventUtils.assertHasRoomCategoryForChannelSync(event);
		const suffix = EventsOptions.REMOVE_ROOM_CHANNEL_OPTIONS.suffix.get(inter);

		const templates = Queries.selectManyRoomChannelTemplates({ guildId: inter.guildId, eventId: event.id });
		const tmpl = templates.find(t => t.suffix === suffix);
		if (!tmpl) {
			throw new CustomError({
				message: `No channel template with suffix ${inlineCode(suffix)} found for ${eventMention(event)}.`,
			});
		}

		EventChannelUtils.untrackChannelsForSuffix(inter.store, event, suffix);
		inter.store.deleteRoomChannelTemplate({ eventId: event.id, suffix });

		await inter.respond(
			`Removed ${inlineCode(`room-${suffix}-{N}`)} channel template from ${eventMention(event)}. Existing channels are left in place — re-adding the template will adopt them.`,
			true,
		);
	}

	export async function syncRoomChannels(inter: SlashInteraction) {
		const event = await EventsOptions.SYNC_ROOM_CHANNELS_OPTIONS.event.get(inter).catch((e: unknown) => {
			if (e instanceof EventNotFoundWarning) return undefined;
			throw e;
		});

		if (event) {
			EventUtils.assertHasRoomCategoryForChannelSync(event);
			const report = await EventChannelUtils.reconcileRoomChannels(inter.store, event);
			await inter.respond(renderSyncReport(report), true);
			return;
		}

		const allEvents = [...inter.store.dbEvents().values()];
		const targeted = allEvents.filter(e => !!e.roomCategoryId);

		if (targeted.length === 0) {
			await inter.respond(`No events have a ${inlineCode("room_category")} configured. Set one with ${commandMention("events", "set")}.`);
			return;
		}

		const { reports, skipped } = await EventChannelUtils.reconcileAllGuildEvents(inter.store);

		const skippedSuffix = skipped.length > 0
			? `, skipped ${skipped.length} event(s) already in progress: ${skipped.map(e => inlineCode(e.name)).join(", ")}`
			: "";
		const header = `Synced room channels for ${reports.length} event(s)${skippedSuffix}:`;
		const blocks = reports.map(renderSyncReport);
		const combined = `${header}\n\n${blocks.join("\n\n")}`;

		if (combined.length <= DISCORD_MESSAGE_LIMIT) {
			await inter.respond(combined, true);
		}
		else {
			const embed = new EmbedBuilder().setTitle(header);
			for (const report of reports) {
				embed.addFields({
					name: report.eventName,
					value: renderSyncReport(report).split("\n").slice(1).join("\n") || "(no changes)",
				});
			}
			await inter.respond({ embeds: [embed] }, true);
		}
	}
}
