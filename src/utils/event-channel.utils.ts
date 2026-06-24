import {
	ChannelType,
	type DiscordAPIError,
	type GuildBasedChannel,
	type OverwriteResolvable,
	OverwriteType,
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
import { EventSyncLock } from "./event-sync-lock.utils.ts";
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
		store: Store,
		roomRoleId: Snowflake | null | undefined,
	): OverwriteResolvable[] {
		// View Channel is the only permission we manage here. Everything else
		// (Send Messages, Read History, etc.) falls through to guild-level role perms.
		const overwrites: OverwriteResolvable[] = [
			{
				id: store.guild.id,
				deny: [PermissionFlagsBits.ViewChannel],
			},
		];
		const botMember = store.guild.members.me;
		if (botMember) {
			overwrites.push({
				id: botMember.id,
				type: OverwriteType.Member,
				allow: [PermissionFlagsBits.ViewChannel],
			});
		}
		if (roomRoleId) {
			overwrites.push({
				id: roomRoleId,
				type: OverwriteType.Role,
				allow: [PermissionFlagsBits.ViewChannel],
			});
		}
		for (const admin of Queries.selectManyAdmins({ guildId: store.guild.id })) {
			overwrites.push({
				id: admin.subjectId,
				type: admin.isRole ? OverwriteType.Role : OverwriteType.Member,
				allow: [PermissionFlagsBits.ViewChannel],
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

	export interface SyncReport {
		eventId: bigint;
		eventName: string;
		created: string[];
		adopted: string[];
		untrackedRows: string[];
		recreatedMissing: string[];
		nonOwnedAtTop: { id: Snowflake, name: string }[];
		errors: string[];
		trackedCount: number;
		reorderApplied: boolean;
	}

	type ChannelFetchResult =
		| { status: "found", channel: GuildBasedChannel }
		| { status: "missing" };

	function emptyReport(event: DbEvent): SyncReport {
		return {
			eventId: event.id,
			eventName: event.name,
			created: [],
			adopted: [],
			untrackedRows: [],
			recreatedMissing: [],
			nonOwnedAtTop: [],
			errors: [],
			trackedCount: 0,
			reorderApplied: false,
		};
	}

	export async function reconcileRoomChannels(store: Store, event: DbEvent): Promise<SyncReport> {
		return EventSyncLock.withLock(store.guild.id, event.id, async () => {
			const report = emptyReport(event);
			if (!event.roomCategoryId) return report;

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

			// To-untrack: existing − desired (we leave the Discord channels alone; if the
			// same key becomes desired again later, ensureRoomChannel will adopt it back).
			for (const [key, row] of existingByKey) {
				if (desiredByKey.has(key)) continue;
				untrackRoomChannel(store, row);
				report.untrackedRows.push(buildChannelName(row.suffix, row.roomIndex));
			}

			// To-create + to-update
			for (const [key, d] of desiredByKey) {
				const existingRow = existingByKey.get(key);
				const roomRoleId = roleByRoomIndex.get(d.roomIndex) ?? null;
				const overwrites = buildOverwrites(store, roomRoleId);
				const channelName = buildChannelName(d.suffix, d.roomIndex);

				if (!existingRow) {
					const { id: channelId, adopted } = await ensureRoomChannel(store, event, d, overwrites, channelName);
					trackRoomChannel(store, event, d, channelId);
					(adopted ? report.adopted : report.created).push(channelName);
				}
				else {
					const fetchResult = await tryFetchChannel(store, existingRow.channelId);
					if (fetchResult.status === "missing") {
						// Tracked channel is gone — drop the row and adopt/create afresh.
						store.deleteEventRoomChannel({ id: existingRow.id });
						const { id: channelId } = await ensureRoomChannel(store, event, d, overwrites, channelName);
						trackRoomChannel(store, event, d, channelId);
						report.recreatedMissing.push(channelName);
					}
					else {
						await applyChannelSettings(fetchResult.channel, overwrites, d.slowmodeSeconds);
						if (d.suffix === null && d.roomEventQueue.pingChannelId !== fetchResult.channel.id) {
							store.updateEventQueue({ id: d.roomEventQueue.id, pingChannelId: fetchResult.channel.id });
						}
					}
				}
			}

			const reorderResult = await reorderRoomChannels(store, event);
			report.nonOwnedAtTop = reorderResult.nonOwnedAtTop;
			report.trackedCount = reorderResult.trackedCount;
			report.reorderApplied = reorderResult.reorderApplied;

			await reconcileRoleAssignments(store, event);

			return report;
		});
	}

	export async function reconcileAllGuildEvents(store: Store): Promise<{ reports: SyncReport[]; skipped: DbEvent[] }> {
		const events = Queries.selectManyEvents({ guildId: store.guild.id });
		const reports: SyncReport[] = [];
		const skipped: DbEvent[] = [];
		for (const event of events) {
			if (!event.roomCategoryId) continue;
			const result = await EventSyncLock.tryWithLock(store.guild.id, event.id, () =>
				reconcileRoomChannels(store, event)
			);
			if (result === "skipped") {
				skipped.push(event);
			}
			else {
				reports.push(result);
			}
		}
		return { reports, skipped };
	}

	interface ReorderResult {
		nonOwnedAtTop: { id: Snowflake, name: string }[];
		trackedCount: number;
		reorderApplied: boolean;
	}

	async function reorderRoomChannels(store: Store, event: DbEvent): Promise<ReorderResult> {
		const empty: ReorderResult = { nonOwnedAtTop: [], trackedCount: 0, reorderApplied: false };
		if (!event.roomCategoryId) return empty;

		const rows = Queries.selectManyEventRoomChannels({ guildId: store.guild.id, eventId: event.id });

		const category = await store.jsChannel(event.roomCategoryId);
		if (!category || category.type !== ChannelType.GuildCategory) return empty;

		// Untracked channels are anything in the category not in the tracked set.
		// Preserve their current relative Discord-position order so user-owned channels
		// are not shuffled.
		const trackedIds = new Set<Snowflake>(rows.map(r => r.channelId));
		const untrackedChannels = [...(category.children?.cache.values() ?? [])]
			.filter(ch => !trackedIds.has(ch.id))
			.sort((a, b) => (a as any).position - (b as any).position);
		const nonOwnedAtTop = untrackedChannels.map(ch => ({ id: ch.id, name: (ch as any).name as string }));

		if (rows.length === 0) {
			return { nonOwnedAtTop, trackedCount: 0, reorderApplied: false };
		}

		const desiredOrder = (a: DbEventRoomChannel, b: DbEventRoomChannel) => {
			const indexDiff = Number(a.roomIndex) - Number(b.roomIndex);
			if (indexDiff !== 0) return indexDiff;
			// null suffix (main channel) sorts LAST within each room — keeps `room-code-N` above `room-N`
			if (a.suffix === null && b.suffix === null) return 0;
			if (a.suffix === null) return 1;
			if (b.suffix === null) return -1;
			return a.suffix.localeCompare(b.suffix);
		};

		// Tracked sequence is driven from the DB, not the cache: newly created or
		// not-yet-cached channels would otherwise be silently dropped, leaving them
		// clumped at their creation-order positions.
		const sortedTracked = [...rows].sort(desiredOrder);

		const desiredIds: Snowflake[] = [
			...nonOwnedAtTop.map(c => c.id),
			...sortedTracked.map(r => r.channelId),
		];

		const currentIds = [...(category.children?.cache.values() ?? [])]
			.sort((a, b) => (a as any).position - (b as any).position)
			.map(ch => ch.id);

		const orderMatches = currentIds.length === desiredIds.length
			&& currentIds.every((id, i) => id === desiredIds[i]);

		if (orderMatches) {
			return { nonOwnedAtTop, trackedCount: sortedTracked.length, reorderApplied: false };
		}

		const payload = desiredIds.map((channel, position) => ({ channel, position }));

		try {
			await store.guild.channels.setPositions(payload);
		}
		catch (e) {
			console.error(`EventChannelUtils.reorderRoomChannels: failed to set positions for event ${event.id}:`, e);
			throw new CustomError({
				message: "Failed to reorder room channels — check that the bot has the Manage Channels permission in the room category.",
			});
		}

		return { nonOwnedAtTop, trackedCount: sortedTracked.length, reorderApplied: true };
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

	async function tryFetchChannel(store: Store, channelId: Snowflake): Promise<ChannelFetchResult> {
		try {
			const channel = await store.guild.channels.fetch(channelId);
			if (!channel) return { status: "missing" };
			return { status: "found", channel };
		}
		catch (e) {
			const { status } = e as DiscordAPIError;
			if (status === 404) return { status: "missing" };
			console.error(`EventChannelUtils.tryFetchChannel: failed to fetch channel ${channelId}:`, e);
			throw e;
		}
	}

	async function findCategoryChild(store: Store, categoryId: Snowflake, name: string): Promise<GuildBasedChannel | undefined> {
		const category = await store.jsChannel(categoryId);
		if (!category || category.type !== ChannelType.GuildCategory) return undefined;
		return category.children?.cache.find(c => c.name === name && c.type === ChannelType.GuildText);
	}

	async function applyChannelSettings(channel: GuildBasedChannel, overwrites: OverwriteResolvable[], slowmodeSeconds: number) {
		try {
			if ("permissionOverwrites" in channel && channel.permissionOverwrites) {
				await channel.permissionOverwrites.set(overwrites);
			}
			if ("setRateLimitPerUser" in channel) {
				await (channel as any).setRateLimitPerUser(slowmodeSeconds);
			}
		}
		catch (e) {
			const err = e as DiscordAPIError;
			if (err?.code === 50001 || err?.status === 403) {
				// Adopted channel the bot can't edit. Track it as-is; the user owns
				// permissions there. Surface a single-line hint instead of a stack.
				console.warn(`EventChannelUtils.applyChannelSettings: missing access on channel ${channel.id} (#${(channel as any).name ?? "?"}). Grant the bot Manage Channels here to auto-apply room-role + admin overwrites and slowmode.`);
				return;
			}
			console.error(`EventChannelUtils.applyChannelSettings: failed on channel ${channel.id}:`, e);
		}
	}

	async function ensureRoomChannel(
		store: Store,
		event: DbEvent,
		d: DesiredChannel,
		overwrites: OverwriteResolvable[],
		channelName: string,
	): Promise<{ id: Snowflake, adopted: boolean }> {
		const existing = await findCategoryChild(store, event.roomCategoryId, channelName);
		if (existing) {
			await applyChannelSettings(existing, overwrites, d.slowmodeSeconds);
			return { id: existing.id, adopted: true };
		}
		try {
			const channel = await store.guild.channels.create({
				name: channelName,
				type: ChannelType.GuildText,
				parent: event.roomCategoryId,
				rateLimitPerUser: d.slowmodeSeconds > 0 ? d.slowmodeSeconds : undefined,
				permissionOverwrites: overwrites,
				reason: `Auto-created for event "${event.name}" room ${d.roomIndex}${d.suffix ? ` (${d.suffix})` : ""}`,
			});
			return { id: channel.id, adopted: false };
		}
		catch (e) {
			console.error(`EventChannelUtils.ensureRoomChannel: failed to create channel "${channelName}" for event ${event.id}:`, e);
			throw new CustomError({
				message: `Failed to create channel \`${channelName}\`. Check that the bot has the Manage Channels permission in the selected category.`,
			});
		}
	}

	function trackRoomChannel(store: Store, event: DbEvent, d: DesiredChannel, channelId: Snowflake) {
		store.insertEventRoomChannel({
			guildId: store.guild.id,
			eventId: event.id,
			roomIndex: d.roomIndex,
			suffix: d.suffix,
			channelId,
		});
		if (d.suffix === null) {
			store.updateEventQueue({ id: d.roomEventQueue.id, pingChannelId: channelId });
		}
	}

	function untrackRoomChannel(store: Store, row: DbEventRoomChannel) {
		store.deleteEventRoomChannel({ id: row.id });
	}

	export function untrackAllEventChannels(store: Store, event: DbEvent) {
		const rows = Queries.selectManyEventRoomChannels({ guildId: store.guild.id, eventId: event.id });
		for (const row of rows) untrackRoomChannel(store, row);
	}

	export function untrackChannelsForSuffix(store: Store, event: DbEvent, suffix: string) {
		const rows = Queries.selectManyEventRoomChannels({ guildId: store.guild.id, eventId: event.id })
			.filter(r => r.suffix === suffix);
		for (const row of rows) untrackRoomChannel(store, row);
	}
}
