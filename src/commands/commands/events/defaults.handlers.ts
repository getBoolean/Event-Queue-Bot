import { inlineCode } from "discord.js";
import { SQLiteColumn } from "drizzle-orm/sqlite-core";
import { findKey, isNil, omitBy } from "lodash-es";

import { type DbEvent, EVENT_TABLE, QUEUE_TABLE } from "../../../db/schema.ts";
import { AnnouncementChannelOption } from "../../../options/options/announcement-channel.option.ts";
import { AnnouncementMessageOption } from "../../../options/options/announcement-message.option.ts";
import { AutoPullSubsAtRoomStartToggleOption } from "../../../options/options/auto-pull-subs-at-room-start-toggle.option.ts";
import { AutopullToggleOption } from "../../../options/options/autopull-toggle.option.ts";
import { BadgeToggleOption } from "../../../options/options/badge-toggle.option.ts";
import { CleanupOffsetHoursOption } from "../../../options/options/cleanup-offset-hours.option.ts";
import { ColorOption } from "../../../options/options/color.option.ts";
import { CreateDiscordEventToggleOption } from "../../../options/options/create-discord-event-toggle.option.ts";
import { CreateOffsetHoursOption } from "../../../options/options/create-offset-hours.option.ts";
import { DiscordEventDescriptionOption } from "../../../options/options/discord-event-description.option.ts";
import { ButtonsToggleOption } from "../../../options/options/display-buttons.option.ts";
import { DisplayUpdateTypeOption } from "../../../options/options/display-update-type.option.ts";
import { DmOnPullToggleOption } from "../../../options/options/dm-on-pull-toggle.option.ts";
import { HeaderOption } from "../../../options/options/header.option.ts";
import { InlineToggleOption } from "../../../options/options/inline-toggle.option.ts";
import { LockOffsetMinutesOption } from "../../../options/options/lock-offset-minutes.option.ts";
import { LockToggleOption } from "../../../options/options/lock-toggle.option.ts";
import { MemberDisplayTypeOption } from "../../../options/options/member-display-type.option.ts";
import { PullBatchSizeOption } from "../../../options/options/pull-batch-size.option.ts";
import { PullMessageOption } from "../../../options/options/pull-message.option.ts";
import { PullMessageChannelOption } from "../../../options/options/pull-message-channel.option.ts";
import { PullMessageDisplayTypeOption } from "../../../options/options/pull-message-display-type.option.ts";
import { RejoinCooldownPeriodOption } from "../../../options/options/rejoin-cooldown-period.option.ts";
import { RejoinGracePeriodOption } from "../../../options/options/rejoin-grace-period.option.ts";
import { RequireMessageToJoinOption } from "../../../options/options/require-message-to-join.option.ts";
import { RoleInQueueOption } from "../../../options/options/role-in-queue.option.ts";
import { RoleInRoomQueueOption } from "../../../options/options/role-in-room-queue.option.ts";
import { RoleInSubQueueOption } from "../../../options/options/role-in-sub-queue.option.ts";
import { RoleOnPullOption } from "../../../options/options/role-on-pull.option.ts";
import { RoleOnRoomPullOption } from "../../../options/options/role-on-room-pull.option.ts";
import { RoleOnSubPullOption } from "../../../options/options/role-on-sub-pull.option.ts";
import { RoomLengthMinutesOption } from "../../../options/options/room-length-minutes.option.ts";
import { RoomPingMessageOption } from "../../../options/options/room-ping-message.option.ts";
import { RoomSchedulingOption } from "../../../options/options/room-scheduling.option.ts";
import { ShuffleSubsBeforeAutoPullToggleOption } from "../../../options/options/shuffle-subs-before-auto-pull-toggle.option.ts";
import { SizeOption } from "../../../options/options/size.option.ts";
import { SubAutoPullModeOption } from "../../../options/options/sub-auto-pull-mode.option.ts";
import { TimestampTypeOption } from "../../../options/options/timestamp-type.option.ts";
import { VoiceDestinationChannelOption } from "../../../options/options/voice-destination-channel.option.ts";
import { VoiceOnlyToggleOption } from "../../../options/options/voice-only-toggle.option.ts";
import { WinnerRoleOption } from "../../../options/options/winner-role.option.ts";
import { EventQueueRole } from "../../../types/db.types.ts";
import type { SlashInteraction } from "../../../types/interaction.types.ts";
import { EventUtils } from "../../../utils/event.utils.ts";
import { SelectMenuTransactor } from "../../../utils/message-utils/select-menu-transactor.ts";
import { toCollection } from "../../../utils/misc.utils.ts";
import { eventMention } from "../../../utils/string.utils.ts";
import { EventsCrudHandlers } from "./crud.handlers.ts";
import { EventsOptions } from "./options.ts";

export namespace EventsDefaultsHandlers {
	export async function setRoomDefaults(inter: SlashInteraction) {
		await setDefaults(inter, EventQueueRole.Room, EventsOptions.SET_ROOM_DEFAULTS_OPTIONS);
	}

	export async function setSubDefaults(inter: SlashInteraction) {
		await setDefaults(inter, EventQueueRole.Sub, EventsOptions.SET_SUB_DEFAULTS_OPTIONS);
	}

	async function setDefaults(inter: SlashInteraction, role: EventQueueRole, options: typeof EventsOptions.SET_QUEUE_DEFAULTS_OPTIONS) {
		await inter.deferReply();
		const event = await options.event.get(inter);

		const update = omitBy({
			autopullToggle: options.autopullToggle.get(inter),
			badgeToggle: options.badgeToggle.get(inter),
			buttonsToggle: options.buttonsToggle.get(inter),
			color: options.color.get(inter),
			displayUpdateType: options.displayUpdateType.get(inter),
			dmOnPullToggle: options.dmOnPullToggle.get(inter),
			header: options.header.get(inter),
			inlineToggle: options.inlineToggle.get(inter),
			lockToggle: options.lockToggle.get(inter),
			memberDisplayType: options.memberDisplayType.get(inter),
			pullBatchSize: options.pullBatchSize.get(inter),
			pullMessage: options.pullMessage.get(inter),
			pullMessageDisplayType: options.pullMessageDisplayType.get(inter),
			pullMessageChannelId: options.pullMessageChannel.get(inter)?.id,
			rejoinCooldownPeriod: options.rejoinCooldownPeriod.get(inter),
			rejoinGracePeriod: options.rejoinGracePeriod.get(inter),
			requireMessageToJoin: options.requireMessageToJoin.get(inter),
			roleInQueueId: options.roleInQueue.get(inter)?.id,
			roleOnPullId: options.roleOnPull.get(inter)?.id,
			size: options.size.get(inter),
			timestampType: options.timestampType.get(inter),
			voiceOnlyToggle: options.voiceOnlyToggle.get(inter),
			voiceDestinationChannelId: options.voiceDestinationChannel.get(inter)?.id,
		}, isNil);

		await EventUtils.setRoleDefaults(inter.store, event, role, update);

		await inter.respond(`Updated ${role} queue defaults for ${eventMention(event)}.`, true);
	}

	export async function reset(inter: SlashInteraction) {
		await inter.deferReply();
		const event = await EventsOptions.RESET_OPTIONS.event.get(inter);

		const ANNOUNCEMENT_PAIR_VALUE = "__announcement_pair__";
		const selectMenuOptions = [
			{ name: CreateOffsetHoursOption.ID, value: EVENT_TABLE.createOffsetMs.name },
			{ name: LockOffsetMinutesOption.ID, value: EVENT_TABLE.lockOffsetMs.name },
			{ name: CleanupOffsetHoursOption.ID, value: EVENT_TABLE.cleanupOffsetMs.name },
			{ name: RoomSchedulingOption.ID, value: EVENT_TABLE.roomScheduling.name },
			{ name: RoomLengthMinutesOption.ID, value: EVENT_TABLE.roomLengthMs.name },
			{ name: `${AnnouncementChannelOption.ID} + ${AnnouncementMessageOption.ID}`, value: ANNOUNCEMENT_PAIR_VALUE },
			{ name: RoomPingMessageOption.ID, value: EVENT_TABLE.roomPingMessage.name },
			{ name: RoleInRoomQueueOption.ID, value: EVENT_TABLE.roleInRoomQueue.name },
			{ name: RoleOnRoomPullOption.ID, value: EVENT_TABLE.roleOnRoomPull.name },
			{ name: RoleInSubQueueOption.ID, value: EVENT_TABLE.roleInSubQueue.name },
			{ name: RoleOnSubPullOption.ID, value: EVENT_TABLE.roleOnSubPull.name },
			{ name: AutoPullSubsAtRoomStartToggleOption.ID, value: EVENT_TABLE.autoPullSubsAtRoomStartToggle.name },
			{ name: ShuffleSubsBeforeAutoPullToggleOption.ID, value: EVENT_TABLE.shuffleSubsBeforeAutoPullToggle.name },
			{ name: SubAutoPullModeOption.ID, value: EVENT_TABLE.subAutoPullMode.name },
			{ name: CreateDiscordEventToggleOption.ID, value: EVENT_TABLE.createDiscordEvent.name },
			{ name: DiscordEventDescriptionOption.ID, value: EVENT_TABLE.discordEventDescription.name },
			{ name: `${WinnerRoleOption.ID} (does not revoke already-granted roles)`, value: EVENT_TABLE.winnerRoleId.name },
		];
		const selectMenuTransactor = new SelectMenuTransactor(inter);
		const propertiesToReset = await selectMenuTransactor.sendAndReceive("Event properties to reset", selectMenuOptions) ?? [];
		if (propertiesToReset.length === 0) return;

		const update: Partial<DbEvent> = {};
		const resetLabels: string[] = [];
		for (const property of propertiesToReset) {
			if (property === ANNOUNCEMENT_PAIR_VALUE) {
				update.announcementChannelId = null;
				update.announcementMessage = null;
				resetLabels.push(AnnouncementChannelOption.ID, AnnouncementMessageOption.ID);
				continue;
			}
			const columnKey = findKey(EVENT_TABLE, (column: SQLiteColumn) => column.name === property);
			if (!columnKey) continue;
			(update as any)[columnKey] = (EVENT_TABLE as any)[columnKey]?.default ?? null;
			resetLabels.push(property);
		}

		await EventUtils.updateEvent(inter.store, event, update);

		const propertiesStr = resetLabels.map(inlineCode).join(", ");
		const haveWord = resetLabels.length === 1 ? "has" : "have";
		await selectMenuTransactor.updateWithResult(
			"Reset event properties",
			`${propertiesStr} ${haveWord} been reset for ${eventMention(event)}.`,
		);

		await EventsCrudHandlers.get(inter, toCollection<bigint, DbEvent>("id", [event]));
	}

	export async function resetRoomDefaults(inter: SlashInteraction) {
		await resetDefaults(inter, EventQueueRole.Room, EventsOptions.RESET_ROOM_DEFAULTS_OPTIONS);
	}

	export async function resetSubDefaults(inter: SlashInteraction) {
		await resetDefaults(inter, EventQueueRole.Sub, EventsOptions.RESET_SUB_DEFAULTS_OPTIONS);
	}

	async function resetDefaults(
		inter: SlashInteraction,
		role: EventQueueRole,
		options: typeof EventsOptions.RESET_ROOM_DEFAULTS_OPTIONS,
	) {
		await inter.deferReply();
		const event = await options.event.get(inter);

		const selectMenuOptions = [
			{ name: AutopullToggleOption.ID, value: QUEUE_TABLE.autopullToggle.name },
			{ name: BadgeToggleOption.ID, value: QUEUE_TABLE.badgeToggle.name },
			{ name: ButtonsToggleOption.ID, value: QUEUE_TABLE.buttonsToggle.name },
			{ name: ColorOption.ID, value: QUEUE_TABLE.color.name },
			{ name: DisplayUpdateTypeOption.ID, value: QUEUE_TABLE.displayUpdateType.name },
			{ name: DmOnPullToggleOption.ID, value: QUEUE_TABLE.dmOnPullToggle.name },
			{ name: HeaderOption.ID, value: QUEUE_TABLE.header.name },
			{ name: InlineToggleOption.ID, value: QUEUE_TABLE.inlineToggle.name },
			{ name: LockToggleOption.ID, value: QUEUE_TABLE.lockToggle.name },
			{ name: MemberDisplayTypeOption.ID, value: QUEUE_TABLE.memberDisplayType.name },
			{ name: PullBatchSizeOption.ID, value: QUEUE_TABLE.pullBatchSize.name },
			{ name: PullMessageOption.ID, value: QUEUE_TABLE.pullMessage.name },
			{ name: PullMessageDisplayTypeOption.ID, value: QUEUE_TABLE.pullMessageDisplayType.name },
			{ name: PullMessageChannelOption.ID, value: QUEUE_TABLE.pullMessageChannelId.name },
			{ name: RejoinCooldownPeriodOption.ID, value: QUEUE_TABLE.rejoinCooldownPeriod.name },
			{ name: RejoinGracePeriodOption.ID, value: QUEUE_TABLE.rejoinGracePeriod.name },
			{ name: RequireMessageToJoinOption.ID, value: QUEUE_TABLE.requireMessageToJoin.name },
			{ name: RoleInQueueOption.ID, value: QUEUE_TABLE.roleInQueueId.name },
			{ name: RoleOnPullOption.ID, value: QUEUE_TABLE.roleOnPullId.name },
			{ name: SizeOption.ID, value: QUEUE_TABLE.size.name },
			{ name: TimestampTypeOption.ID, value: QUEUE_TABLE.timestampType.name },
			{ name: VoiceOnlyToggleOption.ID, value: QUEUE_TABLE.voiceOnlyToggle.name },
			{ name: VoiceDestinationChannelOption.ID, value: QUEUE_TABLE.voiceDestinationChannelId.name },
		];
		const selectMenuTransactor = new SelectMenuTransactor(inter);
		const propertiesToReset = await selectMenuTransactor.sendAndReceive(
			`${role} queue defaults to reset`,
			selectMenuOptions,
		) ?? [];
		if (propertiesToReset.length === 0) return;

		await EventUtils.resetRoleDefaults(inter.store, event, role, propertiesToReset);

		const propertiesStr = propertiesToReset.map(inlineCode).join(", ");
		const haveWord = propertiesToReset.length === 1 ? "has" : "have";
		await selectMenuTransactor.updateWithResult(
			`Reset ${role} queue defaults`,
			`${propertiesStr} ${haveWord} been reset for ${role} queues of ${eventMention(event)}.`,
		);

		await EventsCrudHandlers.get(inter, toCollection<bigint, DbEvent>("id", [event]));
	}
}
