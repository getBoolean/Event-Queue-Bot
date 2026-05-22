import { RoleOption as BaseRoleOption } from "../base-option.ts";

export class RoomRoleOnPullOption extends BaseRoleOption {
	static readonly ID = "room_role_on_pull";
	id = RoomRoleOnPullOption.ID;
}
