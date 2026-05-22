import { Collection } from "discord.js";

import { type BaseOption, UserOption } from "./base-option.ts";
import { AdminOption } from "./options/admin.option.ts";
import { AdminsOption } from "./options/admins.option.ts";
import { AnnouncementChannelOption } from "./options/announcement-channel.option.ts";
import { AnnouncementMessageOption } from "./options/announcement-message.option.ts";
import { AutopullToggleOption } from "./options/autopull-toggle.option.ts";
import { BadgeToggleOption } from "./options/badge-toggle.option.ts";
import { BlacklistedOption } from "./options/blacklisted.option.ts";
import { BlacklistedsOption } from "./options/blacklisteds.option.ts";
import { ChannelSuffixOption } from "./options/channel-suffix.option.ts";
import { CleanupOffsetHoursOption } from "./options/cleanup-offset-hours.option.ts";
import { ColorOption } from "./options/color.option.ts";
import { CommandOption } from "./options/command.option.ts";
import { CreateOffsetHoursOption } from "./options/create-offset-hours.option.ts";
import { CronOption } from "./options/cron.option.ts";
import { CustomCronOption } from "./options/custom-cron.option.ts";
import { DisplayOption } from "./options/display.option.ts";
import { ButtonsToggleOption } from "./options/display-buttons.option.ts";
import { DisplayUpdateTypeOption } from "./options/display-update-type.option.ts";
import { DisplaysOption } from "./options/displays.option.ts";
import { DmMemberOption } from "./options/dm-member.option.ts";
import { DmOnPullToggleOption } from "./options/dm-on-pull-toggle.option.ts";
import { EventOption } from "./options/event.option.ts";
import { EventsOption } from "./options/events.option.ts";
import { HeaderOption } from "./options/header.option.ts";
import { InlineToggleOption } from "./options/inline-toggle.option.ts";
import { JoinSyncToggleOption } from "./options/join-sync-toggle.option.ts";
import { LeaveSyncToggleOption } from "./options/leave-sync-toggle.option.ts";
import { LockOffsetMinutesOption } from "./options/lock-offset-minutes.option.ts";
import { LockToggleOption } from "./options/lock-toggle.option.ts";
import { LogChannelOption } from "./options/log-channel.option.ts";
import { LogScopeOption } from "./options/log-scope.option.ts";
import { MaxRoomsPerUserOption } from "./options/max-rooms-per-user.option.ts";
import { MaxSubsPerUserOption } from "./options/max-subs-per-user.option.ts";
import { MemberOption } from "./options/member.option.ts";
import { MemberDisplayTypeOption } from "./options/member-display-type.option.ts";
import { MembersOption } from "./options/members.option.ts";
import { MentionableOption } from "./options/mentionable.option.ts";
import { MessageOption } from "./options/message.option.ts";
import { MessageChannelOption } from "./options/message-channel.option.ts";
import { ModeratorRoleOption } from "./options/moderator-role.option.ts";
import { NameOption } from "./options/name.option.ts";
import { NumberOption } from "./options/number.option.ts";
import { ParentSubMutuallyExclusiveOption } from "./options/parent-sub-mutually-exclusive.option.ts";
import { PingChannelOption } from "./options/ping-channel.option.ts";
import { PositionOption } from "./options/position.option.ts";
import { PrioritizedOption } from "./options/prioritized.option.ts";
import { PrioritizedsOption } from "./options/prioritizeds.option.ts";
import { PriorityOrderOption } from "./options/priority-order.option.ts";
import { PullBatchSizeOption } from "./options/pull-batch-size.option.ts";
import { PullMessageOption } from "./options/pull-message.option.ts";
import { PullMessageChannelOption } from "./options/pull-message-channel.option.ts";
import { PullMessageDisplayTypeOption } from "./options/pull-message-display-type.option.ts";
import { QueueOption } from "./options/queue.option.ts";
import { QueuesOption } from "./options/queues.option.ts";
import { ReasonOption } from "./options/reason.option.ts";
import { RejoinCooldownPeriodOption } from "./options/rejoin-cooldown-period.option.ts";
import { RejoinGracePeriodOption } from "./options/rejoin-grace-period.option.ts";
import { RoleInQueueOption } from "./options/role-in-queue.option.ts";
import { RoleOnPullOption } from "./options/role-on-pull.option.ts";
import { RoomCategoryOption } from "./options/room-category.option.ts";
import { RoomChannelOption } from "./options/room-channel.option.ts";
import { RoomCountOption } from "./options/room-count.option.ts";
import { RoomIndexOption } from "./options/room-index.option.ts";
import { RoomLengthMinutesOption } from "./options/room-length-minutes.option.ts";
import { RoomPingMessageOption } from "./options/room-ping-message.option.ts";
import { RoomRoleOption } from "./options/room-role.option.ts";
import { RoomRoleInQueueOption } from "./options/room-role-in-queue.option.ts";
import { RoomRoleOnPullOption } from "./options/room-role-on-pull.option.ts";
import { RoomSchedulingOption } from "./options/room-scheduling.option.ts";
import { ScheduleOption } from "./options/schedule.option.ts";
import { SchedulesOption } from "./options/schedules.option.ts";
import { SizeOption } from "./options/size.option.ts";
import { SlowmodeOption } from "./options/slowmode.option.ts";
import { SlowmodeTimeOption } from "./options/slowmode-time.option.ts";
import { SubChannelOption } from "./options/sub-channel.option.ts";
import { SubRoleInQueueOption } from "./options/sub-role-in-queue.option.ts";
import { SubRoleOnPullOption } from "./options/sub-role-on-pull.option.ts";
import { TimestampTypeOption } from "./options/timestamp-type.option.ts";
import { TimezoneOption } from "./options/timezone.option.ts";
import { VoiceOption } from "./options/voice.option.ts";
import { VoiceDestinationChannelOption } from "./options/voice-destination-channel.option.ts";
import { VoiceOnlyToggleOption } from "./options/voice-only-toggle.option.ts";
import { VoiceSourceChannelOption } from "./options/voice-source-channel.option.ts";
import { VoicesOption } from "./options/voices.option.ts";
import { WhitelistedOption } from "./options/whitelisted.option.ts";
import { WhitelistedsOption } from "./options/whitelisteds.option.ts";

export const OPTIONS = new Collection<string, BaseOption>([
	[AdminOption.ID, new AdminOption()],
	[AdminsOption.ID, new AdminsOption()],
	[AnnouncementChannelOption.ID, new AnnouncementChannelOption()],
	[AnnouncementMessageOption.ID, new AnnouncementMessageOption()],
	[AutopullToggleOption.ID, new AutopullToggleOption()],
	[BadgeToggleOption.ID, new BadgeToggleOption()],
	[BlacklistedOption.ID, new BlacklistedOption()],
	[BlacklistedsOption.ID, new BlacklistedsOption()],
	[ButtonsToggleOption.ID, new ButtonsToggleOption()],
	[ChannelSuffixOption.ID, new ChannelSuffixOption()],
	[CleanupOffsetHoursOption.ID, new CleanupOffsetHoursOption()],
	[ColorOption.ID, new ColorOption()],
	[CommandOption.ID, new CommandOption()],
	[CreateOffsetHoursOption.ID, new CreateOffsetHoursOption()],
	[CronOption.ID, new CronOption()],
	[CustomCronOption.ID, new CustomCronOption()],
	[DisplayOption.ID, new DisplayOption()],
	[DisplaysOption.ID, new DisplaysOption()],
	[DisplayUpdateTypeOption.ID, new DisplayUpdateTypeOption()],
	[DmOnPullToggleOption.ID, new DmOnPullToggleOption()],
	[DmMemberOption.ID, new DmMemberOption()],
	[EventOption.ID, new EventOption()],
	[EventsOption.ID, new EventsOption()],
	[HeaderOption.ID, new HeaderOption()],
	[InlineToggleOption.ID, new InlineToggleOption()],
	[JoinSyncToggleOption.ID, new JoinSyncToggleOption()],
	[LeaveSyncToggleOption.ID, new LeaveSyncToggleOption()],
	[LockOffsetMinutesOption.ID, new LockOffsetMinutesOption()],
	[LockToggleOption.ID, new LockToggleOption()],
	[LogChannelOption.ID, new LogChannelOption()],
	[LogScopeOption.ID, new LogScopeOption()],
	[MaxRoomsPerUserOption.ID, new MaxRoomsPerUserOption()],
	[MaxSubsPerUserOption.ID, new MaxSubsPerUserOption()],
	[MemberOption.ID, new MemberOption()],
	[MemberDisplayTypeOption.ID, new MemberDisplayTypeOption()],
	[MembersOption.ID, new MembersOption()],
	[MentionableOption.ID, new MentionableOption()],
	[MessageChannelOption.ID, new MessageChannelOption()],
	[MessageOption.ID, new MessageOption()],
	[ModeratorRoleOption.ID, new ModeratorRoleOption()],
	[NameOption.ID, new NameOption()],
	[NumberOption.ID, new NumberOption()],
	[ParentSubMutuallyExclusiveOption.ID, new ParentSubMutuallyExclusiveOption()],
	[PingChannelOption.ID, new PingChannelOption()],
	[PositionOption.ID, new PositionOption()],
	[PrioritizedOption.ID, new PrioritizedOption()],
	[PrioritizedsOption.ID, new PrioritizedsOption()],
	[PriorityOrderOption.ID, new PriorityOrderOption()],
	[PullBatchSizeOption.ID, new PullBatchSizeOption()],
	[PullMessageOption.ID, new PullMessageOption()],
	[PullMessageChannelOption.ID, new PullMessageChannelOption()],
	[PullMessageDisplayTypeOption.ID, new PullMessageDisplayTypeOption()],
	[QueueOption.ID, new QueueOption()],
	[QueuesOption.ID, new QueuesOption()],
	[ReasonOption.ID, new ReasonOption()],
	[RejoinCooldownPeriodOption.ID, new RejoinCooldownPeriodOption()],
	[RoomCategoryOption.ID, new RoomCategoryOption()],
	[RoomChannelOption.ID, new RoomChannelOption()],
	[RoomCountOption.ID, new RoomCountOption()],
	[RoomIndexOption.ID, new RoomIndexOption()],
	[RoomLengthMinutesOption.ID, new RoomLengthMinutesOption()],
	[RoomPingMessageOption.ID, new RoomPingMessageOption()],
	[RoomRoleOption.ID, new RoomRoleOption()],
	[RoomRoleInQueueOption.ID, new RoomRoleInQueueOption()],
	[RoomRoleOnPullOption.ID, new RoomRoleOnPullOption()],
	[RoomSchedulingOption.ID, new RoomSchedulingOption()],
	[RejoinGracePeriodOption.ID, new RejoinGracePeriodOption()],
	[RoleInQueueOption.ID, new RoleInQueueOption()],
	[RoleOnPullOption.ID, new RoleOnPullOption()],
	[ScheduleOption.ID, new ScheduleOption()],
	[SchedulesOption.ID, new SchedulesOption()],
	[SizeOption.ID, new SizeOption()],
	[SlowmodeOption.ID, new SlowmodeOption()],
	[SlowmodeTimeOption.ID, new SlowmodeTimeOption()],
	[SubChannelOption.ID, new SubChannelOption()],
	[SubRoleInQueueOption.ID, new SubRoleInQueueOption()],
	[SubRoleOnPullOption.ID, new SubRoleOnPullOption()],
	[TimestampTypeOption.ID, new TimestampTypeOption()],
	[TimezoneOption.ID, new TimezoneOption()],
	[UserOption.ID, new UserOption()],
	[VoiceOption.ID, new VoiceOption()],
	[VoicesOption.ID, new VoicesOption()],
	[VoiceDestinationChannelOption.ID, new VoiceDestinationChannelOption()],
	[VoiceSourceChannelOption.ID, new VoiceSourceChannelOption()],
	[VoiceOnlyToggleOption.ID, new VoiceOnlyToggleOption()],
	[WhitelistedOption.ID, new WhitelistedOption()],
	[WhitelistedsOption.ID, new WhitelistedsOption()],
]);
