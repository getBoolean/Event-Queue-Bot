import { RoleOption as BaseRoleOption } from "../base-option.ts";

export class SubRoleInQueueOption extends BaseRoleOption {
	static readonly ID = "sub_role_in_queue";
	id = SubRoleInQueueOption.ID;
}
