import { EVENT_TABLE } from "../../db/schema.ts";
import { IntegerOption } from "../base-option.ts";

export class MaxSubsPerUserOption extends IntegerOption {
	static readonly ID = "max_subs_per_user";
	id = MaxSubsPerUserOption.ID;
	minValue = 0;
	defaultValue = EVENT_TABLE.maxSubsPerUser.default;
}
