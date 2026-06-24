import { SlashCommandBuilder } from "discord.js";

import { AdminCommand } from "../../types/command.types.ts";
import { EventsChannelsHandlers } from "./events/channels.handlers.ts";
import { EventsCrudHandlers } from "./events/crud.handlers.ts";
import { EventsDefaultsHandlers } from "./events/defaults.handlers.ts";
import { EventsHelpHandlers } from "./events/help.handlers.ts";
import { EventsOptions } from "./events/options.ts";
import { EventsScheduleHandlers } from "./events/schedule.handlers.ts";
import { EventsSyncHandlers } from "./events/sync.handlers.ts";
import { EventsWinnersHandlers } from "./events/winners.handlers.ts";

export class EventsCommand extends AdminCommand {
	static readonly ID = "events";

	ephemeralSubcommands = new Set(["events_get", "events_help"]);

	events_get = EventsCrudHandlers.get;
	events_add = EventsCrudHandlers.add;
	events_set = EventsCrudHandlers.set;
	events_set_room_defaults = EventsDefaultsHandlers.setRoomDefaults;
	events_set_sub_defaults = EventsDefaultsHandlers.setSubDefaults;
	events_add_room_channel = EventsChannelsHandlers.addRoomChannel;
	events_remove_room_channel = EventsChannelsHandlers.removeRoomChannel;
	events_sync_room_channels = EventsChannelsHandlers.syncRoomChannels;
	events_sync_queues = EventsSyncHandlers.syncQueues;
	events_reset = EventsDefaultsHandlers.reset;
	events_reset_room_defaults = EventsDefaultsHandlers.resetRoomDefaults;
	events_reset_sub_defaults = EventsDefaultsHandlers.resetSubDefaults;
	events_schedule = EventsScheduleHandlers.schedule;
	events_cancel = EventsScheduleHandlers.cancel;
	events_delete = EventsCrudHandlers.deleteEvent;
	events_declare_winners = EventsWinnersHandlers.declareWinners;
	events_winners = EventsWinnersHandlers.winners;
	events_clear_winners = EventsWinnersHandlers.clearWinners;
	events_help = EventsHelpHandlers.help;

	data = new SlashCommandBuilder()
		.setName(EventsCommand.ID)
		.setDescription("Manage recurring events with auto-managed queues")
		.addSubcommand(subcommand => {
			subcommand
				.setName("get")
				.setDescription("Show event details");
			Object.values(EventsOptions.GET_OPTIONS).forEach(option => option.addToCommand(subcommand));
			return subcommand;
		})
		.addSubcommand(subcommand => {
			subcommand
				.setName("add")
				.setDescription("Create event with room + sub queues");
			Object.values(EventsOptions.ADD_OPTIONS).forEach(option => option.addToCommand(subcommand));
			return subcommand;
		})
		.addSubcommand(subcommand => {
			subcommand
				.setName("set")
				.setDescription("Update event properties");
			Object.values(EventsOptions.SET_OPTIONS).forEach(option => option.addToCommand(subcommand));
			return subcommand;
		})
		.addSubcommand(subcommand => {
			subcommand
				.setName("set-room-defaults")
				.setDescription("Set room queue defaults");
			Object.values(EventsOptions.SET_ROOM_DEFAULTS_OPTIONS).forEach(option => option.addToCommand(subcommand));
			return subcommand;
		})
		.addSubcommand(subcommand => {
			subcommand
				.setName("set-sub-defaults")
				.setDescription("Set sub queue defaults");
			Object.values(EventsOptions.SET_SUB_DEFAULTS_OPTIONS).forEach(option => option.addToCommand(subcommand));
			return subcommand;
		})
		.addSubcommand(subcommand => {
			subcommand
				.setName("add-room-channel")
				.setDescription("Add per-room channel template (e.g. room-code-{N})");
			Object.values(EventsOptions.ADD_ROOM_CHANNEL_OPTIONS).forEach(option => option.addToCommand(subcommand));
			return subcommand;
		})
		.addSubcommand(subcommand => {
			subcommand
				.setName("remove-room-channel")
				.setDescription("Remove per-room channel template");
			Object.values(EventsOptions.REMOVE_ROOM_CHANNEL_OPTIONS).forEach(option => option.addToCommand(subcommand));
			return subcommand;
		})
		.addSubcommand(subcommand => {
			subcommand
				.setName("sync-room-channels")
				.setDescription("Recreate missing room channels, fix perms + order");
			Object.values(EventsOptions.SYNC_ROOM_CHANNELS_OPTIONS).forEach(option => option.addToCommand(subcommand));
			return subcommand;
		})
		.addSubcommand(subcommand => {
			subcommand
				.setName("sync-queues")
				.setDescription("Recreate missing queues, re-apply defaults, fix display order");
			Object.values(EventsOptions.SYNC_QUEUES_OPTIONS).forEach(option => option.addToCommand(subcommand));
			return subcommand;
		})
		.addSubcommand(subcommand => {
			subcommand
				.setName("reset")
				.setDescription("Reset event properties");
			Object.values(EventsOptions.RESET_OPTIONS).forEach(option => option.addToCommand(subcommand));
			return subcommand;
		})
		.addSubcommand(subcommand => {
			subcommand
				.setName("reset-room-defaults")
				.setDescription("Reset room queue defaults");
			Object.values(EventsOptions.RESET_ROOM_DEFAULTS_OPTIONS).forEach(option => option.addToCommand(subcommand));
			return subcommand;
		})
		.addSubcommand(subcommand => {
			subcommand
				.setName("reset-sub-defaults")
				.setDescription("Reset sub queue defaults");
			Object.values(EventsOptions.RESET_SUB_DEFAULTS_OPTIONS).forEach(option => option.addToCommand(subcommand));
			return subcommand;
		})
		.addSubcommand(subcommand => {
			subcommand
				.setName("schedule")
				.setDescription("Schedule an occurrence");
			Object.values(EventsOptions.SCHEDULE_OPTIONS).forEach(option => option.addToCommand(subcommand));
			return subcommand;
		})
		.addSubcommand(subcommand => {
			subcommand
				.setName("cancel")
				.setDescription("Cancel a pending occurrence");
			Object.values(EventsOptions.CANCEL_OPTIONS).forEach(option => option.addToCommand(subcommand));
			return subcommand;
		})
		.addSubcommand(subcommand => {
			subcommand
				.setName("delete")
				.setDescription("Delete event + its queues");
			Object.values(EventsOptions.DELETE_OPTIONS).forEach(option => option.addToCommand(subcommand));
			return subcommand;
		})
		.addSubcommand(subcommand => {
			subcommand
				.setName("declare-winners")
				.setDescription("Grant the winner role to the event's winner(s)");
			Object.values(EventsOptions.DECLARE_WINNERS_OPTIONS).forEach(option => option.addToCommand(subcommand));
			return subcommand;
		})
		.addSubcommand(subcommand => {
			subcommand
				.setName("winners")
				.setDescription("List declared winners");
			Object.values(EventsOptions.WINNERS_OPTIONS).forEach(option => option.addToCommand(subcommand));
			return subcommand;
		})
		.addSubcommand(subcommand => {
			subcommand
				.setName("clear-winners")
				.setDescription("Revoke the winner role for the event");
			Object.values(EventsOptions.CLEAR_WINNERS_OPTIONS).forEach(option => option.addToCommand(subcommand));
			return subcommand;
		})
		.addSubcommand(subcommand => {
			subcommand
				.setName("help")
				.setDescription("Event command help");
			return subcommand;
		});
}
