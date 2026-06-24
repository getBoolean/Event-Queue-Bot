import { EmbedBuilder, inlineCode } from "discord.js";

import { Color } from "../../../types/db.types.ts";
import type { SlashInteraction } from "../../../types/interaction.types.ts";
import { commandMention } from "../../../utils/string.utils.ts";

export namespace EventsHelpHandlers {
	export async function help(inter: SlashInteraction) {
		const embeds = [new EmbedBuilder()
			.setTitle("Events")
			.setColor(Color.Indigo)
			.setDescription(
				"Events let you create recurring event templates with auto-managed room and sub queues.\n\n" +
				"**Quick start:**\n" +
				`1. ${commandMention("events", "add")} — create an event with N rooms (${inlineCode("room_category")} is required; one private \`room-{N}\` channel and a \`{event} Room {N}\` role are auto-created per room)\n` +
				`2. ${commandMention("events", "set-room-defaults")} — configure room queue defaults (size, etc.)\n` +
				`3. ${commandMention("events", "schedule")} — schedule an occurrence (\`event\`, \`year\`, \`month\`, \`day\`, \`start_time\` (12-hour, e.g. \`9:30 PM\`), optional \`timezone\`)\n\n` +
				"**Lifecycle per occurrence:**\n" +
				"- **T − create_offset** (default 24h before): queues unlock, displays refresh, announcement posts\n" +
				"- **T + lock_offset** (default 0): room queues lock (sub queues stay open)\n" +
				"- **Per-room ping**: at each room's start time a ping posts in the room's channel\n" +
				"- **rooms_finish + cleanup_offset** (default 1h after rooms finish): all members cleared, all queues locked\n" +
				"- A native Discord scheduled event is created per occurrence when `create_discord_event` is on (default).\n\n" +
				"**Missed actions** (bot was down): run automatically on next startup.\n\n" +
				"**Signup policies** (set via `/events add` or `/events set`):\n" +
				"- `max_rooms_per_user` — cap on room queues a single user may sit in at once (`0` = unlimited)\n" +
				"- `max_subs_per_user` — cap on sub-room queues (`0` = unlimited)\n" +
				"- `parent_sub_mutually_exclusive` — when `true` (default), a user can't sit in both a room and its matching sub. Joining the room silently removes them from the sub; joining the sub while already in the room is blocked.\n\n" +
				"**Room role assignment** — four booleans on the event template control which queues the auto-created `{event} Room {N}` role gets wired into:\n" +
				"- `role_in_room_queue` (default `false`) — assign the role while a user is in the room queue\n" +
				"- `role_on_room_pull` (default `false`) — assign the role when a user is pulled from the room queue\n" +
				"- `role_in_sub_queue` (default `false`) — assign the role while a user is in the sub queue\n" +
				"- `role_on_sub_pull` (default `false`) — assign the role when a user is pulled from the sub queue\n\n" +
				"**Declaring winners** — crown the event's winner(s) with one shared role that auto-revokes when the event's next occurrence opens:\n" +
				`- Configure the role once via \`winner_role\` on ${commandMention("events", "set")}.\n` +
				`- ${commandMention("events", "declare-winners")} (\`winner_1\`..\`winner_5\`) grants it — additive, ties allowed; call again for >5 winners.\n` +
				`- ${commandMention("events", "winners")} lists current winners; ${commandMention("events", "clear-winners")} revokes early.\n` +
				"- With multiple occurrences scheduled, the **earliest** one to open revokes the role.\n\n" +
				"**Auto-pull subs at room start:**\n" +
				"- `auto_pull_subs_room_start_toggle` (default `false`) — at each room's start, lock paired sub and pull subs into the room. Forces room lock at exact `start_time` (ignores `lock_offset`).\n" +
				"- `shuffle_subs_before_pull_toggle` (default `false`) — shuffle the sub queue before the pull.\n" +
				"- `sub_auto_pull_mode` (default `drain`) — `drain`: standard `/pull` side effects fire. `promote`: move into room queue (bypasses room lock), no sub-side pull effects.\n\n" +
				"**Extra per-room channels:**\n" +
				`- ${commandMention("events", "add-room-channel")} adds an extra per-room channel like \`room-code-{N}\`, with optional slowmode.\n` +
				`- ${commandMention("events", "remove-room-channel")} removes one of those templates and its channels.\n` +
				`- ${commandMention("events", "sync-room-channels")} recreates any channels you accidentally deleted, re-applies permissions, and restores channel order.\n` +
				`- ${commandMention("events", "sync-queues")} recreates any deleted queues, re-applies the room/sub defaults to every queue, and re-posts displays in queue-index order.\n\n` +
				"**Announcement placeholders:** `{event_name}`, `{start_time}`, `{start_time_relative}`, `{room_queues_channel}`, `{sub_queues_channel}`\n" +
				"**Ping placeholders:** `{room_role}`, `{room_name}`, `{room_index}`, `{room_queues_channel}`, `{ping_channel}`, `{start_time}`, `{start_time_relative}`",
			)];

		await inter.respond({ embeds });
	}
}
