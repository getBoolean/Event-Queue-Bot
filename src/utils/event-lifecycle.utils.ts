import {
	channelMention,
	type DiscordAPIError,
	type GuildScheduledEventCreateOptions,
	GuildScheduledEventEntityType,
	GuildScheduledEventPrivacyLevel,
	type GuildTextBasedChannel,
	type Snowflake,
	time,
	TimestampStyles,
} from "discord.js";
import { compact } from "lodash-es";

import { Queries } from "../db/queries.ts";
import {
	type DbEvent,
	type DbEventOccurrence,
	type DbEventQueue,
	type DbQueue,
} from "../db/schema.ts";
import { Store } from "../db/store.ts";
import { EventQueueRole, MemberRemovalReason, RoomScheduling, SubAutoPullMode } from "../types/db.types.ts";
import { ClientUtils } from "./client.utils.ts";
import { DisplayUtils } from "./display.utils.ts";
import * as EventCore from "./event-core.utils.ts";
import { unregisterJobs } from "./event-jobs.registry.ts";
import { reshowEventQueueDisplays } from "./event-sync-queues.utils.ts";
import { MemberUtils } from "./member.utils.ts";
import { QueueUtils } from "./queue.utils.ts";
import { WinnerUtils } from "./winner.utils.ts";

export async function getEventContext(guildId: Snowflake, occurrenceId: bigint) {
	const occurrence = Queries.selectOccurrence({ guildId, id: occurrenceId });
	if (!occurrence) return;

	const event = Queries.selectEvent({ guildId: occurrence.guildId, id: occurrence.eventId });
	if (!event) return;

	const guild = await ClientUtils.getGuild(occurrence.guildId);
	if (!guild) return;

	const store = new Store(guild);
	const eventQueues = Queries.selectManyEventQueues({ guildId: occurrence.guildId, eventId: event.id });
	const queueIds = eventQueues.map(eq => eq.queueId);
	const queuesById = new Map(
		Queries.selectManyQueuesByIds({ guildId: occurrence.guildId, ids: queueIds })
			.map(queue => [queue.id, queue]),
	);
	const queues = compact(queueIds.map(id => queuesById.get(id)));

	return { occurrence, event, store, eventQueues, queues };
}

export async function runOpenAction(guildId: Snowflake, occurrenceId: bigint) {
	const ctx = await getEventContext(guildId, occurrenceId);
	if (!ctx) return;
	const { occurrence, event, store, queues } = ctx;

	// Revoke the previous occurrence's winner roles — the badge lasts only until the next opens.
	await WinnerUtils.clearEventWinners(store, event);

	// Unlock all event queues
	if (queues.length > 0) {
		await QueueUtils.updateQueues(store, queues, { lockToggle: false } as Partial<DbQueue>);
	}

	// Re-show every event-queue display sequentially before announcing so the announcement
	// remains the most-recent message when announcementChannelId coincides with a display channel.
	await reshowEventQueueDisplays(store, event);

	// Send announcement
	if (event.announcementChannelId && event.announcementMessage) {
		try {
			const channel = await store.jsChannel(event.announcementChannelId) as GuildTextBasedChannel;
			if (channel) {
				const content = renderTemplate(event.announcementMessage, buildAnnouncementContext(event, occurrence));
				await channel.send({
					content,
					allowedMentions: { parse: ["everyone", "roles", "users"] },
				});
			}
		}
		catch (e) {
			console.error("Failed to send event announcement:", (e as Error).message);
		}
	}
}

export async function runLockAction(guildId: Snowflake, occurrenceId: bigint) {
	const ctx = await getEventContext(guildId, occurrenceId);
	if (!ctx) return;
	const { store, eventQueues } = ctx;

	// Lock only room queues
	const roomQueues = compact(
		eventQueues
			.filter(eq => eq.queueRole === EventQueueRole.Room)
			.map(eq => Queries.selectQueue({ guildId: store.guild.id, id: eq.queueId }))
	);

	if (roomQueues.length > 0) {
		await QueueUtils.updateQueues(store, roomQueues, { lockToggle: true } as Partial<DbQueue>);
	}
}

export async function runRoomPingAction(guildId: Snowflake, occurrenceId: bigint, eventQueue: DbEventQueue) {
	const occurrence = Queries.selectOccurrence({ guildId, id: occurrenceId });
	if (!occurrence) return;

	const event = Queries.selectEvent({ guildId: occurrence.guildId, id: occurrence.eventId });
	if (!event) return;

	const queue = Queries.selectQueue({ guildId: occurrence.guildId, id: eventQueue.queueId });
	if (!queue) return;

	const guild = await ClientUtils.getGuild(occurrence.guildId);
	if (!guild) return;
	const store = new Store(guild);

	const pingChannelId = eventQueue.pingChannelId ?? event.roomQueuesChannelId;

	try {
		const channel = await store.jsChannel(pingChannelId) as GuildTextBasedChannel;
		if (!channel) return;

		const template = event.roomPingMessage ?? "{room_role} — {room_name} is starting soon!";
		const ctx = buildRoomPingContext(event, occurrence, eventQueue, queue);
		const content = renderTemplate(template, ctx);

		if (content.trim()) {
			await channel.send({
				content,
				allowedMentions: { parse: ["roles", "users"] },
			});
		}
	}
	catch (e) {
		console.error("Failed to send room ping:", (e as Error).message);
	}
}

export async function runRoomPullAction(guildId: Snowflake, occurrenceId: bigint, roomEventQueue: DbEventQueue) {
	const ctx = await getEventContext(guildId, occurrenceId);
	if (!ctx) return;
	const { event, store, eventQueues } = ctx;

	const subEventQueue = eventQueues.find(eq =>
		eq.queueRole === EventQueueRole.Sub && eq.queueIndex === roomEventQueue.queueIndex
	);
	if (!subEventQueue) {
		console.warn(`EventUtils.runRoomPullAction: no paired sub event-queue for room index ${roomEventQueue.queueIndex} of event ${event.id} — skipping`);
		return;
	}

	const roomQueue = Queries.selectQueue({ guildId: store.guild.id, id: roomEventQueue.queueId });
	const subQueue = Queries.selectQueue({ guildId: store.guild.id, id: subEventQueue.queueId });
	if (!roomQueue || !subQueue) {
		console.warn(`EventUtils.runRoomPullAction: missing queue rows for event ${event.id} room index ${roomEventQueue.queueIndex} — skipping`);
		return;
	}

	// Always lock the paired sub queue first — auto-pull bundles sub-lock atomically.
	await QueueUtils.updateQueues(store, [subQueue], { lockToggle: true } as Partial<DbQueue>);

	if (event.shuffleSubsBeforeAutoPullToggle) {
		await MemberUtils.shuffleMembers(store, subQueue, undefined);
	}

	const currentRoomCount = Queries.selectManyMembers({ guildId: store.guild.id, queueId: roomQueue.id }).length;
	const subAvailable = Queries.selectManyMembers({ guildId: store.guild.id, queueId: subQueue.id }).length;
	const count = roomQueue.size == null
		? subAvailable
		: Math.min(Number(roomQueue.size) - currentRoomCount, subAvailable);

	if (count <= 0) {
		console.log(`EventUtils.runRoomPullAction: nothing to pull for event ${event.id} room index ${roomEventQueue.queueIndex} (currentRoomCount=${currentRoomCount}, subAvailable=${subAvailable}, size=${roomQueue.size}) — skipping pull`);
		return;
	}

	if (event.subAutoPullMode === SubAutoPullMode.Promote) {
		const subMembers = Queries.selectManyMembers({
			guildId: store.guild.id,
			queueId: subQueue.id,
			count,
		});
		for (const subMember of subMembers) {
			const jsMember = await store.jsMember(subMember.userId);
			if (!jsMember) continue;

			try {
				// Insert into room queue first so a failed insert never leaves the member off both queues.
				// force:true bypasses verifyMemberEligibility so the room queue's lockToggle=true
				// (set by runLockAction) does not block this system insert.
				await MemberUtils.insertMember({
					store,
					queue: roomQueue,
					jsMember,
					message: subMember.message ?? undefined,
					force: true,
				});

				// Delete from sub queue directly via store (skips MemberUtils.deleteMembers messaging,
				// DM-on-pull, voice destination, and role-on-pull side effects — we promote silently).
				store.deleteMember({ id: subMember.id }, MemberRemovalReason.Pulled);

				if (subQueue.roleInQueueId) {
					await MemberUtils.modifyMemberRoles(store, subMember.userId, subQueue.roleInQueueId, "remove")
						.catch(e => console.error(`EventUtils.runRoomPullAction: failed to remove sub roleInQueueId from user ${subMember.userId}:`, e));
				}
			}
			catch (e) {
				console.error(`EventUtils.runRoomPullAction: failed to promote user ${subMember.userId} into room queue ${roomQueue.id}:`, e);
			}
		}
		await DisplayUtils.requestDisplayUpdate({ store, queueId: subQueue.id });
		await DisplayUtils.requestDisplayUpdate({ store, queueId: roomQueue.id });
	}
	else {
		await MemberUtils.deleteMembers({
			store,
			queues: [subQueue],
			reason: MemberRemovalReason.Pulled,
			by: { count },
			force: true,
		});
		await DisplayUtils.requestDisplayUpdate({ store, queueId: roomQueue.id });
	}
}

export async function runCleanupAction(guildId: Snowflake, occurrenceId: bigint) {
	const ctx = await getEventContext(guildId, occurrenceId);
	if (!ctx) return;
	const { store, queues } = ctx;

	// Clear all members from all event queues
	if (queues.length > 0) {
		await MemberUtils.deleteMembers({
			store,
			queues,
			reason: MemberRemovalReason.Kicked,
			by: { count: 9999 },
			force: true,
		});

		// Lock all queues
		await QueueUtils.updateQueues(store, queues, { lockToggle: true } as Partial<DbQueue>);
	}

	// Delete the occurrence row
	store.deleteOccurrence({ id: occurrenceId });
	unregisterJobs(occurrenceId);
}

function renderTemplate(template: string, ctx: Record<string, string>): string {
	return template.replace(/\{(\w+)\}/g, (_, k) => ctx[k] ?? "");
}

function buildAnnouncementContext(event: DbEvent, occurrence: DbEventOccurrence): Record<string, string> {
	const startDate = new Date(Number(occurrence.startTime));
	return {
		event_name: event.name,
		start_time: time(startDate, TimestampStyles.LongDateTime),
		start_time_relative: time(startDate, TimestampStyles.RelativeTime),
		room_queues_channel: channelMention(event.roomQueuesChannelId),
		sub_queues_channel: channelMention(event.subQueuesChannelId),
	};
}

function buildRoomPingContext(
	event: DbEvent,
	occurrence: DbEventOccurrence,
	eventQueue: DbEventQueue,
	queue: DbQueue,
): Record<string, string> {
	const startDate = new Date(Number(occurrence.startTime));
	const roleStr = queue.roleInQueueId ? `<@&${queue.roleInQueueId}>` : "";
	const pingChId = eventQueue.pingChannelId ?? event.roomQueuesChannelId;
	return {
		event_name: event.name,
		room_name: queue.name,
		room_role: roleStr,
		room_index: String(eventQueue.queueIndex),
		room_queues_channel: channelMention(event.roomQueuesChannelId),
		ping_channel: channelMention(pingChId),
		start_time: time(startDate, TimestampStyles.LongDateTime),
		start_time_relative: time(startDate, TimestampStyles.RelativeTime),
	};
}

const DISCORD_EVENT_NAME_LIMIT = 100;
const DISCORD_EVENT_DESCRIPTION_LIMIT = 1000;
const DISCORD_EVENT_LOCATION_LIMIT = 100;
const DISCORD_UNKNOWN_GUILD_SCHEDULED_EVENT = 10070;

function resolveRoomChannelName(store: Store, event: DbEvent): string {
	const cached = store.guild.channels.cache.get(event.roomQueuesChannelId);
	return cached?.name ?? event.roomQueuesChannelId;
}

function renderDiscordEventDescription(event: DbEvent, occurrence: DbEventOccurrence): string {
	if (event.discordEventDescription) {
		return renderTemplate(event.discordEventDescription, buildAnnouncementContext(event, occurrence));
	}
	const scheduling = (event.roomScheduling as RoomScheduling) === RoomScheduling.Sequential
		? "sequential"
		: "parallel";
	return [
		`Room queues channel: ${channelMention(event.roomQueuesChannelId)}`,
		`Sub queues channel: ${channelMention(event.subQueuesChannelId)}`,
		`Rooms: ${event.roomCount} (${scheduling})`,
	].join("\n");
}

function buildDiscordEventOptions(
	event: DbEvent,
	occurrence: DbEventOccurrence,
	roomChannelName: string,
): GuildScheduledEventCreateOptions {
	const startMs = Number(occurrence.startTime);
	const endMs = EventCore.getRoomsFinishMs(event, startMs) + Number(event.cleanupOffsetMs);
	return {
		name: event.name.substring(0, DISCORD_EVENT_NAME_LIMIT),
		scheduledStartTime: new Date(startMs),
		scheduledEndTime: new Date(endMs),
		privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
		entityType: GuildScheduledEventEntityType.External,
		description: renderDiscordEventDescription(event, occurrence).substring(0, DISCORD_EVENT_DESCRIPTION_LIMIT),
		entityMetadata: {
			location: roomChannelName.substring(0, DISCORD_EVENT_LOCATION_LIMIT),
		},
	};
}

function isUnknownDiscordEventError(e: unknown): boolean {
	const err = e as DiscordAPIError;
	return err?.code === DISCORD_UNKNOWN_GUILD_SCHEDULED_EVENT || err?.status === 404;
}

export async function createDiscordScheduledEvent(store: Store, event: DbEvent, occurrence: DbEventOccurrence) {
	if (Number(occurrence.startTime) <= Date.now()) {
		// Discord rejects external events whose start time is not in the future
		return;
	}
	try {
		const options = buildDiscordEventOptions(event, occurrence, resolveRoomChannelName(store, event));
		const created = await store.guild.scheduledEvents.create(options);
		store.updateOccurrence({ id: occurrence.id }, { discordEventId: created.id });
	}
	catch (e) {
		console.error(`Failed to create Discord scheduled event for occurrence ${occurrence.id}:`, e);
	}
}

export async function updateDiscordScheduledEvent(store: Store, event: DbEvent, occurrence: DbEventOccurrence) {
	if (!occurrence.discordEventId) return;
	try {
		const options = buildDiscordEventOptions(event, occurrence, resolveRoomChannelName(store, event));
		await store.guild.scheduledEvents.edit(occurrence.discordEventId, options);
	}
	catch (e) {
		if (isUnknownDiscordEventError(e)) return;
		console.error(`Failed to update Discord scheduled event for occurrence ${occurrence.id}:`, e);
	}
}

export async function deleteDiscordScheduledEvent(store: Store, occurrence: DbEventOccurrence) {
	if (!occurrence.discordEventId) return;
	try {
		await store.guild.scheduledEvents.delete(occurrence.discordEventId);
	}
	catch (e) {
		if (isUnknownDiscordEventError(e)) return;
		console.error(`Failed to delete Discord scheduled event for occurrence ${occurrence.id}:`, e);
	}
}
