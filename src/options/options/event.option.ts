import { type Collection } from "discord.js";

import type { DbEvent } from "../../db/schema.ts";
import type { UIOption } from "../../types/handler.types.ts";
import type { AutocompleteInteraction, SlashInteraction } from "../../types/interaction.types.ts";
import { EventNotFoundError } from "../../utils/error.utils.ts";
import { type AutoCompleteOptions, CustomOption } from "../base-option.ts";

export class EventOption extends CustomOption {
	static readonly ID = "event";
	id = EventOption.ID;

	getAutocompletions = EventOption.getAutocompletions;

	get(inter: AutocompleteInteraction | SlashInteraction) {
		return super.get(inter) as Promise<DbEvent>;
	}

	protected async getUncached(inter: AutocompleteInteraction | SlashInteraction) {
		const inputString = inter.options.getString(EventOption.ID);
		if (!inputString) return;

		const events = inter.store.dbEvents();
		return EventOption.findEvent(events, inputString);
	}

	static findEvent(events: Collection<bigint, DbEvent>, idString: string): DbEvent {
		let event: DbEvent | undefined;
		try {
			event = events.get(BigInt(idString));
		}
		catch {
			event = events.find(e => e.name.toLowerCase() === idString.toLowerCase());
		}
		if (event) {
			return event;
		}
		else {
			throw new EventNotFoundError();
		}
	}

	static async getAutocompletions(options: AutoCompleteOptions): Promise<UIOption[]> {
		const { inter, lowerSearchText } = options;
		const events = inter.store.dbEvents();

		return events
			.filter(event => event.name.toLowerCase().includes(lowerSearchText))
			.map(event => ({
				name: event.name,
				value: event.id.toString(),
			}));
	}
}
