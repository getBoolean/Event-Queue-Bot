import { EVENT_TABLE } from "../../db/schema.ts";
import { BooleanOption } from "../base-option.ts";

export class RoleInRoomQueueOption extends BooleanOption {
	static readonly ID = "role_in_room_queue";
	id = RoleInRoomQueueOption.ID;
	defaultValue = EVENT_TABLE.roleInRoomQueue.default;
}
