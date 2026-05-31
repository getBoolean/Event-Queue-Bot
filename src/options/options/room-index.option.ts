import { IntegerOption } from "../base-option.ts";

export class RoomIndexOption extends IntegerOption {
	static readonly ID = "room_index";
	id = RoomIndexOption.ID;
	minValue = 1;
}
