import { EmbedBuilder } from "discord.js";

export const embeds = [
	new EmbedBuilder()
		.setTitle("Auto-created per-room channels for /events")
		.setColor("#4c1fd5")
		.setDescription(
			"Events can now own a Discord category and auto-create one private `room-{N}` channel per room — no more manual channel + role + `/events set-room` for every room."
		)
		.addFields(
			{
				name: "How to enable",
				value:
					"Set `room_category` (and optionally `moderator_role`) on the event via `/events add` or `/events set`. The bot will:\n" +
					"- create a private `room-{N}` channel under that category, per room\n" +
					"- auto-create a role `{event} Room {N}` per room (used as in-queue role)\n" +
					"- set each room's ping channel to its main `room-{N}` channel\n" +
					"- grant the moderator role full access to all room channels (if set)",
			},
			{
				name: "Extra per-room channels",
				value:
					"`/events add-room-channel suffix:code slowmode:5 slowmode_time:minutes` creates a `room-code-{N}` channel for every room with 5-minute slowmode. `/events remove-room-channel` removes a template + its channels.",
			},
			{
				name: "Drift recovery",
				value: "`/events sync-room-channels` recreates any channels that were deleted out-of-band and re-applies overwrites.",
			},
			{
				name: "Cleanup",
				value: "`/events delete` now also deletes all auto-created channels and roles. User-supplied roles (set via `/events set-room`) are preserved.",
			},
			{
				name: "Required bot permission",
				value: "**Manage Channels** is required for auto-created channels. Make sure the bot's role has it in the target category.",
			}
		),
];
