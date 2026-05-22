import { StringOption } from "../base-option.ts";

export class RoomPingMessageOption extends StringOption {
	static readonly ID = "room_ping_message";
	id = RoomPingMessageOption.ID;
}
