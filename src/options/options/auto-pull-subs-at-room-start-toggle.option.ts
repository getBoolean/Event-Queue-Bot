import { EVENT_TABLE } from "../../db/schema.ts";
import { BooleanOption } from "../base-option.ts";

export class AutoPullSubsAtRoomStartToggleOption extends BooleanOption {
	static readonly ID = "auto_pull_subs_at_room_start_toggle";
	id = AutoPullSubsAtRoomStartToggleOption.ID;
	defaultValue = EVENT_TABLE.autoPullSubsAtRoomStartToggle.default;
}
