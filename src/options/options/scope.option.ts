import { ListScope } from "../../types/db.types.ts";
import { toChoices } from "../../utils/misc.utils.ts";
import { StringOption } from "../base-option.ts";

export class ScopeOption extends StringOption {
	static readonly ID = "scope";
	id = ScopeOption.ID;
	choices = toChoices(ListScope);
}
