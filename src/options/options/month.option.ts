import moment from "moment-timezone";

import type { UIOption } from "../../types/handler.types.ts";
import type { AutocompleteInteraction, SlashInteraction } from "../../types/interaction.types.ts";
import { type AutoCompleteOptions, CustomOption } from "../base-option.ts";

export class MonthOption extends CustomOption {
	static readonly ID = "month";
	id = MonthOption.ID;
	required = true;

	getAutocompletions = MonthOption.getAutocompletions;

	// force return type to be string
	get(inter: AutocompleteInteraction | SlashInteraction) {
		return super.get(inter) as Promise<string>;
	}

	protected async getUncached(inter: AutocompleteInteraction | SlashInteraction) {
		return inter.options.getString(MonthOption.ID);
	}

	static async getAutocompletions(options: AutoCompleteOptions): Promise<UIOption[]> {
		const { lowerSearchText } = options;
		const monthNames = moment.months();
		return monthNames
			.map((name, index) => ({ name, value: String(index + 1) }))
			.filter(entry => entry.name.toLowerCase().includes(lowerSearchText));
	}
}
