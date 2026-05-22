import { EVENT_TABLE } from "../../db/schema.ts";
import { BooleanOption } from "../base-option.ts";

export class RoleOnRoomPullOption extends BooleanOption {
	static readonly ID = "role_on_room_pull";
	id = RoleOnRoomPullOption.ID;
	defaultValue = EVENT_TABLE.roleOnRoomPull.default;
}
