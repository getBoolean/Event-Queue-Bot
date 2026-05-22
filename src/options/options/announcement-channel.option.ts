import { TEXT_CHANNEL_TYPE } from "../../types/misc.types.ts";
import { ChannelOption } from "../base-option.ts";

export class AnnouncementChannelOption extends ChannelOption {
	static readonly ID = "announcement_channel";
	id = AnnouncementChannelOption.ID;
	channelTypes = TEXT_CHANNEL_TYPE;
}
