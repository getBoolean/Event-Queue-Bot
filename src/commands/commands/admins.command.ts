import { SlashCommandBuilder } from "discord.js";
import { compact } from "lodash-es";

import { Queries } from "../../db/queries.ts";
import { ADMIN_TABLE } from "../../db/schema.ts";
import { AdminsOption } from "../../options/options/admins.option.ts";
import { MentionableOption } from "../../options/options/mentionable.option.ts";
import { AdminCommand } from "../../types/command.types.ts";
import { Color } from "../../types/db.types.ts";
import type { SlashInteraction } from "../../types/interaction.types.ts";
import { AdminUtils } from "../../utils/admin.utils.ts";
import { describeTable, mentionablesMention } from "../../utils/string.utils.ts";

export class AdminsCommand extends AdminCommand {
	static readonly ID = "admins";

	admins_get = AdminsCommand.admins_get;
	admins_add = AdminsCommand.admins_add;
	admins_delete = AdminsCommand.admins_delete;

	ephemeralSubcommands = new Set(["admins_get"]);

	data = new SlashCommandBuilder()
		.setName(AdminsCommand.ID)
		.setDescription("Manage bot admins")
		.addSubcommand(subcommand => {
			subcommand
				.setName("get")
				.setDescription("List bot admins");
			return subcommand;
		})
		.addSubcommand(subcommand => {
			subcommand
				.setName("add")
				.setDescription("Grant admin to users/roles");
			Object.values(AdminsCommand.ADD_OPTIONS).forEach(option => option.addToCommand(subcommand));
			return subcommand;
		})
		.addSubcommand(subcommand => {
			subcommand
				.setName("delete")
				.setDescription("Revoke admin from users/roles");
			Object.values(AdminsCommand.DELETE_OPTIONS).forEach(option => option.addToCommand(subcommand));
			return subcommand;
		});

	// ====================================================================
	//                           /admins get
	// ====================================================================

	static async admins_get(inter: SlashInteraction) {
		const admins = Queries.selectManyAdmins({ guildId: inter.guildId });

		const descriptionMessage = describeTable({
			store: inter.store,
			table: ADMIN_TABLE,
			tableLabel: "Admins",
			entryLabelProperty: "subjectId",
			entries: admins,
			color: Color.DarkRed,
		});

		await inter.respond(descriptionMessage);
	}

	// ====================================================================
	//                           /admins add
	// ====================================================================

	static readonly ADD_OPTIONS = {
		mentionable1: new MentionableOption({ required: true, id: "mentionable_1", description: "User/role to grant admin" }),
		mentionable2: new MentionableOption({ id: "mentionable_2", description: "User/role to grant admin" }),
		mentionable3: new MentionableOption({ id: "mentionable_3", description: "User/role to grant admin" }),
		mentionable4: new MentionableOption({ id: "mentionable_4", description: "User/role to grant admin" }),
		mentionable5: new MentionableOption({ id: "mentionable_5", description: "User/role to grant admin" }),
	};

	static async admins_add(inter: SlashInteraction) {
		const mentionables = compact([
			AdminsCommand.ADD_OPTIONS.mentionable1.get(inter),
			AdminsCommand.ADD_OPTIONS.mentionable2.get(inter),
			AdminsCommand.ADD_OPTIONS.mentionable3.get(inter),
			AdminsCommand.ADD_OPTIONS.mentionable4.get(inter),
			AdminsCommand.ADD_OPTIONS.mentionable5.get(inter),
		]);

		const insertedAdmins = await AdminUtils.insertAdmins(inter.store, mentionables);

		await inter.respond(`Granted Queue Bot admin access to ${mentionablesMention(insertedAdmins)}.`, true);

		await this.admins_get(inter);
	}

	// ====================================================================
	//                           /admins delete
	// ====================================================================

	static readonly DELETE_OPTIONS = {
		admins: new AdminsOption({ required: true, description: "User/role to revoke admin" }),
	};

	static async admins_delete(inter: SlashInteraction) {
		const admins = await AdminsCommand.DELETE_OPTIONS.admins.get(inter);

		const deletedAdmins = await AdminUtils.deleteAdmins(inter.store, admins.map(admin => admin.id));

		await inter.respond(`Revoked Queue Bot admin access from ${mentionablesMention(deletedAdmins)}.`, true);

		await this.admins_get(inter);
	}
}
