import moment from "moment-timezone";

import type { UIOption } from "../../types/handler.types.ts";
import type { AutocompleteInteraction, SlashInteraction } from "../../types/interaction.types.ts";
import { type AutoCompleteOptions, CustomOption } from "../base-option.ts";

export class YearOption extends CustomOption {
	static readonly ID = "year";
	id = YearOption.ID;
	required = true;

	getAutocompletions = YearOption.getAutocompletions;

	// force return type to be string
	get(inter: AutocompleteInteraction | SlashInteraction) {
		return super.get(inter) as Promise<string>;
	}

	protected async getUncached(inter: AutocompleteInteraction | SlashInteraction) {
		return inter.options.getString(YearOption.ID);
	}

	static async getAutocompletions(options: AutoCompleteOptions): Promise<UIOption[]> {
		const { lowerSearchText } = options;
		const currentYear = moment().year();
		const years: string[] = [];
		for (let i = 0; i <= 5; i++) {
			years.push(String(currentYear + i));
		}
		return years
			.filter(y => y.includes(lowerSearchText))
			.map(y => ({ name: y, value: y }));
	}
}
