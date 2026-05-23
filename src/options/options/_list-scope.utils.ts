import { Collection } from "discord.js";

import { ListScope } from "../../types/db.types.ts";
import type { UIOption } from "../../types/handler.types.ts";
import type { AutocompleteInteraction, SlashInteraction } from "../../types/interaction.types.ts";
import { CHOICE_ALL, CHOICE_SOME } from "../../types/parsing.types.ts";
import { SelectMenuTransactor } from "../../utils/message-utils/select-menu-transactor.ts";

export function resolveListScope(inter: AutocompleteInteraction | SlashInteraction): ListScope {
	const raw = inter.options.getString("scope");
	if (raw === ListScope.Event) return ListScope.Event;
	if (raw === ListScope.Global) return ListScope.Global;
	return ListScope.Queue;
}

export async function pickScopedEntries<T extends { id: bigint, subjectId: string, isRole: boolean }>(
	inter: AutocompleteInteraction | SlashInteraction,
	inputString: string,
	entries: Collection<bigint, T>,
	menuLabel: string,
	notFound: () => Error,
): Promise<Collection<bigint, T>> {
	switch (inputString) {
		case CHOICE_ALL.value:
			return entries;
		case CHOICE_SOME.value:
			return pickViaSelectMenu(inter as SlashInteraction, entries, menuLabel);
		default:
			try {
				const id = BigInt(inputString);
				const row = entries.get(id);
				if (row) return new Collection([[id, row]]);
			}
			catch (e) {
				console.error(`pickScopedEntries: failed to parse "${inputString}" as bigint:`, e);
			}
			throw notFound();
	}
}

async function pickViaSelectMenu<T extends { id: bigint }>(
	inter: SlashInteraction,
	entries: Collection<bigint, T>,
	label: string,
): Promise<Collection<bigint, T>> {
	const options = entries.map(entry => ({
		name: entry.toString(),
		value: entry.id.toString(),
	}));

	const selectMenuTransactor = new SelectMenuTransactor(inter);
	const result = await selectMenuTransactor.sendAndReceive(label, options);
	if (!result) return new Collection();

	const ids = result.map(id => BigInt(id));
	const selected = entries.filter(entry => ids.includes(entry.id));

	await selectMenuTransactor.updateWithResult(label, selected);

	return selected;
}

export async function buildScopeSuggestions<T extends { id: bigint, subjectId: string, isRole: boolean }>(
	inter: AutocompleteInteraction | SlashInteraction,
	rows: T[],
	scopeLabel: (row: T) => string,
): Promise<UIOption[]> {
	const suggestions: UIOption[] = [];
	for (const row of rows) {
		const prefix = scopeLabel(row);
		if (row.isRole) {
			const role = await inter.store.jsRole(row.subjectId);
			if (!role) continue;
			suggestions.push({
				name: `${prefix} ${role.name} role`,
				value: row.id.toString(),
			});
		}
		else {
			const member = await inter.store.jsMember(row.subjectId);
			if (!member) continue;
			suggestions.push({
				name: `${prefix} ${member.nickname ?? member.displayName} user`,
				value: row.id.toString(),
			});
		}
	}
	return suggestions;
}
