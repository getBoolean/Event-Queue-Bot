import { EmbedBuilder, roleMention, userMention } from "discord.js";
import { compact } from "lodash-es";

import { Queries } from "../../../db/queries.ts";
import { Color } from "../../../types/db.types.ts";
import type { SlashInteraction } from "../../../types/interaction.types.ts";
import { WinnerRoleNotSetWarning } from "../../../utils/error.utils.ts";
import { eventMention } from "../../../utils/string.utils.ts";
import { WinnerUtils } from "../../../utils/winner.utils.ts";
import { EventsOptions } from "./options.ts";

export namespace EventsWinnersHandlers {
	export async function declareWinners(inter: SlashInteraction) {
		const event = await EventsOptions.DECLARE_WINNERS_OPTIONS.event.get(inter);
		if (!event.winnerRoleId) {
			throw new WinnerRoleNotSetWarning();
		}

		const userIds = new Set(compact([
			EventsOptions.DECLARE_WINNERS_OPTIONS.winner1.get(inter),
			EventsOptions.DECLARE_WINNERS_OPTIONS.winner2.get(inter),
			EventsOptions.DECLARE_WINNERS_OPTIONS.winner3.get(inter),
			EventsOptions.DECLARE_WINNERS_OPTIONS.winner4.get(inter),
			EventsOptions.DECLARE_WINNERS_OPTIONS.winner5.get(inter),
		]).map(user => user.id));

		const added = await WinnerUtils.declareWinners(inter.store, event, userIds);

		if (added.length === 0) {
			await inter.respond(`No new winners added to ${eventMention(event)} — all selected users are already winners.`, true);
			return;
		}

		const mentions = added.map(userMention).join(", ");
		await inter.respond(
			`Granted ${roleMention(event.winnerRoleId)} to ${mentions} as winner(s) of ${eventMention(event)}.`,
			true,
		);
	}

	export async function winners(inter: SlashInteraction) {
		const event = await EventsOptions.WINNERS_OPTIONS.event.get(inter);

		const rows = Queries.selectManyEventWinners({ guildId: inter.guildId, eventId: event.id });
		const roleLine = `Winner role: ${event.winnerRoleId ? roleMention(event.winnerRoleId) : "not set"}`;

		if (rows.length === 0) {
			await inter.respond(`No winners declared yet for ${eventMention(event)}.\n${roleLine}`);
			return;
		}

		const winnerList = rows.map(r => userMention(r.userId)).join(", ");

		const embed = new EmbedBuilder()
			.setTitle(`Winners — ${event.name}`)
			.setColor(Color.Gold)
			.setDescription(`${winnerList}\n\n${roleLine}`);

		await inter.respond({ embeds: [embed] });
	}

	export async function clearWinners(inter: SlashInteraction) {
		const event = await EventsOptions.CLEAR_WINNERS_OPTIONS.event.get(inter);

		const removals = await WinnerUtils.clearEventWinners(inter.store, event);

		await inter.respond(
			`Cleared winners for ${eventMention(event)}. Revoked the role from ${removals.length} member(s).`,
			true,
		);
	}
}
