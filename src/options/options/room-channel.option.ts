import { TEXT_CHANNEL_TYPE } from "../../types/misc.types.ts";
import { ChannelOption } from "../base-option.ts";

export class RoomChannelOption extends ChannelOption {
	static readonly ID = "room_channel";
	id = RoomChannelOption.ID;
	channelTypes = TEXT_CHANNEL_TYPE;
}
