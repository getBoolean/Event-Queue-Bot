import { StringOption } from "../base-option.ts";

export class AnnouncementMessageOption extends StringOption {
	static readonly ID = "announcement_message";
	id = AnnouncementMessageOption.ID;
}
