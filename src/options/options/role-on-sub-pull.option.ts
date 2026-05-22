import { EVENT_TABLE } from "../../db/schema.ts";
import { BooleanOption } from "../base-option.ts";

export class RoleOnSubPullOption extends BooleanOption {
	static readonly ID = "role_on_sub_pull";
	id = RoleOnSubPullOption.ID;
	defaultValue = EVENT_TABLE.roleOnSubPull.default;
}
