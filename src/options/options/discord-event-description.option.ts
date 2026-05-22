import { StringOption } from "../base-option.ts";

export class DiscordEventDescriptionOption extends StringOption {
	static readonly ID = "discord_event_description";
	id = DiscordEventDescriptionOption.ID;
}
