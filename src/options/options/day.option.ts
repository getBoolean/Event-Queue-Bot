import moment from "moment-timezone";

import type { UIOption } from "../../types/handler.types.ts";
import type { AutocompleteInteraction, SlashInteraction } from "../../types/interaction.types.ts";
import { type AutoCompleteOptions, CustomOption } from "../base-option.ts";

export class DayOption extends CustomOption {
	static readonly ID = "day";
	id = DayOption.ID;
	required = true;

	getAutocompletions = DayOption.getAutocompletions;

	// force return type to be string
	get(inter: AutocompleteInteraction | SlashInteraction) {
		return super.get(inter) as Promise<string>;
	}

	protected async getUncached(inter: AutocompleteInteraction | SlashInteraction) {
		return inter.options.getString(DayOption.ID);
	}

	static async getAutocompletions(options: AutoCompleteOptions): Promise<UIOption[]> {
		const { inter, lowerSearchText } = options;
		const yearStr = inter.options.getString("year");
		const monthStr = inter.options.getString("month");

		let daysInMonth = 31;
		const year = Number(yearStr);
		const month = Number(monthStr);
		if (Number.isInteger(year) && Number.isInteger(month) && month >= 1 && month <= 12) {
			daysInMonth = moment({ year, month: month - 1 }).daysInMonth();
		}

		const days: string[] = [];
		for (let d = 1; d <= daysInMonth; d++) {
			days.push(String(d));
		}
		return days
			.filter(d => d.includes(lowerSearchText))
			.map(d => ({ name: d, value: d }));
	}
}
