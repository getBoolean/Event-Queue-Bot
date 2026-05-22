import { TEXT_CHANNEL_TYPE } from "../../types/misc.types.ts";
import { ChannelOption } from "../base-option.ts";

export class SubChannelOption extends ChannelOption {
	static readonly ID = "sub_channel";
	id = SubChannelOption.ID;
	channelTypes = TEXT_CHANNEL_TYPE;
}
