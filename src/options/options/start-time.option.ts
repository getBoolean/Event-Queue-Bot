import type { UIOption } from "../../types/handler.types.ts";
import type { AutocompleteInteraction, SlashInteraction } from "../../types/interaction.types.ts";
import { type AutoCompleteOptions, CustomOption } from "../base-option.ts";

const QUARTER_HOUR_MINUTES = ["00", "15", "30", "45"];
const DEFAULT_START_HOURS_24 = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22];

function to12Hour(hour24: number): { hour12: number; meridiem: "AM" | "PM" } {
	const meridiem = hour24 >= 12 ? "PM" : "AM";
	const hour12 = ((hour24 + 11) % 12) + 1;
	return { hour12, meridiem };
}

export class StartTimeOption extends CustomOption {
	static readonly ID = "start_time";
	id = StartTimeOption.ID;
	required = true;

	getAutocompletions = StartTimeOption.getAutocompletions;

	// force return type to be string
	get(inter: AutocompleteInteraction | SlashInteraction) {
		return super.get(inter) as Promise<string>;
	}

	protected async getUncached(inter: AutocompleteInteraction | SlashInteraction) {
		return inter.options.getString(StartTimeOption.ID);
	}

	static async getAutocompletions(options: AutoCompleteOptions): Promise<UIOption[]> {
		const { lowerSearchText } = options;

		if (!lowerSearchText) {
			const defaults: string[] = [];
			for (const hour24 of DEFAULT_START_HOURS_24) {
				const { hour12, meridiem } = to12Hour(hour24);
				defaults.push(`${hour12} ${meridiem}`);
			}
			return defaults.map(v => ({ name: v, value: v }));
		}

		const candidates: string[] = [];
		for (let hour12 = 1; hour12 <= 12; hour12++) {
			for (const meridiem of ["AM", "PM"]) {
				candidates.push(`${hour12} ${meridiem}`);
				for (const minute of QUARTER_HOUR_MINUTES) {
					candidates.push(`${hour12}:${minute} ${meridiem}`);
				}
			}
		}

		return candidates
			.filter(c => c.toLowerCase().includes(lowerSearchText))
			.map(v => ({ name: v, value: v }));
	}
}
