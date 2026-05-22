import { IntegerOption } from "../base-option.ts";

export class RoomCountOption extends IntegerOption {
	static readonly ID = "room_count";
	id = RoomCountOption.ID;
	minValue = 1;
}
