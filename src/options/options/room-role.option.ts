import { RoleOption as BaseRoleOption } from "../base-option.ts";

export class RoomRoleOption extends BaseRoleOption {
	static readonly ID = "role";
	id = RoomRoleOption.ID;
}
