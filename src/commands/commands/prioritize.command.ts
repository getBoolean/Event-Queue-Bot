import { EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { compact } from "lodash-es";

import { PRIORITIZED_TABLE } from "../../db/schema.ts";
import { EventsOption } from "../../options/options/events.option.ts";
import { MentionableOption } from "../../options/options/mentionable.option.ts";
import { PrioritizedsOption, type ScopedPrioritizedSelection } from "../../options/options/prioritizeds.option.ts";
import { PriorityOrderOption } from "../../options/options/priority-order.option.ts";
import { QueuesOption } from "../../options/options/queues.option.ts";
import { ReasonOption } from "../../options/options/reason.option.ts";
import { ScopeOption } from "../../options/options/scope.option.ts";
import { AdminCommand } from "../../types/command.types.ts";
import { Color, ListScope } from "../../types/db.types.ts";
import type { SlashInteraction } from "../../types/interaction.types.ts";
import { CustomError } from "../../utils/error.utils.ts";
import { PriorityUtils } from "../../utils/priority.utils.ts";
import {
	describeTable,
	eventMention,
	mentionableMention,
	mentionablesMention,
	queueMention,
	queuesMention,
} from "../../utils/string.utils.ts";
import {
	buildEventScopedEmbeds,
	buildGlobalScopedEmbeds,
	collectDescribe,
	parseScopeRequired,
} from "./blacklist.command.ts";

export class PrioritizeCommand extends AdminCommand {
	static readonly ID = "prioritize";

	prioritize_get = PrioritizeCommand.prioritize_get;
	prioritize_add = PrioritizeCommand.prioritize_add;
	prioritize_update = PrioritizeCommand.prioritize_update;
	prioritize_delete = PrioritizeCommand.prioritize_delete;

	ephemeralSubcommands = new Set(["prioritize_get"]);

	data = new SlashCommandBuilder()
		.setName(PrioritizeCommand.ID)
		.setDescription("Manage prioritized users and roles")
		.addSubcommand(subcommand => {
			subcommand
				.setName("get")
				.setDescription("Get prioritized users and roles");
			Object.values(PrioritizeCommand.GET_OPTIONS).forEach(option => option.addToCommand(subcommand));
			return subcommand;
		})
		.addSubcommand(subcommand => {
			subcommand
				.setName("add")
				.setDescription("Prioritize users and roles");
			Object.values(PrioritizeCommand.ADD_OPTIONS).forEach(option => option.addToCommand(subcommand));
			return subcommand;
		})
		.addSubcommand(subcommand => {
			subcommand
				.setName("update")
				.setDescription("Update prioritized users and roles");
			Object.values(PrioritizeCommand.UPDATE_OPTIONS).forEach(option => option.addToCommand(subcommand));
			return subcommand;
		})
		.addSubcommand(subcommand => {
			subcommand
				.setName("delete")
				.setDescription("Un-prioritize users and roles");
			Object.values(PrioritizeCommand.DELETE_OPTIONS).forEach(option => option.addToCommand(subcommand));
			return subcommand;
		});

	// ====================================================================
	//                           /prioritize get
	// ====================================================================

	static readonly GET_OPTIONS = {
		scope: new ScopeOption({ description: "Scope to list (defaults to all scopes)" }),
		queues: new QueuesOption({ description: "Filter by queue(s) (queue scope)" }),
		events: new EventsOption({ description: "Filter by event(s) (event scope)" }),
	};

	static async prioritize_get(inter: SlashInteraction) {
		const scopeRaw = PrioritizeCommand.GET_OPTIONS.scope.get(inter) as ListScope | null;

		const embeds: EmbedBuilder[] = [];
		const contents: string[] = [];

		if (!scopeRaw || scopeRaw === ListScope.Queue) {
			const queues = (await PrioritizeCommand.GET_OPTIONS.queues.get(inter)) ?? inter.store.dbQueues();
			const rows = inter.store.dbPrioritized().filter(row => queues.has(row.queueId));
			const part = describeTable({
				store: inter.store,
				table: PRIORITIZED_TABLE,
				tableLabel: "Prioritized (per-queue)",
				entryLabelProperty: "subjectId",
				entries: [...rows.values()],
				color: Color.Gold,
			});
			collectDescribe(embeds, contents, part);
		}

		if (!scopeRaw || scopeRaw === ListScope.Event) {
			const events = (await PrioritizeCommand.GET_OPTIONS.events.get(inter)) ?? inter.store.dbEvents();
			const rows = inter.store.dbEventPrioritized().filter(row => events.has(row.eventId));
			embeds.push(...buildEventScopedEmbeds(
				rows,
				events,
				"Prioritized (event-wide)",
				Color.Gold,
				row => `priority ${row.priorityOrder}`,
			));
		}

		if (!scopeRaw || scopeRaw === ListScope.Global) {
			const rows = inter.store.dbGuildPrioritized();
			embeds.push(...buildGlobalScopedEmbeds(
				rows,
				"Prioritized (global)",
				Color.Gold,
				row => `priority ${row.priorityOrder}`,
			));
		}

		if (embeds.length === 0 && contents.length === 0) {
			await inter.respond("No prioritized entries found.");
			return;
		}

		await inter.respond({
			content: contents.length ? contents.join("\n") : undefined,
			embeds: embeds.length ? embeds : undefined,
		});
	}

	// ====================================================================
	//                           /prioritize add
	// ====================================================================

	static readonly ADD_OPTIONS = {
		scope: new ScopeOption({ required: true, description: "Scope to prioritize in" }),
		queues: new QueuesOption({ description: "Queue(s) — required when scope is queue" }),
		events: new EventsOption({ description: "Event(s) — required when scope is event" }),
		mentionable1: new MentionableOption({ required: true, id: "mentionable_1", description: "User/role to prioritize" }),
		mentionable2: new MentionableOption({ id: "mentionable_2", description: "User/role to prioritize" }),
		mentionable3: new MentionableOption({ id: "mentionable_3", description: "User/role to prioritize" }),
		mentionable4: new MentionableOption({ id: "mentionable_4", description: "User/role to prioritize" }),
		mentionable5: new MentionableOption({ id: "mentionable_5", description: "User/role to prioritize" }),
		reason: new ReasonOption({ description: "Reason for the priority" }),
		priorityOrder: new PriorityOrderOption({ description: "Priority order (lower = first)" }),
	};

	static async prioritize_add(inter: SlashInteraction) {
		const scope = parseScopeRequired(PrioritizeCommand.ADD_OPTIONS.scope.get(inter));
		const mentionables = compact([
			PrioritizeCommand.ADD_OPTIONS.mentionable1.get(inter),
			PrioritizeCommand.ADD_OPTIONS.mentionable2.get(inter),
			PrioritizeCommand.ADD_OPTIONS.mentionable3.get(inter),
			PrioritizeCommand.ADD_OPTIONS.mentionable4.get(inter),
			PrioritizeCommand.ADD_OPTIONS.mentionable5.get(inter),
		]);
		const reason = PrioritizeCommand.ADD_OPTIONS.reason.get(inter);
		const priorityOrder = parsePriorityOrder(PrioritizeCommand.ADD_OPTIONS.priorityOrder.get(inter));

		if (scope === ListScope.Queue) {
			const queues = await PrioritizeCommand.ADD_OPTIONS.queues.get(inter);
			if (!queues || queues.size === 0) throw new CustomError({ message: "Queue scope requires the `queues` option." });
			const { updatedQueueIds, insertedPrioritized } = PriorityUtils.insertQueuePrioritized(inter.store, queues, mentionables, priorityOrder, reason);
			const updatedQueues = updatedQueueIds.map(id => inter.store.dbQueues().get(id));
			await inter.respond(`Prioritized ${mentionablesMention(insertedPrioritized)} in the ${queuesMention(updatedQueues)} queue${updatedQueues.length > 1 ? "s" : ""}.`, true);
		}
		else if (scope === ListScope.Event) {
			const events = await PrioritizeCommand.ADD_OPTIONS.events.get(inter);
			if (!events || events.size === 0) throw new CustomError({ message: "Event scope requires the `events` option." });
			const { insertedPrioritized } = PriorityUtils.insertEventPrioritized(inter.store, events, mentionables, priorityOrder, reason);
			await inter.respond(`Prioritized ${mentionablesMention(insertedPrioritized)} in the ${[...events.values()].map(eventMention).join(", ")} event${events.size > 1 ? "s" : ""}.`, true);
		}
		else {
			const { insertedPrioritized } = PriorityUtils.insertGuildPrioritized(inter.store, mentionables, priorityOrder, reason);
			await inter.respond(`Prioritized ${mentionablesMention(insertedPrioritized)} in all queues in this server.`, true);
		}
	}

	// ====================================================================
	//                           /prioritize update
	// ====================================================================

	static readonly UPDATE_OPTIONS = {
		scope: new ScopeOption({ required: true, description: "Scope of entries to update" }),
		prioritizeds: new PrioritizedsOption({ required: true, description: "Entries to update" }),
		priorityOrder: new PriorityOrderOption({ description: "Priority order (lower = first)" }),
		reason: new ReasonOption({ description: "Reason for the priority" }),
	};

	static async prioritize_update(inter: SlashInteraction) {
		const selection: ScopedPrioritizedSelection | null = await PrioritizeCommand.UPDATE_OPTIONS.prioritizeds.get(inter);
		if (!selection || selection.entries.size === 0) {
			await inter.respond("No entries selected.");
			return;
		}
		const reason = PrioritizeCommand.UPDATE_OPTIONS.reason.get(inter);
		const priorityOrder = parsePriorityOrder(PrioritizeCommand.UPDATE_OPTIONS.priorityOrder.get(inter));
		const update = { ...(priorityOrder !== undefined ? { priorityOrder } : {}), ...(reason !== undefined && reason !== null ? { reason } : {}) };

		if (selection.scope === ListScope.Queue) {
			const { updatedPrioritized } = PriorityUtils.updatePrioritized(inter.store, [...selection.entries.keys()], update);
			await inter.respond(`Updated priority of ${updatedPrioritized.map(mentionableMention).join(", ")}.`, true);
		}
		else if (selection.scope === ListScope.Event) {
			const { updatedPrioritized } = PriorityUtils.updateEventPrioritized(inter.store, [...selection.entries.keys()], update);
			await inter.respond(`Updated priority of ${updatedPrioritized.map(mentionableMention).join(", ")} (event scope).`, true);
		}
		else {
			const { updatedPrioritized } = PriorityUtils.updateGuildPrioritized(inter.store, [...selection.entries.keys()], update);
			await inter.respond(`Updated priority of ${updatedPrioritized.map(mentionableMention).join(", ")} (global scope).`, true);
		}
	}

	// ====================================================================
	//                           /prioritize delete
	// ====================================================================

	static readonly DELETE_OPTIONS = {
		scope: new ScopeOption({ required: true, description: "Scope to delete from" }),
		prioritizeds: new PrioritizedsOption({
			required: true,
			description: "Entries to un-prioritize",
		}),
	};

	static async prioritize_delete(inter: SlashInteraction) {
		const selection: ScopedPrioritizedSelection | null = await PrioritizeCommand.DELETE_OPTIONS.prioritizeds.get(inter);
		if (!selection || selection.entries.size === 0) {
			await inter.respond("No entries selected.");
			return;
		}

		if (selection.scope === ListScope.Queue) {
			const { deletedPrioritized } = PriorityUtils.deletePrioritized(inter.store, [...selection.entries.keys()]);
			const lines = deletedPrioritized.map(row => {
				const queue = inter.store.dbQueues().get(row.queueId);
				return `- ${mentionableMention(row)} in ${queue ? queueMention(queue) : "unknown queue"}`;
			});
			await inter.respond(`Un-prioritized:\n${lines.join("\n")}`, true);
		}
		else if (selection.scope === ListScope.Event) {
			const { deletedPrioritized } = PriorityUtils.deleteEventPrioritized(inter.store, [...selection.entries.keys()]);
			const lines = deletedPrioritized.map(row => {
				const event = inter.store.dbEvents().get(row.eventId);
				return `- ${mentionableMention(row)} from ${event ? eventMention(event) : "unknown event"}`;
			});
			await inter.respond(`Un-prioritized (event):\n${lines.join("\n")}`, true);
		}
		else {
			const { deletedPrioritized } = PriorityUtils.deleteGuildPrioritized(inter.store, [...selection.entries.keys()]);
			const lines = deletedPrioritized.map(row => `- ${mentionableMention(row)} (global)`);
			await inter.respond(`Un-prioritized (global):\n${lines.join("\n")}`, true);
		}
	}
}

function parsePriorityOrder(raw: number | null | undefined): bigint | undefined {
	if (raw === null || raw === undefined) return undefined;
	try {
		return BigInt(raw);
	}
	catch (e) {
		console.error(`PrioritizeCommand.parsePriorityOrder: failed to parse "${raw}" as bigint:`, e);
		return undefined;
	}
}
