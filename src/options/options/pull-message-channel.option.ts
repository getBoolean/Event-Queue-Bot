import { TEXT_CHANNEL_TYPE } from "../../types/misc.types.ts";
import { ChannelOption } from "../base-option.ts";

export class PullMessageChannelOption extends ChannelOption {
	static readonly ID = "pull_message_channel";
	id = PullMessageChannelOption.ID;
	channelTypes = TEXT_CHANNEL_TYPE;
}
