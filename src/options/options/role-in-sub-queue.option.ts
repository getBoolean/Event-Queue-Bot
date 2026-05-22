import { EVENT_TABLE } from "../../db/schema.ts";
import { BooleanOption } from "../base-option.ts";

export class RoleInSubQueueOption extends BooleanOption {
	static readonly ID = "role_in_sub_queue";
	id = RoleInSubQueueOption.ID;
	defaultValue = EVENT_TABLE.roleInSubQueue.default;
}
