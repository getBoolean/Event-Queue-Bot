import { TEXT_CHANNEL_TYPE } from "../../types/misc.types.ts";
import { ChannelOption } from "../base-option.ts";

export class RoomQueuesChannelOption extends ChannelOption {
	static readonly ID = "room_queues_channel";
	id = RoomQueuesChannelOption.ID;
	channelTypes = TEXT_CHANNEL_TYPE;
}
