import { channelMention, inlineCode, PermissionsBitField } from "discord.js";
import { isNil, omitBy } from "lodash-es";

import type { SlashInteraction } from "../../../types/interaction.types.ts";
import { CustomError } from "../../../utils/error.utils.ts";
import { EventChannelUtils } from "../../../utils/event-channel.utils.ts";

export const HOURS_TO_MS = 3_600_000n;
export const MINUTES_TO_MS = 60_000n;

export function buildEventOffsetFields(opts: {
	roomLengthMinutes?: number | null
	createOffsetHours?: number | null
	lockOffsetMinutes?: number | null
	cleanupOffsetHours?: number | null
}) {
	return omitBy({
		roomLengthMs: opts.roomLengthMinutes ? BigInt(opts.roomLengthMinutes) * MINUTES_TO_MS : undefined,
		createOffsetMs: opts.createOffsetHours != null ? BigInt(opts.createOffsetHours) * HOURS_TO_MS : undefined,
		lockOffsetMs: opts.lockOffsetMinutes != null ? BigInt(opts.lockOffsetMinutes) * MINUTES_TO_MS : undefined,
		cleanupOffsetMs: opts.cleanupOffsetHours != null ? BigInt(opts.cleanupOffsetHours) * HOURS_TO_MS : undefined,
	}, isNil);
}

export function verifyMentionEveryonePermission(inter: SlashInteraction, message: string, channelId: string) {
	if (/@(everyone|here)/.test(message) && !inter.member.permissionsIn(channelId).has(PermissionsBitField.Flags.MentionEveryone)) {
		throw new CustomError({
			message: "Your announcement message contains @everyone or @here, but you lack the 'Mention Everyone' permission in the announcement channel",
		});
	}
}

export const DISCORD_MESSAGE_LIMIT = 2000;

export function renderSyncReport(report: EventChannelUtils.SyncReport): string {
	const lines: string[] = [`Synced room channels for **${report.eventName}**.`];

	const namedBucket = (label: string, names: string[]) => {
		if (names.length === 0) return;
		lines.push(`• ${label}: ${names.map(inlineCode).join(", ")}`);
	};

	namedBucket("Created", report.created);
	namedBucket("Adopted", report.adopted);
	namedBucket("Untracked rows", report.untrackedRows);
	namedBucket("Recreated missing", report.recreatedMissing);

	if (report.reorderApplied) {
		lines.push(`• Reorder: ${report.trackedCount} tracked channel${report.trackedCount === 1 ? "" : "s"} reordered.`);
	}
	else {
		lines.push("• Reorder: already in desired order (no changes).");
	}

	if (report.nonOwnedAtTop.length === 0) {
		lines.push("• Non-owned channels at top of category: (none)");
	}
	else {
		const mentions = report.nonOwnedAtTop.map(c => channelMention(c.id)).join(", ");
		lines.push(`• Non-owned channels at top of category (${report.nonOwnedAtTop.length}): ${mentions}`);
	}

	if (report.errors.length > 0) {
		lines.push(`• Errors: ${report.errors.map(inlineCode).join(", ")}`);
	}

	return lines.join("\n");
}
