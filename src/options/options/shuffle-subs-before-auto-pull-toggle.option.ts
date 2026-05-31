import { EVENT_TABLE } from "../../db/schema.ts";
import { BooleanOption } from "../base-option.ts";

export class ShuffleSubsBeforeAutoPullToggleOption extends BooleanOption {
	static readonly ID = "shuffle_subs_before_auto_pull_toggle";
	id = ShuffleSubsBeforeAutoPullToggleOption.ID;
	defaultValue = EVENT_TABLE.shuffleSubsBeforeAutoPullToggle.default;
}
