import { EVENT_TABLE } from "../../db/schema.ts";
import { IntegerOption } from "../base-option.ts";

export class MaxRoomsPerUserOption extends IntegerOption {
	static readonly ID = "max_rooms_per_user";
	id = MaxRoomsPerUserOption.ID;
	minValue = 0;
	defaultValue = EVENT_TABLE.maxRoomsPerUser.default;
}
