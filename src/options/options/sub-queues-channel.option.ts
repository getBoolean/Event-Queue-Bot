import { TEXT_CHANNEL_TYPE } from "../../types/misc.types.ts";
import { ChannelOption } from "../base-option.ts";

export class SubQueuesChannelOption extends ChannelOption {
	static readonly ID = "sub_queues_channel";
	id = SubQueuesChannelOption.ID;
	channelTypes = TEXT_CHANNEL_TYPE;
}
