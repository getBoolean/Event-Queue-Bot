import { RoleOption as BaseRoleOption } from "../base-option.ts";

export class SubRoleOnPullOption extends BaseRoleOption {
	static readonly ID = "sub_role_on_pull";
	id = SubRoleOnPullOption.ID;
}
