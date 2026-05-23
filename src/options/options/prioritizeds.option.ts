import { Collection } from "discord.js";

import type { DbEventPrioritized, DbGuildPrioritized, DbPrioritized } from "../../db/schema.ts";
import { ListScope } from "../../types/db.types.ts";
import type { UIOption } from "../../types/handler.types.ts";
import type { AutocompleteInteraction, SlashInteraction } from "../../types/interaction.types.ts";
import { CHOICE_ALL, CHOICE_SOME } from "../../types/parsing.types.ts";
import { PrioritizedNotFoundWarning } from "../../utils/error.utils.ts";
import { CustomOption } from "../base-option.ts";
import { buildScopeSuggestions, pickScopedEntries, resolveListScope } from "./_list-scope.utils.ts";

export type ScopedPrioritizedSelection =
	| { scope: ListScope.Queue, entries: Collection<bigint, DbPrioritized> }
	| { scope: ListScope.Event, entries: Collection<bigint, DbEventPrioritized> }
	| { scope: ListScope.Global, entries: Collection<bigint, DbGuildPrioritized> };

export class PrioritizedsOption extends CustomOption {
	static readonly ID = "prioritized";
	id = PrioritizedsOption.ID;
	extraChoices = [CHOICE_ALL, CHOICE_SOME];

	getAutocompletions = PrioritizedsOption.getAutocompletions;

	get(inter: AutocompleteInteraction | SlashInteraction) {
		return super.get(inter) as Promise<ScopedPrioritizedSelection | null>;
	}

	protected async getUncached(inter: AutocompleteInteraction | SlashInteraction): Promise<ScopedPrioritizedSelection | null> {
		const inputString = inter.options.getString(PrioritizedsOption.ID);
		if (!inputString) return null;

		const scope = resolveListScope(inter);
		if (scope === ListScope.Queue) {
			const queues = await inter.parser.getScopedQueues();
			const entries = inter.parser.getScopedPrioritized(queues);
			return { scope, entries: await pickScopedEntries(inter, inputString, entries, PrioritizedsOption.ID, () => new PrioritizedNotFoundWarning()) };
		}
		if (scope === ListScope.Event) {
			const entries = inter.store.dbEventPrioritized();
			return { scope, entries: await pickScopedEntries(inter, inputString, entries, PrioritizedsOption.ID, () => new PrioritizedNotFoundWarning()) };
		}
		const entries = inter.store.dbGuildPrioritized();
		return { scope, entries: await pickScopedEntries(inter, inputString, entries, PrioritizedsOption.ID, () => new PrioritizedNotFoundWarning()) };
	}

	static async getAutocompletions({ inter }: { inter: AutocompleteInteraction }): Promise<UIOption[]> {
		const scope = resolveListScope(inter);
		if (scope === ListScope.Queue) {
			const queues = await inter.parser.getScopedQueues();
			const entries = inter.parser.getScopedPrioritized(queues);
			return buildScopeSuggestions(inter, [...entries.values()], row => {
				const queue = inter.store.dbQueues().get((row as DbPrioritized).queueId);
				return queue ? `[Queue: ${queue.name}]` : "[Queue]";
			});
		}
		if (scope === ListScope.Event) {
			const entries = inter.store.dbEventPrioritized();
			return buildScopeSuggestions(inter, [...entries.values()], row => {
				const event = inter.store.dbEvents().get((row as DbEventPrioritized).eventId);
				return event ? `[Event: ${event.name}]` : "[Event]";
			});
		}
		const entries = inter.store.dbGuildPrioritized();
		return buildScopeSuggestions(inter, [...entries.values()], () => "[Global]");
	}
}
