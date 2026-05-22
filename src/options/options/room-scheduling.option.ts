import { RoomScheduling } from "../../types/db.types.ts";
import { StringOption } from "../base-option.ts";

export class RoomSchedulingOption extends StringOption {
	static readonly ID = "room_scheduling";
	id = RoomSchedulingOption.ID;
	choices = [
		{ name: "Parallel (all rooms start at once)", value: RoomScheduling.Parallel },
		{ name: "Sequential (rooms start one after another)", value: RoomScheduling.Sequential },
	];
}
