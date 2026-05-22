import { IntegerOption } from "../base-option.ts";

export class CreateOffsetHoursOption extends IntegerOption {
	static readonly ID = "create_offset_hours";
	id = CreateOffsetHoursOption.ID;
	minValue = 0;
	defaultValue = 24;
}
