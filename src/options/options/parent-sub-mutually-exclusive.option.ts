import { EVENT_TABLE } from "../../db/schema.ts";
import { BooleanOption } from "../base-option.ts";

export class ParentSubMutuallyExclusiveOption extends BooleanOption {
	static readonly ID = "parent_sub_mutually_exclusive";
	id = ParentSubMutuallyExclusiveOption.ID;
	defaultValue = EVENT_TABLE.parentSubMutuallyExclusive.default;
}
