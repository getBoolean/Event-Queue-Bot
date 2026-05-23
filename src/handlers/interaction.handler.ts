import { codeBlock, EmbedBuilder, type Interaction, InteractionType } from "discord.js";
import { compact, concat } from "lodash-es";

import { Store } from "../db/store.ts";
import { Color } from "../types/db.types.ts";
import type { Handler } from "../types/handler.types.ts";
import type { AnyInteraction } from "../types/interaction.types.ts";
import { CustomError } from "../utils/error.utils.ts";
import { ERROR_HEADER_LINE } from "../utils/string.utils.ts";
import { AutocompleteHandler } from "./autocomplete.handler.ts";
import { ButtonHandler } from "./button.handler.ts";
import { CommandHandler } from "./command.handler.ts";
import { ModalHandler } from "./modal.handler.ts";

// SILENT=true (env) or `--silent` (argv) suppresses user-facing CustomError logs.
// Errors that explicitly set `log: true` still log; Step 1's contextual catch logs are unaffected.
const IS_SILENT = process.env.SILENT === "true" || process.argv.includes("--silent");

export class InteractionHandler implements Handler {
	private readonly inter: AnyInteraction;

	constructor(inter: Interaction) {
		this.inter = inter as any as AnyInteraction;
		this.inter.store = new Store(this.inter.guild, this.inter);
	}

	async handle() {
		try {
			const kind = this.inter.isChatInputCommand() ? "command"
				: this.inter.isAutocomplete() ? "autocomplete"
					: this.inter.isButton() ? "button"
						: this.inter.isModalSubmit() ? "modal"
							: "other";
			const name = (this.inter as any).commandName ?? (this.inter as any).customId ?? "?";
			console.log(`InteractionHandler: received ${kind} (${name}) guildId=${this.inter.guildId}`);

			if (this.inter.isChatInputCommand()) {
				await new CommandHandler(this.inter).handle();
			}
			else if (this.inter.isAutocomplete()) {
				await new AutocompleteHandler(this.inter).handle();
			}
			else if (this.inter.isButton()) {
				await new ButtonHandler(this.inter).handle();
			}
			else if (this.inter.isModalSubmit()) {
				await new ModalHandler(this.inter).handle();
			}
		}
		catch (e) {
			await this.handleInteractionError(e as any);
		}
	}

	private async handleInteractionError(error: Error | string) {
		const { stack, embeds, log } = error as CustomError;
		const message = typeof error === "string" ? error : error.message;

		// log === true → always log; log === false → never log;
		// log === undefined → log unless IS_SILENT.
		const doLog = log === true || (log !== false && !IS_SILENT);

		if (message === "Unknown interaction") return;

		try {
			if (doLog) {
				console.error(`Error (guildId=${this.inter.guildId}): ${message}`);
				console.error(`Stack Trace: ${stack}`);
			}

			if (this.inter.type !== InteractionType.ApplicationCommandAutocomplete) {
				const embed = new EmbedBuilder()
					.setTitle(ERROR_HEADER_LINE)
					.setColor(Color.DarkRed)
					.setDescription(message ? `${codeBlock(message)}` : "an unknown error occurred");
				if (doLog) {
					embed.setFooter({ text: "This error has been logged and will be investigated by the developers." });
				}

				await this.inter.respond({
					embeds: compact(concat(embeds, embed)),
				});
			}
		}
		catch (handlingError) {
			console.log();
			console.log("An Error occurred during handling of another error:");
			console.error(handlingError);
		}
	}
}