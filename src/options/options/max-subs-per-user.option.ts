import { IntegerOption } from "../base-option.ts";

export class MaxSubsPerUserOption extends IntegerOption {
	static readonly ID = "max_subs_per_user";
	id = MaxSubsPerUserOption.ID;
	minValue = 0;
}
