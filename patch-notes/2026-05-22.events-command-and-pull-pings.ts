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
- Set announcements and room ping messages with placeholders
- Configure per-room ping channel overrides`,
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
