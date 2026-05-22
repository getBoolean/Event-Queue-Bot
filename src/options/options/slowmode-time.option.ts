import { StringOption } from "../base-option.ts";

export enum SlowmodeTimeUnit {
	Seconds = "seconds",
	Minutes = "minutes",
	Hours = "hours",
}

export class SlowmodeTimeOption extends StringOption {
	static readonly ID = "slowmode_time";
	id = SlowmodeTimeOption.ID;
	defaultValue = SlowmodeTimeUnit.Minutes;
	choices = [
		{ name: "Seconds", value: SlowmodeTimeUnit.Seconds },
		{ name: "Minutes", value: SlowmodeTimeUnit.Minutes },
		{ name: "Hours", value: SlowmodeTimeUnit.Hours },
	];
}
