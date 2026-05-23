import { Collection } from "discord.js";

import type { DbBlacklisted, DbEventBlacklisted, DbGuildBlacklisted } from "../../db/schema.ts";
import { ListScope } from "../../types/db.types.ts";
import type { UIOption } from "../../types/handler.types.ts";
import type { AutocompleteInteraction, SlashInteraction } from "../../types/interaction.types.ts";
import { CHOICE_ALL, CHOICE_SOME } from "../../types/parsing.types.ts";
import { BlacklistedNotFoundWarning } from "../../utils/error.utils.ts";
import { CustomOption } from "../base-option.ts";
import { buildScopeSuggestions, pickScopedEntries, resolveListScope } from "./_list-scope.utils.ts";

export type ScopedBlacklistedSelection =
	| { scope: ListScope.Queue, entries: Collection<bigint, DbBlacklisted> }
	| { scope: ListScope.Event, entries: Collection<bigint, DbEventBlacklisted> }
	| { scope: ListScope.Global, entries: Collection<bigint, DbGuildBlacklisted> };

export class BlacklistedsOption extends CustomOption {
	static readonly ID = "blacklisted";
	id = BlacklistedsOption.ID;
	extraChoices = [CHOICE_ALL, CHOICE_SOME];

	getAutocompletions = BlacklistedsOption.getAutocompletions;

	get(inter: AutocompleteInteraction | SlashInteraction) {
		return super.get(inter) as Promise<ScopedBlacklistedSelection | null>;
	}

	protected async getUncached(inter: AutocompleteInteraction | SlashInteraction): Promise<ScopedBlacklistedSelection | null> {
		const inputString = inter.options.getString(BlacklistedsOption.ID);
		if (!inputString) return null;

		const scope = resolveListScope(inter);
		if (scope === ListScope.Queue) {
			const queues = await inter.parser.getScopedQueues();
			const entries = inter.parser.getScopedBlacklisted(queues);
			return { scope, entries: await pickScopedEntries(inter, inputString, entries, BlacklistedsOption.ID, () => new BlacklistedNotFoundWarning()) };
		}
		if (scope === ListScope.Event) {
			const entries = inter.store.dbEventBlacklisted();
			return { scope, entries: await pickScopedEntries(inter, inputString, entries, BlacklistedsOption.ID, () => new BlacklistedNotFoundWarning()) };
		}
		const entries = inter.store.dbGuildBlacklisted();
		return { scope, entries: await pickScopedEntries(inter, inputString, entries, BlacklistedsOption.ID, () => new BlacklistedNotFoundWarning()) };
	}

	static async getAutocompletions({ inter }: { inter: AutocompleteInteraction }): Promise<UIOption[]> {
		const scope = resolveListScope(inter);
		if (scope === ListScope.Queue) {
			const queues = await inter.parser.getScopedQueues();
			const entries = inter.parser.getScopedBlacklisted(queues);
			return buildScopeSuggestions(inter, [...entries.values()], row => {
				const queue = inter.store.dbQueues().get((row as DbBlacklisted).queueId);
				return queue ? `[Queue: ${queue.name}]` : "[Queue]";
			});
		}
		if (scope === ListScope.Event) {
			const entries = inter.store.dbEventBlacklisted();
			return buildScopeSuggestions(inter, [...entries.values()], row => {
				const event = inter.store.dbEvents().get((row as DbEventBlacklisted).eventId);
				return event ? `[Event: ${event.name}]` : "[Event]";
			});
		}
		const entries = inter.store.dbGuildBlacklisted();
		return buildScopeSuggestions(inter, [...entries.values()], () => "[Global]");
	}
}
