import { Collection } from "discord.js";

import type { DbEventWhitelisted, DbGuildWhitelisted, DbWhitelisted } from "../../db/schema.ts";
import { ListScope } from "../../types/db.types.ts";
import type { UIOption } from "../../types/handler.types.ts";
import type { AutocompleteInteraction, SlashInteraction } from "../../types/interaction.types.ts";
import { CHOICE_ALL, CHOICE_SOME } from "../../types/parsing.types.ts";
import { WhitelistedNotFoundError } from "../../utils/error.utils.ts";
import { CustomOption } from "../base-option.ts";
import { buildScopeSuggestions, pickScopedEntries, resolveListScope } from "./_list-scope.utils.ts";

export type ScopedWhitelistedSelection =
	| { scope: ListScope.Queue, entries: Collection<bigint, DbWhitelisted> }
	| { scope: ListScope.Event, entries: Collection<bigint, DbEventWhitelisted> }
	| { scope: ListScope.Global, entries: Collection<bigint, DbGuildWhitelisted> };

export class WhitelistedsOption extends CustomOption {
	static readonly ID = "whitelisted";
	id = WhitelistedsOption.ID;
	extraChoices = [CHOICE_ALL, CHOICE_SOME];

	getAutocompletions = WhitelistedsOption.getAutocompletions;

	get(inter: AutocompleteInteraction | SlashInteraction) {
		return super.get(inter) as Promise<ScopedWhitelistedSelection | null>;
	}

	protected async getUncached(inter: AutocompleteInteraction | SlashInteraction): Promise<ScopedWhitelistedSelection | null> {
		const inputString = inter.options.getString(WhitelistedsOption.ID);
		if (!inputString) return null;

		const scope = resolveListScope(inter);
		if (scope === ListScope.Queue) {
			const queues = await inter.parser.getScopedQueues();
			const entries = inter.parser.getScopedWhitelisted(queues);
			return { scope, entries: await pickScopedEntries(inter, inputString, entries, WhitelistedsOption.ID, () => new WhitelistedNotFoundError()) };
		}
		if (scope === ListScope.Event) {
			const entries = inter.store.dbEventWhitelisted();
			return { scope, entries: await pickScopedEntries(inter, inputString, entries, WhitelistedsOption.ID, () => new WhitelistedNotFoundError()) };
		}
		const entries = inter.store.dbGuildWhitelisted();
		return { scope, entries: await pickScopedEntries(inter, inputString, entries, WhitelistedsOption.ID, () => new WhitelistedNotFoundError()) };
	}

	static async getAutocompletions({ inter }: { inter: AutocompleteInteraction }): Promise<UIOption[]> {
		const scope = resolveListScope(inter);
		if (scope === ListScope.Queue) {
			const queues = await inter.parser.getScopedQueues();
			const entries = inter.parser.getScopedWhitelisted(queues);
			return buildScopeSuggestions(inter, [...entries.values()], row => {
				const queue = inter.store.dbQueues().get((row as DbWhitelisted).queueId);
				return queue ? `[Queue: ${queue.name}]` : "[Queue]";
			});
		}
		if (scope === ListScope.Event) {
			const entries = inter.store.dbEventWhitelisted();
			return buildScopeSuggestions(inter, [...entries.values()], row => {
				const event = inter.store.dbEvents().get((row as DbEventWhitelisted).eventId);
				return event ? `[Event: ${event.name}]` : "[Event]";
			});
		}
		const entries = inter.store.dbGuildWhitelisted();
		return buildScopeSuggestions(inter, [...entries.values()], () => "[Global]");
	}
}
