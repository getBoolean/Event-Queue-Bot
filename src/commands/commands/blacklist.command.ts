import { type Collection, EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { compact } from "lodash-es";

import { BLACKLISTED_TABLE, type DbEvent } from "../../db/schema.ts";
import { BlacklistedsOption, type ScopedBlacklistedSelection } from "../../options/options/blacklisteds.option.ts";
import { EventsOption } from "../../options/options/events.option.ts";
import { MentionableOption } from "../../options/options/mentionable.option.ts";
import { QueuesOption } from "../../options/options/queues.option.ts";
import { ReasonOption } from "../../options/options/reason.option.ts";
import { ScopeOption } from "../../options/options/scope.option.ts";
import { AdminCommand } from "../../types/command.types.ts";
import { Color, ListScope } from "../../types/db.types.ts";
import type { SlashInteraction } from "../../types/interaction.types.ts";
import { BlacklistUtils } from "../../utils/blacklist.utils.ts";
import { CustomError } from "../../utils/error.utils.ts";
import {
	describeTable,
	eventMention,
	mentionableMention,
	mentionablesMention,
	queueMention,
	queuesMention,
} from "../../utils/string.utils.ts";

export class BlacklistCommand extends AdminCommand {
	static readonly ID = "blacklist";

	blacklist_get = BlacklistCommand.blacklist_get;
	blacklist_add = BlacklistCommand.blacklist_add;
	blacklist_delete = BlacklistCommand.blacklist_delete;

	ephemeralSubcommands = new Set(["blacklist_get"]);

	data = new SlashCommandBuilder()
		.setName(BlacklistCommand.ID)
		.setDescription("Manage blacklisted users and roles")
		.addSubcommand(subcommand => {
			subcommand
				.setName("get")
				.setDescription("Get blacklisted users and roles");
			Object.values(BlacklistCommand.GET_OPTIONS).forEach(option => option.addToCommand(subcommand));
			return subcommand;
		})
		.addSubcommand(subcommand => {
			subcommand
				.setName("add")
				.setDescription("Blacklist users and roles");
			Object.values(BlacklistCommand.ADD_OPTIONS).forEach(option => option.addToCommand(subcommand));
			return subcommand;
		})
		.addSubcommand(subcommand => {
			subcommand
				.setName("delete")
				.setDescription("Un-blacklist users and roles");
			Object.values(BlacklistCommand.DELETE_OPTIONS).forEach(option => option.addToCommand(subcommand));
			return subcommand;
		});

	// ====================================================================
	//                           /blacklist get
	// ====================================================================

	static readonly GET_OPTIONS = {
		scope: new ScopeOption({ description: "Scope to list (defaults to all scopes)" }),
		queues: new QueuesOption({ description: "Filter by queue(s) (queue scope)" }),
		events: new EventsOption({ description: "Filter by event(s) (event scope)" }),
	};

	static async blacklist_get(inter: SlashInteraction) {
		const scopeRaw = BlacklistCommand.GET_OPTIONS.scope.get(inter) as ListScope | null;

		const embeds: EmbedBuilder[] = [];
		const contents: string[] = [];

		if (!scopeRaw || scopeRaw === ListScope.Queue) {
			const queues = (await BlacklistCommand.GET_OPTIONS.queues.get(inter)) ?? inter.store.dbQueues();
			const rows = inter.store.dbBlacklisted().filter(row => queues.has(row.queueId));
			const part = describeTable({
				store: inter.store,
				table: BLACKLISTED_TABLE,
				tableLabel: "Blacklisted (per-queue)",
				entryLabelProperty: "subjectId",
				entries: [...rows.values()],
				color: Color.Black,
			});
			collectDescribe(embeds, contents, part);
		}

		if (!scopeRaw || scopeRaw === ListScope.Event) {
			const events = (await BlacklistCommand.GET_OPTIONS.events.get(inter)) ?? inter.store.dbEvents();
			const rows = inter.store.dbEventBlacklisted().filter(row => events.has(row.eventId));
			embeds.push(...buildEventScopedEmbeds(rows, events, "Blacklisted (event-wide)", Color.Black));
		}

		if (!scopeRaw || scopeRaw === ListScope.Global) {
			const rows = inter.store.dbGuildBlacklisted();
			embeds.push(...buildGlobalScopedEmbeds(rows, "Blacklisted (global)", Color.Black));
		}

		if (embeds.length === 0 && contents.length === 0) {
			await inter.respond("No blacklisted entries found.");
			return;
		}

		await inter.respond({
			content: contents.length ? contents.join("\n") : undefined,
			embeds: embeds.length ? embeds : undefined,
		});
	}

	// ====================================================================
	//                           /blacklist add
	// ====================================================================

	static readonly ADD_OPTIONS = {
		scope: new ScopeOption({ required: true, description: "Scope to blacklist in" }),
		queues: new QueuesOption({ description: "Queue(s) — required when scope is queue" }),
		events: new EventsOption({ description: "Event(s) — required when scope is event" }),
		mentionable1: new MentionableOption({ required: true, id: "mentionable_1", description: "User/role to blacklist" }),
		mentionable2: new MentionableOption({ id: "mentionable_2", description: "User/role to blacklist" }),
		mentionable3: new MentionableOption({ id: "mentionable_3", description: "User/role to blacklist" }),
		mentionable4: new MentionableOption({ id: "mentionable_4", description: "User/role to blacklist" }),
		mentionable5: new MentionableOption({ id: "mentionable_5", description: "User/role to blacklist" }),
		reason: new ReasonOption({ description: "Reason for blacklisting" }),
	};

	static async blacklist_add(inter: SlashInteraction) {
		const scope = parseScopeRequired(BlacklistCommand.ADD_OPTIONS.scope.get(inter));
		const mentionables = compact([
			BlacklistCommand.ADD_OPTIONS.mentionable1.get(inter),
			BlacklistCommand.ADD_OPTIONS.mentionable2.get(inter),
			BlacklistCommand.ADD_OPTIONS.mentionable3.get(inter),
			BlacklistCommand.ADD_OPTIONS.mentionable4.get(inter),
			BlacklistCommand.ADD_OPTIONS.mentionable5.get(inter),
		]);
		const reason = BlacklistCommand.ADD_OPTIONS.reason.get(inter);

		if (scope === ListScope.Queue) {
			const queues = await BlacklistCommand.ADD_OPTIONS.queues.get(inter);
			if (!queues || queues.size === 0) throw new CustomError({ message: "Queue scope requires the `queues` option." });
			const { updatedQueueIds, insertedBlacklisted } = await BlacklistUtils.insertQueueBlacklisted(inter.store, queues, mentionables, reason);
			const updatedQueues = updatedQueueIds.map(id => inter.store.dbQueues().get(id));
			await inter.respond(`Blacklisted ${mentionablesMention(insertedBlacklisted)} from the ${queuesMention(updatedQueues)} queue${updatedQueues.length > 1 ? "s" : ""}.`, true);
		}
		else if (scope === ListScope.Event) {
			const events = await BlacklistCommand.ADD_OPTIONS.events.get(inter);
			if (!events || events.size === 0) throw new CustomError({ message: "Event scope requires the `events` option." });
			const { insertedBlacklisted } = await BlacklistUtils.insertEventBlacklisted(inter.store, events, mentionables, reason);
			await inter.respond(`Blacklisted ${mentionablesMention(insertedBlacklisted)} from the ${[...events.values()].map(eventMention).join(", ")} event${events.size > 1 ? "s" : ""}.`, true);
		}
		else {
			const { insertedBlacklisted } = await BlacklistUtils.insertGuildBlacklisted(inter.store, mentionables, reason);
			await inter.respond(`Blacklisted ${mentionablesMention(insertedBlacklisted)} from all queues in this server.`, true);
		}
	}

	// ====================================================================
	//                           /blacklist delete
	// ====================================================================

	static readonly DELETE_OPTIONS = {
		scope: new ScopeOption({ required: true, description: "Scope to delete from" }),
		blacklisteds: new BlacklistedsOption({
			required: true,
			description: "Entries to un-blacklist",
		}),
	};

	static async blacklist_delete(inter: SlashInteraction) {
		const selection: ScopedBlacklistedSelection | null = await BlacklistCommand.DELETE_OPTIONS.blacklisteds.get(inter);
		if (!selection || selection.entries.size === 0) {
			await inter.respond("No entries selected.");
			return;
		}

		if (selection.scope === ListScope.Queue) {
			const { deletedBlacklisted } = BlacklistUtils.deleteBlacklisted(inter.store, [...selection.entries.keys()]);
			const lines = deletedBlacklisted.map(row => {
				const queue = inter.store.dbQueues().get(row.queueId);
				return `- ${mentionableMention(row)} in ${queue ? queueMention(queue) : "unknown queue"}`;
			});
			await inter.respond(`Un-blacklisted:\n${lines.join("\n")}`, true);
		}
		else if (selection.scope === ListScope.Event) {
			const { deletedBlacklisted } = BlacklistUtils.deleteEventBlacklisted(inter.store, [...selection.entries.keys()]);
			const lines = deletedBlacklisted.map(row => {
				const event = inter.store.dbEvents().get(row.eventId);
				return `- ${mentionableMention(row)} from ${event ? eventMention(event) : "unknown event"}`;
			});
			await inter.respond(`Un-blacklisted (event):\n${lines.join("\n")}`, true);
		}
		else {
			const { deletedBlacklisted } = BlacklistUtils.deleteGuildBlacklisted(inter.store, [...selection.entries.keys()]);
			const lines = deletedBlacklisted.map(row => `- ${mentionableMention(row)} (global)`);
			await inter.respond(`Un-blacklisted (global):\n${lines.join("\n")}`, true);
		}
	}
}

// ====================================================================
//                Helpers shared with /whitelist and /prioritize
// ====================================================================

export function parseScopeRequired(raw: string | null): ListScope {
	if (raw === ListScope.Queue || raw === ListScope.Event || raw === ListScope.Global) {
		return raw;
	}
	throw new CustomError({ message: "Missing required `scope` option (queue, event, or global)." });
}

export function collectDescribe(embeds: EmbedBuilder[], contents: string[], result: { content?: string, embeds?: EmbedBuilder[] }) {
	if (result.embeds?.length) embeds.push(...result.embeds);
	if (result.content) contents.push(result.content);
}

export function buildEventScopedEmbeds<T extends { id: bigint, eventId: bigint, subjectId: string, isRole: boolean, reason?: string }>(
	rows: Collection<bigint, T>,
	events: Collection<bigint, DbEvent>,
	tableLabel: string,
	color: Color,
	extraField?: (row: T) => string,
): EmbedBuilder[] {
	const embeds: EmbedBuilder[] = [];
	for (const event of events.values()) {
		const eventRows = [...rows.values()].filter(row => row.eventId === event.id);
		if (eventRows.length === 0) continue;
		const lines = eventRows.map(row => {
			const base = `- ${mentionableMention(row)}`;
			const extras = compact([extraField?.(row), row.reason ? `reason: ${row.reason}` : null]);
			return extras.length ? `${base} (${extras.join(", ")})` : base;
		});
		embeds.push(new EmbedBuilder()
			.setTitle(`${eventMention(event)} ${tableLabel.toLowerCase()}`)
			.setColor(color)
			.setDescription(lines.join("\n")));
	}
	return embeds;
}

export function buildGlobalScopedEmbeds<T extends { id: bigint, subjectId: string, isRole: boolean, reason?: string }>(
	rows: Collection<bigint, T>,
	tableLabel: string,
	color: Color,
	extraField?: (row: T) => string,
): EmbedBuilder[] {
	if (rows.size === 0) return [];
	const lines = [...rows.values()].map(row => {
		const base = `- ${mentionableMention(row)}`;
		const extras = compact([extraField?.(row), row.reason ? `reason: ${row.reason}` : null]);
		return extras.length ? `${base} (${extras.join(", ")})` : base;
	});
	return [new EmbedBuilder()
		.setTitle(tableLabel)
		.setColor(color)
		.setDescription(lines.join("\n"))];
}
