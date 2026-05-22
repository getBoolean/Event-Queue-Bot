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
				name: "How to get started",
				value: `Use ${"`/events help`"} for the event workflow. Existing queue commands still work normally for non-event queues.`,
			},
		)
		.setFooter({ text: "This message can be viewed again with `/help patch-notes`" }),
];
