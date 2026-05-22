import { IntegerOption } from "../base-option.ts";

export class SlowmodeOption extends IntegerOption {
	static readonly ID = "slowmode";
	id = SlowmodeOption.ID;
	minValue = 0;
}
