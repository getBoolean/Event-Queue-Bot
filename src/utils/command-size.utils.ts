// Discord caps the *combined* character count of a single global application
// command — every name + description + choice name/value across the whole
// subcommand/option tree — at 8000. Exceeding it makes the bulk `PUT
// /commands` call fail with a cryptic `50035 APPLICATION_COMMAND_TOO_LARGE`,
// so we measure up-front (at startup and in CI) instead of finding out on deploy.
export const DISCORD_COMMAND_SIZE_LIMIT = 8000;

interface CommandSizeNode {
	name?: string;
	description?: string;
	choices?: { name?: string; value?: unknown }[];
	options?: CommandSizeNode[];
}

export function getCommandSize(node: CommandSizeNode): number {
	let total = (node.name?.length ?? 0) + (node.description?.length ?? 0);
	for (const choice of node.choices ?? []) {
		total += (choice.name?.length ?? 0) + String(choice.value ?? "").length;
	}
	for (const option of node.options ?? []) {
		total += getCommandSize(option);
	}
	return total;
}

export function findOversizedCommands(commands: CommandSizeNode[]) {
	return commands
		.map(command => ({ name: command.name ?? "(unnamed)", size: getCommandSize(command) }))
		.filter(entry => entry.size > DISCORD_COMMAND_SIZE_LIMIT);
}
