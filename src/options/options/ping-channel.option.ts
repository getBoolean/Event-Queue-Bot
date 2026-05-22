import { TEXT_CHANNEL_TYPE } from "../../types/misc.types.ts";
import { ChannelOption } from "../base-option.ts";

export class PingChannelOption extends ChannelOption {
	static readonly ID = "ping_channel";
	id = PingChannelOption.ID;
	channelTypes = TEXT_CHANNEL_TYPE;
}
