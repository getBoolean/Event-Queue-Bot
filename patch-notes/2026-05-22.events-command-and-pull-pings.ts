import { EmbedBuilder } from "discord.js";

export const embeds = [
	new EmbedBuilder()
		.setTitle("Events and Pull Notifications")
		.setColor("#74ceaf")
		.addFields(
			{
				name: "New /events command",
				value: `Admins can now manage recurring event templates with auto-managed room and sub queues.

- Create events with room and sub queue sets
- Configure room and sub queue defaults separately
- Schedule event occurrences with automatic open, lock, room ping, and cleanup timing
- Set announcements and room ping messages with placeholders`,
			},
			{
				name: "Auto-created per-room channels and roles",
				value: `${"`room_category`"} is required on ${"`/events add`"}. The bot creates one private \`room-{N}\` text channel and one \`{event} Room {N}\` role per room under that category, and wires them into the event.

- ${"`/events add-room-channel suffix:code slowmode:5 slowmode_time:minutes`"} creates an extra \`room-code-{N}\` channel per room with optional slowmode.
- ${"`/events remove-room-channel`"} removes a template and its channels.
- ${"`/events sync-room-channels`"} recreates anything deleted out-of-band and re-applies permissions.
- ${"`/events delete`"} cleans up all auto-created channels and roles.

Requires the **Manage Channels** permission in the target category.`,
			},
			{
				name: "Room role assignment flags",
				value: `Four booleans on the event template decide where the auto-created room role is assigned. All four default to \`false\` — opt in explicitly to any auto-role behavior.

- ${"`role_in_room_queue`"} — assigned while a user is in the room queue
- ${"`role_on_room_pull`"} — assigned when pulled from the room queue
- ${"`role_in_sub_queue`"} — assigned while in the sub queue
- ${"`role_on_sub_pull`"} — assigned when pulled from the sub queue

Set them on ${"`/events add`"} or ${"`/events set`"}.`,
			},
			{
				name: "Pull messages can post in-channel",
				value: `The ${"`/pull`"} command now supports a channel option for public pull messages.

Admins can choose where the pull notification is posted when pulling members, making it easier to ping pulled members in the right event, room, or queue channel.`,
			},
			{
				name: "Event signup policies",
				value: `Three new options on ${"`/events add`"} and ${"`/events set`"} control how users sign up across an event's room and sub queues:

- ${"`max_rooms_per_user`"} — cap on room queues a user can join at once (\`0\` = unlimited)
- ${"`max_subs_per_user`"} — same, for sub queues
- ${"`parent_sub_mutually_exclusive`"} (default \`true\`) — a user can't be in both a room and its matching sub. Joining the sub while in the room is blocked; joining the room while in the sub silently kicks them from the sub. Set to \`false\` to allow both.`,
			},
			{
				name: "How to get started",
				value: `Use ${"`/events help`"} for the event workflow. Existing queue commands still work normally for non-event queues.`,
			},
		)
		.setFooter({ text: "This message can be viewed again with `/help patch-notes`" }),
];
