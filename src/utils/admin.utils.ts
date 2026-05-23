import { type GuildMember, PermissionsBitField, Role } from "discord.js";
import { compact } from "lodash-es";

import { db } from "../db/db.ts";
import type { Store } from "../db/store.ts";
import type { Mentionable } from "../types/parsing.types.ts";
import { AdminAccessWarning } from "./error.utils.ts";
import { EventChannelUtils } from "./event-channel.utils.ts";

export namespace AdminUtils {
	export async function insertAdmins(store: Store, mentionables: Mentionable[]) {
		const inserted = db.transaction(() => compact(
			mentionables.map(mentionable =>
				store.insertAdmin({
					guildId: store.guild.id,
					subjectId: mentionable.id,
					isRole: mentionable instanceof Role,
				})
			)
		));
		try {
			await EventChannelUtils.reconcileAllGuildEvents(store);
		}
		catch (e) {
			console.error("AdminUtils.insertAdmins: failed to reconcile event room channels after admin insert:", e);
		}
		return inserted;
	}

	export async function deleteAdmins(store: Store, adminIds: bigint[]) {
		const deleted = compact(adminIds.map(adminId => store.deleteAdmin({ id: adminId })));
		try {
			await EventChannelUtils.reconcileAllGuildEvents(store);
		}
		catch (e) {
			console.error("AdminUtils.deleteAdmins: failed to reconcile event room channels after admin delete:", e);
		}
		return deleted;
	}

	export function isAdmin(store: Store, member: GuildMember) {
		const isDiscordAdmin = () => member.permissions.has(PermissionsBitField.Flags.Administrator);
		const isBotAdmin = () => store.dbAdmins().some(admin =>
			admin.isRole ? member.roles.cache.has(admin.subjectId) : admin.subjectId === member.id
		);
		return isDiscordAdmin() || isBotAdmin();
	}

	export function verifyIsAdmin(store: Store, member: GuildMember) {
		if (!isAdmin(store, member)) {
			throw new AdminAccessWarning();
		}
	}
}