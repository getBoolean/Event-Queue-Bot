import { EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { compact } from "lodash-es";

import { WHITELISTED_TABLE } from "../../db/schema.ts";
import { EventsOption } from "../../options/options/events.option.ts";
import { MentionableOption } from "../../options/options/mentionable.option.ts";
import { QueuesOption } from "../../options/options/queues.option.ts";
import { ReasonOption } from "../../options/options/reason.option.ts";
import { ScopeOption } from "../../options/options/scope.option.ts";
import { type ScopedWhitelistedSelection, WhitelistedsOption } from "../../options/options/whitelisteds.option.ts";
import { AdminCommand } from "../../types/command.types.ts";
import { Color, ListScope } from "../../types/db.types.ts";
import type { SlashInteraction } from "../../types/interaction.types.ts";
import { CustomError } from "../../utils/error.utils.ts";
import {
	describeTable,
	eventMention,
	mentionableMention,
	mentionablesMention,
	queueMention,
	queuesMention,
} from "../../utils/string.utils.ts";
import { WhitelistUtils } from "../../utils/whitelist.utils.ts";
import {
	buildEventScopedEmbeds,
	buildGlobalScopedEmbeds,
	collectDescribe,
	parseScopeRequired,
} from "./blacklist.command.ts";

export class WhitelistCommand extends AdminCommand {
	static readonly ID = "whitelist";

	whitelist_get = WhitelistCommand.whitelist_get;
	whitelist_add = WhitelistCommand.whitelist_add;
	whitelist_delete = WhitelistCommand.whitelist_delete;

	ephemeralSubcommands = new Set(["whitelist_get"]);

	data = new SlashCommandBuilder()
		.setName(WhitelistCommand.ID)
		.setDescription("Manage whitelisted users and roles")
		.addSubcommand(subcommand => {
			subcommand
				.setName("get")
				.setDescription("Get whitelisted users and roles");
			Object.values(WhitelistCommand.GET_OPTIONS).forEach(option => option.addToCommand(subcommand));
			return subcommand;
		})
		.addSubcommand(subcommand => {
			subcommand
				.setName("add")
				.setDescription("Whitelist users and roles");
			Object.values(WhitelistCommand.ADD_OPTIONS).forEach(option => option.addToCommand(subcommand));
			return subcommand;
		})
		.addSubcommand(subcommand => {
			subcommand
				.setName("delete")
				.setDescription("Un-whitelist users and roles");
			Object.values(WhitelistCommand.DELETE_OPTIONS).forEach(option => option.addToCommand(subcommand));
			return subcommand;
		});

	// ====================================================================
	//                           /whitelist get
	// ====================================================================

	static readonly GET_OPTIONS = {
		scope: new ScopeOption({ description: "Scope to list (defaults to all scopes)" }),
		queues: new QueuesOption({ description: "Filter by queue(s) (queue scope)" }),
		events: new EventsOption({ description: "Filter by event(s) (event scope)" }),
	};

	static async whitelist_get(inter: SlashInteraction) {
		const scopeRaw = WhitelistCommand.GET_OPTIONS.scope.get(inter) as ListScope | null;

		const embeds: EmbedBuilder[] = [];
		const contents: string[] = [];

		if (!scopeRaw || scopeRaw === ListScope.Queue) {
			const queues = (await WhitelistCommand.GET_OPTIONS.queues.get(inter)) ?? inter.store.dbQueues();
			const rows = inter.store.dbWhitelisted().filter(row => queues.has(row.queueId));
			const part = describeTable({
				store: inter.store,
				table: WHITELISTED_TABLE,
				tableLabel: "Whitelisted (per-queue)",
				entryLabelProperty: "subjectId",
				entries: [...rows.values()],
				color: Color.White,
			});
			collectDescribe(embeds, contents, part);
		}

		if (!scopeRaw || scopeRaw === ListScope.Event) {
			const events = (await WhitelistCommand.GET_OPTIONS.events.get(inter)) ?? inter.store.dbEvents();
			const rows = inter.store.dbEventWhitelisted().filter(row => events.has(row.eventId));
			embeds.push(...buildEventScopedEmbeds(rows, events, "Whitelisted (event-wide)", Color.White));
		}

		if (!scopeRaw || scopeRaw === ListScope.Global) {
			const rows = inter.store.dbGuildWhitelisted();
			embeds.push(...buildGlobalScopedEmbeds(rows, "Whitelisted (global)", Color.White));
		}

		if (embeds.length === 0 && contents.length === 0) {
			await inter.respond("No whitelisted entries found.");
			return;
		}

		await inter.respond({
			content: contents.length ? contents.join("\n") : undefined,
			embeds: embeds.length ? embeds : undefined,
		});
	}

	// ====================================================================
	//                           /whitelist add
	// ====================================================================

	// Discord requires required options before non-required ones, so mentionable1 sits next to scope.
	static readonly ADD_OPTIONS = {
		scope: new ScopeOption({ required: true, description: "Scope to whitelist in" }),
		mentionable1: new MentionableOption({ required: true, id: "mentionable_1", description: "User/role to whitelist" }),
		queues: new QueuesOption({ description: "Queue(s) — required when scope is queue" }),
		events: new EventsOption({ description: "Event(s) — required when scope is event" }),
		mentionable2: new MentionableOption({ id: "mentionable_2", description: "User/role to whitelist" }),
		mentionable3: new MentionableOption({ id: "mentionable_3", description: "User/role to whitelist" }),
		mentionable4: new MentionableOption({ id: "mentionable_4", description: "User/role to whitelist" }),
		mentionable5: new MentionableOption({ id: "mentionable_5", description: "User/role to whitelist" }),
		reason: new ReasonOption({ description: "Reason for whitelisting" }),
	};

	static async whitelist_add(inter: SlashInteraction) {
		const scope = parseScopeRequired(WhitelistCommand.ADD_OPTIONS.scope.get(inter));
		const mentionables = compact([
			WhitelistCommand.ADD_OPTIONS.mentionable1.get(inter),
			WhitelistCommand.ADD_OPTIONS.mentionable2.get(inter),
			WhitelistCommand.ADD_OPTIONS.mentionable3.get(inter),
			WhitelistCommand.ADD_OPTIONS.mentionable4.get(inter),
			WhitelistCommand.ADD_OPTIONS.mentionable5.get(inter),
		]);
		const reason = WhitelistCommand.ADD_OPTIONS.reason.get(inter);

		if (scope === ListScope.Queue) {
			const queues = await WhitelistCommand.ADD_OPTIONS.queues.get(inter);
			if (!queues || queues.size === 0) throw new CustomError({ message: "Queue scope requires the `queues` option." });
			const { updatedQueueIds, insertedWhitelisted } = WhitelistUtils.insertQueueWhitelisted(inter.store, queues, mentionables, reason);
			const updatedQueues = updatedQueueIds.map(id => inter.store.dbQueues().get(id));
			await inter.respond(`Whitelisted ${mentionablesMention(insertedWhitelisted)} in the ${queuesMention(updatedQueues)} queue${updatedQueues.length > 1 ? "s" : ""}.`, true);
		}
		else if (scope === ListScope.Event) {
			const events = await WhitelistCommand.ADD_OPTIONS.events.get(inter);
			if (!events || events.size === 0) throw new CustomError({ message: "Event scope requires the `events` option." });
			const { insertedWhitelisted } = WhitelistUtils.insertEventWhitelisted(inter.store, events, mentionables, reason);
			await inter.respond(`Whitelisted ${mentionablesMention(insertedWhitelisted)} in the ${[...events.values()].map(eventMention).join(", ")} event${events.size > 1 ? "s" : ""}.`, true);
		}
		else {
			const { insertedWhitelisted } = WhitelistUtils.insertGuildWhitelisted(inter.store, mentionables, reason);
			await inter.respond(`Whitelisted ${mentionablesMention(insertedWhitelisted)} in all queues in this server.`, true);
		}
	}

	// ====================================================================
	//                           /whitelist delete
	// ====================================================================

	static readonly DELETE_OPTIONS = {
		scope: new ScopeOption({ required: true, description: "Scope to delete from" }),
		whitelisteds: new WhitelistedsOption({
			required: true,
			description: "Entries to un-whitelist",
		}),
	};

	static async whitelist_delete(inter: SlashInteraction) {
		const selection: ScopedWhitelistedSelection | null = await WhitelistCommand.DELETE_OPTIONS.whitelisteds.get(inter);
		if (!selection || selection.entries.size === 0) {
			await inter.respond("No entries selected.");
			return;
		}

		if (selection.scope === ListScope.Queue) {
			const { deletedWhitelisted } = WhitelistUtils.deleteWhitelisted(inter.store, [...selection.entries.keys()]);
			const lines = deletedWhitelisted.map(row => {
				const queue = inter.store.dbQueues().get(row.queueId);
				return `- ${mentionableMention(row)} in ${queue ? queueMention(queue) : "unknown queue"}`;
			});
			await inter.respond(`Un-whitelisted:\n${lines.join("\n")}`, true);
		}
		else if (selection.scope === ListScope.Event) {
			const { deletedWhitelisted } = WhitelistUtils.deleteEventWhitelisted(inter.store, [...selection.entries.keys()]);
			const lines = deletedWhitelisted.map(row => {
				const event = inter.store.dbEvents().get(row.eventId);
				return `- ${mentionableMention(row)} from ${event ? eventMention(event) : "unknown event"}`;
			});
			await inter.respond(`Un-whitelisted (event):\n${lines.join("\n")}`, true);
		}
		else {
			const { deletedWhitelisted } = WhitelistUtils.deleteGuildWhitelisted(inter.store, [...selection.entries.keys()]);
			const lines = deletedWhitelisted.map(row => `- ${mentionableMention(row)} (global)`);
			await inter.respond(`Un-whitelisted (global):\n${lines.join("\n")}`, true);
		}
	}
}
