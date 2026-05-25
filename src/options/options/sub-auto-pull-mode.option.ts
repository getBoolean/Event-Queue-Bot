import { SubAutoPullMode } from "../../types/db.types.ts";
import { StringOption } from "../base-option.ts";

export class SubAutoPullModeOption extends StringOption {
	static readonly ID = "sub_auto_pull_mode";
	id = SubAutoPullModeOption.ID;
	choices = [
		{ name: "Drain (standard /pull)", value: SubAutoPullMode.Drain },
		{ name: "Promote (move to room queue)", value: SubAutoPullMode.Promote },
	];
}
