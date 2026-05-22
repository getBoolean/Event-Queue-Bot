import { EVENT_TABLE } from "../../db/schema.ts";
import { BooleanOption } from "../base-option.ts";

export class CreateDiscordEventToggleOption extends BooleanOption {
	static readonly ID = "create_discord_event";
	id = CreateDiscordEventToggleOption.ID;
	defaultValue = EVENT_TABLE.createDiscordEvent.default;
}
