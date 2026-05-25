import { Collection } from "discord.js";

import type { DbEvent } from "../../db/schema.ts";
import type { AutocompleteInteraction, SlashInteraction } from "../../types/interaction.types.ts";
import { CHOICE_ALL, CHOICE_SOME } from "../../types/parsing.types.ts";
import { SelectMenuTransactor } from "../../utils/message-utils/select-menu-transactor.ts";
import { CustomOption } from "../base-option.ts";
import { EventOption } from "./event.option.ts";

export class EventsOption extends CustomOption {
	static readonly ID = "events";
	id = EventsOption.ID;
	extraChoices = [CHOICE_ALL, CHOICE_SOME];

	getAutocompletions = EventOption.getAutocompletions;

	get(inter: AutocompleteInteraction | SlashInteraction) {
		return super.get(inter) as Promise<Collection<bigint, DbEvent>>;
	}

	protected async getUncached(inter: AutocompleteInteraction | SlashInteraction) {
		const inputString = inter.options.getString(EventsOption.ID);
		if (!inputString) return;

		const events = inter.store.dbEvents();

		switch (inputString) {
			case CHOICE_ALL.value:
				return events;
			case CHOICE_SOME.value:
				return await this.getViaSelectMenu(inter as SlashInteraction, events);
			default: {
				const event = EventOption.findEvent(events, inputString);
				return event ? new Collection([[event.id, event]]) : null;
			}
		}
	}

	protected async getViaSelectMenu(inter: SlashInteraction, events: Collection<bigint, DbEvent>): Promise<Collection<bigint, DbEvent>> {
		const label = EventsOption.ID;
		const options = events.map(event => ({
			name: event.name,
			value: event.id.toString(),
		}));

		const selectMenuTransactor = new SelectMenuTransactor(inter);
		const result = await selectMenuTransactor.sendAndReceive(label, options);
		if (!result) return;

		const eventIds = result.map(id => BigInt(id));
		const selectedEvents = events.filter(event => eventIds.includes(event.id));

		await selectMenuTransactor.updateWithResult(label, selectedEvents);

		return selectedEvents;
	}
}
