import { Queries } from "../../db/queries.ts";
import { EventQueueRole } from "../../types/db.types.ts";
import type { UIOption } from "../../types/handler.types.ts";
import { type AutoCompleteOptions, IntegerOption } from "../base-option.ts";

export class RoomIndexOption extends IntegerOption {
	static readonly ID = "room";
	id = RoomIndexOption.ID;
	minValue = 1;
	autocomplete = true;

	async getAutocompletions(options: AutoCompleteOptions): Promise<UIOption[]> {
		const { inter } = options;

		const eventIdString = inter.options.get("event")?.value as string | undefined;
		if (!eventIdString) return [];

		let event;
		try {
			event = inter.store.dbEvents().get(BigInt(eventIdString));
		}
		catch (e) {
			console.error(`RoomIndexOption.getAutocompletions: failed to resolve event "${eventIdString}":`, e);
			return [];
		}
		if (!event) return [];

		const rooms = Queries.selectManyEventQueues({ guildId: inter.guildId, eventId: event.id })
			.filter(eq => eq.queueRole === EventQueueRole.Room)
			.sort((a, b) => Number(a.queueIndex) - Number(b.queueIndex));

		const suggestions: UIOption[] = [];
		for (const room of rooms) {
			let label: string;
			if (room.pingChannelId) {
				const channel = await inter.store.jsChannel(room.pingChannelId);
				label = channel ? `#${channel.name}` : `(unknown channel ${room.pingChannelId})`;
			}
			else {
				label = "(default)";
			}
			suggestions.push({
				name: `Room ${room.queueIndex} — ${label}`,
				value: Number(room.queueIndex),
			});
		}
		return suggestions;
	}
}
