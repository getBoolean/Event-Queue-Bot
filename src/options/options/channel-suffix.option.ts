import { Queries } from "../../db/queries.ts";
import type { UIOption } from "../../types/handler.types.ts";
import { type AutoCompleteOptions, StringOption } from "../base-option.ts";

export class ChannelSuffixOption extends StringOption {
	static readonly ID = "suffix";
	id = ChannelSuffixOption.ID;
	autocomplete = true;

	async getAutocompletions(options: AutoCompleteOptions): Promise<UIOption[]> {
		const { inter, lowerSearchText } = options;

		const eventIdString = inter.options.get("event")?.value as string | undefined;
		if (!eventIdString) return [];

		let eventId: bigint;
		try {
			eventId = BigInt(eventIdString);
		}
		catch (e) {
			console.error(`ChannelSuffixOption.getAutocompletions: failed to parse event id "${eventIdString}":`, e);
			return [];
		}

		const templates = Queries.selectManyRoomChannelTemplates({ guildId: inter.guildId, eventId });
		return templates
			.filter(t => t.suffix.toLowerCase().includes(lowerSearchText))
			.map(t => ({ name: t.suffix, value: t.suffix }));
	}
}
