import { CATEGORY_CHANNEL_TYPE } from "../../types/misc.types.ts";
import { ChannelOption } from "../base-option.ts";

export class RoomCategoryOption extends ChannelOption {
	static readonly ID = "room_category";
	id = RoomCategoryOption.ID;
	channelTypes = CATEGORY_CHANNEL_TYPE;
}
