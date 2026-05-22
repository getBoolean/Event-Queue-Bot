import {
	ChannelType,
	type DiscordAPIError,
	type GuildBasedChannel,
	type OverwriteResolvable,
	PermissionFlagsBits,
	type Snowflake,
} from "discord.js";

import { Queries } from "../db/queries.ts";
import type {
	DbEvent,
	DbEventQueue,
	DbEventRoomChannel,
	DbQueue,
} from "../db/schema.ts";
import { Store } from "../db/store.ts";
import { EventQueueRole } from "../types/db.types.ts";
import { CustomError } from "./error.utils.ts";
import { QueueUtils } from "./queue.utils.ts";

const DISCORD_MAX_SLOWMODE_SECONDS = 21600;

export namespace EventChannelUtils {

	// ====================================================================
	//                        Helpers
	// ====================================================================

	export function buildChannelName(suffix: string | null, roomIndex: number | bigint): string {
		return suffix
			? `room-${suffix}-${roomIndex}`
			: `room-${roomIndex}`;
	}

	export function toSlowmodeSeconds(value: number | null | undefined, unit: string | null | undefined): number {
		if (value == null || value <= 0) return 0;
		let seconds: number;
		switch (unit) {
			case "seconds": seconds = value; break;
			case "hours": seconds = value * 3600; break;
			case "minutes":
			default: seconds = value * 60; break;
		}
		return Math.min(seconds, DISCORD_MAX_SLOWMODE_SECONDS);
	}

	function buildOverwrites(
		guildId: Snowflake,
		roomRoleId: Snowflake | null | undefined,
		moderatorRoleId: Snowflake | null | undefined,
	): OverwriteResolvable[] {
		const overwrites: OverwriteResolvable[] = [
			{
				id: guildId,
				deny: [PermissionFlagsBits.ViewChannel],
			},
		];
		if (roomRoleId) {
			overwrites.push({
				id: roomRoleId,
				allow: [
					PermissionFlagsBits.ViewChannel,
					PermissionFlagsBits.SendMessages,
					PermissionFlagsBits.ReadMessageHistory,
				],
			});
		}
		if (moderatorRoleId) {
			overwrites.push({
				id: moderatorRoleId,
				allow: [
					PermissionFlagsBits.ViewChannel,
					PermissionFlagsBits.SendMessages,
					PermissionFlagsBits.ReadMessageHistory,
					PermissionFlagsBits.ManageMessages,
				],
			});
		}
		return overwrites;
	}

	// ====================================================================
	//                        Roles
	// ====================================================================

	export async function ensureRoomRole(
		store: Store,
		event: DbEvent,
		eventQueue: DbEventQueue,
	): Promise<Snowflake | null> {
		if (eventQueue.autoCreatedRoleId) {
			return eventQueue.autoCreatedRoleId;
		}

		const roleName = `${event.name} Room ${eventQueue.queueIndex}`;
		try {
			const role = await store.guild.roles.create({
				name: roleName,
				reason: `Auto-created for event "${event.name}" room ${eventQueue.queueIndex}`,
			});
			store.updateEventQueue({ id: eventQueue.id, autoCreatedRoleId: role.id });
			return role.id;
		}
		catch (e) {
			console.error(`EventChannelUtils.ensureRoomRole: failed to create role "${roleName}" for event ${event.id}:`, e);
			throw new CustomError({
				message: `Failed to auto-create role for Room ${eventQueue.queueIndex}. Check that the bot has the Manage Roles permission.`,
			});
		}
	}

	export async function deleteAutoCreatedRoles(store: Store, event: DbEvent) {
		const eventQueues = Queries.selectManyEventQueues({ guildId: store.guild.id, eventId: event.id });
		for (const eq of eventQueues) {
			if (!eq.autoCreatedRoleId) continue;
			try {
				const role = await store.jsRole(eq.autoCreatedRoleId);
				if (role) {
					await role.delete(`Cleanup of auto-created role for event "${event.name}"`);
				}
			}
			catch (e) {
				console.error(`EventChannelUtils.deleteAutoCreatedRoles: failed to delete role ${eq.autoCreatedRoleId} for event ${event.id}:`, e);
			}
			store.updateEventQueue({ id: eq.id, autoCreatedRoleId: null });
		}
	}

	// ====================================================================
	//                        Channels
	// ====================================================================

	type DesiredChannel = {
		roomIndex: bigint;
		suffix: string | null;
		slowmodeSeconds: number;
		roomEventQueue: DbEventQueue;
		roomQueue: DbQueue;
	};

	export async function reconcileRoomChannels(store: Store, event: DbEvent) {
		if (!event.roomCategoryId) return;

		const category = await store.jsChannel(event.roomCategoryId);
		if (!category || category.type !== ChannelType.GuildCategory) {
			throw new CustomError({
				message: `Configured room category (${event.roomCategoryId}) was not found. Reset it with /events reset, or pick a new one with /events set.`,
			});
		}

		const eventQueues = Queries.selectManyEventQueues({ guildId: store.guild.id, eventId: event.id });
		const roomEqs = eventQueues
			.filter(eq => eq.queueRole === EventQueueRole.Room)
			.sort((a, b) => Number(a.queueIndex) - Number(b.queueIndex));

		const templates = Queries.selectManyRoomChannelTemplates({ guildId: store.guild.id, eventId: event.id });
		const existing = Queries.selectManyEventRoomChannels({ guildId: store.guild.id, eventId: event.id });

		// Build desired set: per room, one main (suffix=null) + one per template suffix
		const desired: DesiredChannel[] = [];
		for (const roomEq of roomEqs) {
			const queue = Queries.selectQueue({ guildId: store.guild.id, id: roomEq.queueId });
			if (!queue) continue;
			desired.push({
				roomIndex: roomEq.queueIndex,
				suffix: null,
				slowmodeSeconds: 0,
				roomEventQueue: roomEq,
				roomQueue: queue,
			});
			for (const tmpl of templates) {
				desired.push({
					roomIndex: roomEq.queueIndex,
					suffix: tmpl.suffix,
					slowmodeSeconds: Number(tmpl.slowmodeSeconds ?? 0n),
					roomEventQueue: roomEq,
					roomQueue: queue,
				});
			}
		}

		const keyOf = (roomIndex: bigint | number, suffix: string | null) => `${roomIndex}|${suffix ?? ""}`;

		const existingByKey = new Map<string, DbEventRoomChannel>();
		for (const row of existing) {
			existingByKey.set(keyOf(row.roomIndex, row.suffix), row);
		}
		const desiredByKey = new Map<string, DesiredChannel>();
		for (const d of desired) {
			desiredByKey.set(keyOf(d.roomIndex, d.suffix), d);
		}

		// Ensure room roles for every room (lazy creation)
		const roleByRoomIndex = new Map<bigint, Snowflake | null>();
		for (const roomEq of roomEqs) {
			const roleId = await ensureRoomRole(store, event, roomEq);
			roleByRoomIndex.set(roomEq.queueIndex, roleId);
		}

		// To-delete: existing − desired
		for (const [key, row] of existingByKey) {
			if (desiredByKey.has(key)) continue;
			await deleteRoomChannel(store, row);
		}

		// To-create + to-update
		for (const [key, d] of desiredByKey) {
			const existingRow = existingByKey.get(key);
			const roomRoleId = roleByRoomIndex.get(d.roomIndex) ?? null;
			const overwrites = buildOverwrites(store.guild.id, roomRoleId, event.moderatorRoleId);
			const channelName = buildChannelName(d.suffix, d.roomIndex);

			if (!existingRow) {
				// Create
				try {
					const channel = await store.guild.channels.create({
						name: channelName,
						type: ChannelType.GuildText,
						parent: event.roomCategoryId,
						rateLimitPerUser: d.slowmodeSeconds > 0 ? d.slowmodeSeconds : undefined,
						permissionOverwrites: overwrites,
						reason: `Auto-created for event "${event.name}" room ${d.roomIndex}${d.suffix ? ` (${d.suffix})` : ""}`,
					});
					store.insertEventRoomChannel({
						guildId: store.guild.id,
						eventId: event.id,
						roomIndex: d.roomIndex,
						suffix: d.suffix,
						channelId: channel.id,
					});
					if (d.suffix === null) {
						store.updateEventQueue({ id: d.roomEventQueue.id, pingChannelId: channel.id });
					}
				}
				catch (e) {
					console.error(`EventChannelUtils.reconcileRoomChannels: failed to create channel "${channelName}" for event ${event.id}:`, e);
					throw new CustomError({
						message: `Failed to create channel \`${channelName}\`. Check that the bot has the Manage Channels permission in the selected category.`,
					});
				}
			}
			else {
				// Update: verify channel still exists; re-apply overwrites and slowmode
				const channel = await tryFetchChannel(store, existingRow.channelId);
				if (!channel) {
					// Channel was deleted out-of-band — recreate
					store.deleteEventRoomChannel({ id: existingRow.id });
					try {
						const newChannel = await store.guild.channels.create({
							name: channelName,
							type: ChannelType.GuildText,
							parent: event.roomCategoryId,
							rateLimitPerUser: d.slowmodeSeconds > 0 ? d.slowmodeSeconds : undefined,
							permissionOverwrites: overwrites,
							reason: `Re-created (drift recovery) for event "${event.name}" room ${d.roomIndex}${d.suffix ? ` (${d.suffix})` : ""}`,
						});
						store.insertEventRoomChannel({
							guildId: store.guild.id,
							eventId: event.id,
							roomIndex: d.roomIndex,
							suffix: d.suffix,
							channelId: newChannel.id,
						});
						if (d.suffix === null) {
							store.updateEventQueue({ id: d.roomEventQueue.id, pingChannelId: newChannel.id });
						}
					}
					catch (e) {
						console.error(`EventChannelUtils.reconcileRoomChannels: failed to recreate channel "${channelName}" for event ${event.id}:`, e);
						throw new CustomError({
							message: `Failed to recreate channel \`${channelName}\`. Check that the bot has the Manage Channels permission in the selected category.`,
						});
					}
				}
				else {
					try {
						if ("permissionOverwrites" in channel && channel.permissionOverwrites) {
							await channel.permissionOverwrites.set(overwrites);
						}
						if ("setRateLimitPerUser" in channel) {
							await (channel as any).setRateLimitPerUser(d.slowmodeSeconds);
						}
					}
					catch (e) {
						console.error(`EventChannelUtils.reconcileRoomChannels: failed to re-apply settings on channel ${channel.id} for event ${event.id}:`, e);
					}
					if (d.suffix === null && d.roomEventQueue.pingChannelId !== channel.id) {
						store.updateEventQueue({ id: d.roomEventQueue.id, pingChannelId: channel.id });
					}
				}
			}
		}

		await reconcileRoleAssignments(store, event);
	}

	export async function reconcileRoleAssignments(store: Store, event: DbEvent) {
		const eventQueues = Queries.selectManyEventQueues({ guildId: store.guild.id, eventId: event.id });
		const byRoomIndex = new Map<bigint, { room?: DbEventQueue, sub?: DbEventQueue }>();
		for (const eq of eventQueues) {
			const slot = byRoomIndex.get(eq.queueIndex) ?? {};
			if (eq.queueRole === EventQueueRole.Room) slot.room = eq;
			else if (eq.queueRole === EventQueueRole.Sub) slot.sub = eq;
			byRoomIndex.set(eq.queueIndex, slot);
		}

		for (const { room: roomEq, sub: subEq } of byRoomIndex.values()) {
			if (!roomEq?.autoCreatedRoleId) continue;
			const autoRoleId = roomEq.autoCreatedRoleId;

			const roomQueue = Queries.selectQueue({ guildId: store.guild.id, id: roomEq.queueId });
			if (roomQueue) {
				await applyOrPreserveRole(store, roomQueue, "roleInQueueId", autoRoleId, event.roleInRoomQueue);
				await applyOrPreserveRole(store, roomQueue, "roleOnPullId", autoRoleId, event.roleOnRoomPull);
			}
			if (subEq) {
				const subQueue = Queries.selectQueue({ guildId: store.guild.id, id: subEq.queueId });
				if (subQueue) {
					await applyOrPreserveRole(store, subQueue, "roleInQueueId", autoRoleId, event.roleInSubQueue);
					await applyOrPreserveRole(store, subQueue, "roleOnPullId", autoRoleId, event.roleOnSubPull);
				}
			}
		}
	}

	async function applyOrPreserveRole(
		store: Store,
		queue: DbQueue,
		slot: "roleInQueueId" | "roleOnPullId",
		autoRoleId: Snowflake,
		flag: boolean,
	) {
		const current = queue[slot];
		if (flag && current !== autoRoleId) {
			await QueueUtils.updateQueues(store, [queue], { [slot]: autoRoleId } as Partial<DbQueue>);
		}
		else if (!flag && current === autoRoleId) {
			await QueueUtils.updateQueues(store, [queue], { [slot]: null } as Partial<DbQueue>);
		}
	}

	async function tryFetchChannel(store: Store, channelId: Snowflake): Promise<GuildBasedChannel | undefined> {
		try {
			return await store.guild.channels.fetch(channelId) ?? undefined;
		}
		catch (e) {
			const { status } = e as DiscordAPIError;
			if (status === 404) return undefined;
			console.error(`EventChannelUtils.tryFetchChannel: failed to fetch channel ${channelId}:`, e);
			return undefined;
		}
	}

	async function deleteRoomChannel(store: Store, row: DbEventRoomChannel) {
		try {
			const channel = await tryFetchChannel(store, row.channelId);
			if (channel) {
				await channel.delete(`Cleanup of auto-managed event room channel`);
			}
		}
		catch (e) {
			console.error(`EventChannelUtils.deleteRoomChannel: failed to delete channel ${row.channelId}:`, e);
		}
		store.deleteEventRoomChannel({ id: row.id });
	}

	export async function deleteAllEventChannels(store: Store, event: DbEvent) {
		const rows = Queries.selectManyEventRoomChannels({ guildId: store.guild.id, eventId: event.id });
		for (const row of rows) {
			await deleteRoomChannel(store, row);
		}
	}

	export async function deleteChannelsForSuffix(store: Store, event: DbEvent, suffix: string) {
		const rows = Queries.selectManyEventRoomChannels({ guildId: store.guild.id, eventId: event.id })
			.filter(r => r.suffix === suffix);
		for (const row of rows) {
			await deleteRoomChannel(store, row);
		}
	}
}
