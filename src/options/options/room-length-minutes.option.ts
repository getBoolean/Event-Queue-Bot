import { IntegerOption } from "../base-option.ts";

export class RoomLengthMinutesOption extends IntegerOption {
	static readonly ID = "room_length_minutes";
	id = RoomLengthMinutesOption.ID;
	minValue = 1;
}
