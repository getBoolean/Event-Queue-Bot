import { RoleOption as BaseRoleOption } from "../base-option.ts";

export class ModeratorRoleOption extends BaseRoleOption {
	static readonly ID = "moderator_role";
	id = ModeratorRoleOption.ID;
}
