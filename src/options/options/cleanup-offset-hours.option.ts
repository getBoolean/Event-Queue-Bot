import { IntegerOption } from "../base-option.ts";

export class CleanupOffsetHoursOption extends IntegerOption {
	static readonly ID = "cleanup_offset_hours";
	id = CleanupOffsetHoursOption.ID;
	minValue = 0;
	defaultValue = 24;
}
