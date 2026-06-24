import { codeBlock, EmbedBuilder, type Interaction, InteractionType } from "discord.js";
import { compact, concat } from "lodash-es";

import { Store } from "../db/store.ts";
import { Color } from "../types/db.types.ts";
import type { Handler } from "../types/handler.types.ts";
import type { AnyInteraction } from "../types/interaction.types.ts";
import { AbstractInteractionIssue, AbstractWarning } from "../utils/error.utils.ts";
import { ERROR_HEADER_LINE, WARNING_HEADER_LINE } from "../utils/string.utils.ts";
import { AutocompleteHandler } from "./autocomplete.handler.ts";
import { ButtonHandler } from "./button.handler.ts";
import { CommandHandler } from "./command.handler.ts";
import { ModalHandler } from "./modal.handler.ts";

// SILENT=true (env) or `--silent` (argv) suppresses true-error logs.
// Warnings are silent by default; opt-in via `log: true` on the class.
const IS_SILENT = process.env.SILENT === "true" || process.argv.includes("--silent");
const DEBUG_INTERACTIONS = process.env.DEBUG_INTERACTIONS === "true";

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
			if (DEBUG_INTERACTIONS) {
				console.log(`InteractionHandler: received ${kind} (${name}) guildId=${this.inter.guildId}`);
			}

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
		const { stack, embeds, log } = error as AbstractInteractionIssue;
		const message = typeof error === "string" ? error : error.message;
		const isWarning = error instanceof AbstractWarning;

		// Warnings: only log when explicitly opted in via `log: true`.
		// Errors: log === true → always log; log === false → never log; log === undefined → log unless IS_SILENT.
		const doLog = isWarning
			? log === true
			: log === true || (log !== false && !IS_SILENT);

		if (message === "Unknown interaction") return;

		try {
			if (doLog) {
				console.error(`${isWarning ? "Warning" : "Error"} (guildId=${this.inter.guildId}): ${message}`);
				console.error(`Stack Trace: ${stack}`);
			}

			if (this.inter.type !== InteractionType.ApplicationCommandAutocomplete) {
				const embed = new EmbedBuilder()
					.setTitle(isWarning ? WARNING_HEADER_LINE : ERROR_HEADER_LINE)
					.setColor(isWarning ? Color.Gold : Color.DarkRed)
					.setDescription(message ? `${codeBlock(message)}` : "an unknown error occurred");
				if (!isWarning && doLog) {
					embed.setFooter({ text: "This error has been logged and will be investigated by the developers." });
				}

				await this.inter.respond({
					embeds: compact(concat(embeds, embed)),
					ephemeral: true,
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
