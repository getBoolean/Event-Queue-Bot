import { IntegerOption } from "../base-option.ts";

export class LockOffsetMinutesOption extends IntegerOption {
	static readonly ID = "lock_offset_minutes";
	id = LockOffsetMinutesOption.ID;
	defaultValue = 0;
}
