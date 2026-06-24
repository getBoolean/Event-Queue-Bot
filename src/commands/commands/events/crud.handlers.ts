import { channelMention, type Collection, roleMention, time, TimestampStyles } from "discord.js";
import { isNil, omitBy } from "lodash-es";

import { Queries } from "../../../db/queries.ts";
import { type DbEvent, EVENT_TABLE } from "../../../db/schema.ts";
import { type RoomScheduling, type SubAutoPullMode } from "../../../types/db.types.ts";
import type { SlashInteraction } from "../../../types/interaction.types.ts";
import { EventUtils } from "../../../utils/event.utils.ts";
import { toCollection } from "../../../utils/misc.utils.ts";
import { commandMention, describeTable, eventMention, queuesMention } from "../../../utils/string.utils.ts";
import { EventsOptions } from "./options.ts";
import { buildEventOffsetFields, verifyMentionEveryonePermission } from "./shared.ts";

export namespace EventsCrudHandlers {
	export async function get(inter: SlashInteraction, events?: Collection<bigint, DbEvent>) {
		events = events ?? await EventsOptions.GET_OPTIONS.events.get(inter);

		if (!events || events.size === 0) {
			events = inter.store.dbEvents();
		}

		if (events.size === 0) {
			await inter.respond(`No events found. Create one with ${commandMention("events", "add")}.`);
			return;
		}

		const entries = events.map(event => {
			const occurrences = Queries.selectManyOccurrences({ guildId: inter.guildId, eventId: event.id });
			const nextOcc = occurrences.sort((a, b) => Number(a.startTime) - Number(b.startTime))[0];
			const templates = Queries.selectManyRoomChannelTemplates({ guildId: inter.guildId, eventId: event.id });
			const templateSummary = templates.length
				? templates.map(t => `${t.suffix}${t.slowmodeSeconds ? ` (slowmode: ${t.slowmodeSeconds}s)` : ""}`).join(", ")
				: null;
			return {
				...event,
				createOffsetMs: `${Number(event.createOffsetMs) / 3_600_000}h`,
				lockOffsetMs: `${Number(event.lockOffsetMs) / 60_000}min`,
				cleanupOffsetMs: `${Number(event.cleanupOffsetMs) / 3_600_000}h`,
				roomLengthMs: event.roomLengthMs ? `${Number(event.roomLengthMs) / 60_000}min` : null,
				nextOccurrence: nextOcc ? time(new Date(Number(nextOcc.startTime)), TimestampStyles.LongDateTime) : "None",
				nextOccurrenceDiscordEventId: nextOcc?.discordEventId ?? null,
				roomQueuesChannelId: channelMention(event.roomQueuesChannelId),
				subQueuesChannelId: channelMention(event.subQueuesChannelId),
				announcementChannelId: event.announcementChannelId ? channelMention(event.announcementChannelId) : null,
				roomCategoryId: event.roomCategoryId ? channelMention(event.roomCategoryId) : null,
				roomChannelTemplates: templateSummary,
				winnerRoleId: event.winnerRoleId ? roleMention(event.winnerRoleId) : null,
			};
		});

		const descriptionMessage = describeTable({
			store: inter.store,
			table: EVENT_TABLE,
			tableLabel: "Events",
			entryLabelProperty: "name",
			entries: [...entries.values()],
			hiddenProperties: ["name", "queueId"],
			queueIdProperty: "id",
		});

		await inter.respond(descriptionMessage);
	}

	export async function add(inter: SlashInteraction) {
		const roomLengthMinutes = EventsOptions.ADD_OPTIONS.roomLengthMinutes.get(inter);
		const createOffsetHours = EventsOptions.ADD_OPTIONS.createOffsetHours.get(inter);
		const lockOffsetMinutes = EventsOptions.ADD_OPTIONS.lockOffsetMinutes.get(inter);
		const cleanupOffsetHours = EventsOptions.ADD_OPTIONS.cleanupOffsetHours.get(inter);
		const announcementChannelId = EventsOptions.ADD_OPTIONS.announcementChannel.get(inter)?.id;
		const announcementMessage = EventsOptions.ADD_OPTIONS.announcementMessage.get(inter);

		const newEvent = {
			name: EventsOptions.ADD_OPTIONS.name.get(inter)?.substring(0, 240),
			roomCount: BigInt(EventsOptions.ADD_OPTIONS.roomCount.get(inter)),
			roomQueuesChannelId: EventsOptions.ADD_OPTIONS.roomQueuesChannel.get(inter)?.id,
			subQueuesChannelId: EventsOptions.ADD_OPTIONS.subQueuesChannel.get(inter)?.id,
			roomCategoryId: EventsOptions.ADD_OPTIONS.roomCategory.get(inter)?.id,
			...omitBy({
				roomScheduling: EventsOptions.ADD_OPTIONS.roomScheduling.get(inter) as RoomScheduling,
				...buildEventOffsetFields({ roomLengthMinutes, createOffsetHours, lockOffsetMinutes, cleanupOffsetHours }),
				announcementChannelId,
				announcementMessage,
				roomPingMessage: EventsOptions.ADD_OPTIONS.roomPingMessage.get(inter),
				maxRoomsPerUser: EventsOptions.ADD_OPTIONS.maxRoomsPerUser.get(inter),
				maxSubsPerUser: EventsOptions.ADD_OPTIONS.maxSubsPerUser.get(inter),
				parentSubMutuallyExclusive: EventsOptions.ADD_OPTIONS.parentSubMutuallyExclusive.get(inter),
				roleInRoomQueue: EventsOptions.ADD_OPTIONS.roleInRoomQueue.get(inter),
				roleOnRoomPull: EventsOptions.ADD_OPTIONS.roleOnRoomPull.get(inter),
				roleInSubQueue: EventsOptions.ADD_OPTIONS.roleInSubQueue.get(inter),
				roleOnSubPull: EventsOptions.ADD_OPTIONS.roleOnSubPull.get(inter),
				autoPullSubsAtRoomStartToggle: EventsOptions.ADD_OPTIONS.autoPullSubsAtRoomStartToggle.get(inter),
				shuffleSubsBeforeAutoPullToggle: EventsOptions.ADD_OPTIONS.shuffleSubsBeforeAutoPullToggle.get(inter),
				subAutoPullMode: EventsOptions.ADD_OPTIONS.subAutoPullMode.get(inter) as SubAutoPullMode,
				createDiscordEvent: EventsOptions.ADD_OPTIONS.createDiscordEvent.get(inter),
				discordEventDescription: EventsOptions.ADD_OPTIONS.discordEventDescription.get(inter),
			}, isNil),
		};

		if (announcementMessage && announcementChannelId) {
			verifyMentionEveryonePermission(inter, announcementMessage, announcementChannelId);
		}

		const event = await EventUtils.insertEvent(inter.store, newEvent);

		const eventQueues = Queries.selectManyEventQueues({ guildId: inter.guildId, eventId: event.id });
		const queues = eventQueues.map(eq => inter.store.dbQueues().get(eq.queueId)).filter(Boolean);

		await inter.respond(
			`Created event ${eventMention(event)} with ${queues.length} queues: ${queuesMention(queues)}.`,
			true,
		);

		await get(inter, toCollection<bigint, DbEvent>("id", [event]));
	}

	export async function set(inter: SlashInteraction) {
		const event = await EventsOptions.SET_OPTIONS.event.get(inter);
		const roomLengthMinutes = EventsOptions.SET_OPTIONS.roomLengthMinutes.get(inter);
		const createOffsetHours = EventsOptions.SET_OPTIONS.createOffsetHours.get(inter);
		const lockOffsetMinutes = EventsOptions.SET_OPTIONS.lockOffsetMinutes.get(inter);
		const cleanupOffsetHours = EventsOptions.SET_OPTIONS.cleanupOffsetHours.get(inter);
		const announcementChannelId = EventsOptions.SET_OPTIONS.announcementChannel.get(inter)?.id;
		const announcementMessage = EventsOptions.SET_OPTIONS.announcementMessage.get(inter);

		const update = omitBy({
			roomCount: EventsOptions.SET_OPTIONS.roomCount.get(inter) ? BigInt(EventsOptions.SET_OPTIONS.roomCount.get(inter)) : undefined,
			roomScheduling: EventsOptions.SET_OPTIONS.roomScheduling.get(inter) as RoomScheduling,
			...buildEventOffsetFields({ roomLengthMinutes, createOffsetHours, lockOffsetMinutes, cleanupOffsetHours }),
			announcementChannelId,
			announcementMessage,
			roomPingMessage: EventsOptions.SET_OPTIONS.roomPingMessage.get(inter),
			maxRoomsPerUser: EventsOptions.SET_OPTIONS.maxRoomsPerUser.get(inter),
			maxSubsPerUser: EventsOptions.SET_OPTIONS.maxSubsPerUser.get(inter),
			parentSubMutuallyExclusive: EventsOptions.SET_OPTIONS.parentSubMutuallyExclusive.get(inter),
			roomCategoryId: EventsOptions.SET_OPTIONS.roomCategory.get(inter)?.id,
			roleInRoomQueue: EventsOptions.SET_OPTIONS.roleInRoomQueue.get(inter),
			roleOnRoomPull: EventsOptions.SET_OPTIONS.roleOnRoomPull.get(inter),
			roleInSubQueue: EventsOptions.SET_OPTIONS.roleInSubQueue.get(inter),
			roleOnSubPull: EventsOptions.SET_OPTIONS.roleOnSubPull.get(inter),
			autoPullSubsAtRoomStartToggle: EventsOptions.SET_OPTIONS.autoPullSubsAtRoomStartToggle.get(inter),
			shuffleSubsBeforeAutoPullToggle: EventsOptions.SET_OPTIONS.shuffleSubsBeforeAutoPullToggle.get(inter),
			subAutoPullMode: EventsOptions.SET_OPTIONS.subAutoPullMode.get(inter) as SubAutoPullMode,
			createDiscordEvent: EventsOptions.SET_OPTIONS.createDiscordEvent.get(inter),
			discordEventDescription: EventsOptions.SET_OPTIONS.discordEventDescription.get(inter),
			winnerRoleId: EventsOptions.SET_OPTIONS.winnerRole.get(inter)?.id,
		}, isNil);

		const effectiveMessage = announcementMessage ?? event.announcementMessage;
		const effectiveChannel = announcementChannelId ?? event.announcementChannelId;
		if (effectiveMessage && effectiveChannel) {
			verifyMentionEveryonePermission(inter, effectiveMessage, effectiveChannel);
		}

		const updatedEvent = await EventUtils.updateEvent(inter.store, event, update);

		await inter.respond(`Updated ${eventMention(updatedEvent)}.`, true);
		await get(inter, toCollection<bigint, DbEvent>("id", [updatedEvent]));
	}

	export async function deleteEvent(inter: SlashInteraction) {
		await inter.deferReply();
		const event = await EventsOptions.DELETE_OPTIONS.event.get(inter);

		const confirmed = await inter.promptConfirmOrCancel(
			`Are you sure you want to delete the ${eventMention(event)} event? This will also delete all associated queues and displays.`,
		);
		if (!confirmed) {
			await inter.respond("Cancelled delete.");
			return;
		}

		await EventUtils.deleteEvent(inter.store, event);

		await inter.respond(`Deleted the ${eventMention(event)} event and all its queues.`, true);
	}
}
