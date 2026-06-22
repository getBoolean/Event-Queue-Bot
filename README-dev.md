<!-- TOC -->
* [Running Locally](#running-locally)
  * [Option 1: Install and run with Docker (recommended)](#option-1-install-and-run-with-docker-recommended)
    * [Other useful docker commands](#other-useful-docker-commands)
  * [Option 2: Manually install and run](#option-2-manually-install-and-run)
* [Deploying via GitHub Actions](#deploying-via-github-actions)
* [Data storage and access](#data-storage-and-access)
* [How to create and edit commands](#how-to-create-and-edit-commands)
  * [Adding commands](#adding-commands)
  * [Adding command options](#adding-command-options)
  * [Adding buttons](#adding-buttons)
  * [Util files](#util-files)
  * [Database changes](#database-changes)
* [Misc](#misc)
* [Migrating from the legacy project (pre June 2024)](#migrating-from-the-legacy-project-pre-june-2024)
<!-- TOC -->

## Running Locally

Clone the repository:

```bash
git clone https://github.com/getBoolean/Event-Queue-Bot
cd Event-Queue-Bot
```

Create a Discord bot application and invite it to your server.
See [Discord.js guide](https://discordjs.guide/preparations/setting-up-a-bot-application.html).

Set `TOKEN` and `CLIENT_ID` in `.env`. All other variables ship with working defaults — change them only if you want different behavior. `DEFAULT_COLOR` must remain a key from the `Color` enum in `src/types/db.types.ts` if you change it.

### Option 1: Install and run with Docker (recommended)

[Install Docker](https://docs.docker.com/get-docker/).

You may need to grant yourself docker perms (replacing `<username>` with your actual username, `pi` in my case:

```bash
chmod +x launch-docker.sh
sudo usermod -aG docker <username>
sudo reboot
```

Run `./launch-docker.sh` or `launch-docker.bat` to:

* dump logs to `./logs` and close the previous container (if applicable)
* build the image & container
* start the bot in a detached state
* attach to the container (which can safely be exited with the `Ctrl+p Ctrl+q` key sequence. Using `CTRL-c` while attached will stop the container)

Pass `--pull` to also run `git fetch` + `git merge --no-ff` before rebuilding (e.g. `./launch-docker.sh --pull`). Without the flag, the working tree is left untouched.

*The bot auto-applies pending Drizzle migrations on startup (`src/db/db.ts`); run drizzle commands only when authoring a new migration.*

#### Other useful docker commands

Attach to the bot container (`Ctrl+p Ctrl+q` to detach):

```bash
docker attach queue-bot
```

View live logs:

```bash
docker logs -f queue-bot
```

Stop the bot:

```bash
docker compose down
```

### Option 2: Manually install and run

This method is not recommended, because it lacks the logging, auto-restart, and rebuild speed of Docker.

[Install Node.js](https://nodejs.org/en/download/package-manager).

Run the setup script (**run each time you update the project**):

```bash
npm run setup
```

Start the bot:

```bash
npm start
```

## Deploying via GitHub Actions

Pushes to `master` trigger `.github/workflows/provision-and-deploy.yml`, which runs:

1. **`build-and-push`** — builds the Docker image and pushes it to GHCR (`ghcr.io/getboolean/event-queue-bot`) tagged with the branch name (`master` for dev, `prod` for prod).
2. **`discover`** — looks up the single shared DigitalOcean droplet by `DO_DROPLET_NAME`.
3. **`provision`** — creates the droplet via cloud-init only if none exists.
4. **`deploy`** — syncs the deploy scripts (`infra/digitalocean/*.sh`) and `docker-compose.app.yml`, writes `.env`, pulls the GHCR image, and runs `docker compose -f docker-compose.app.yml up -d` on the droplet. Pending Drizzle migrations apply automatically on container start.

The droplet's deploy logic lives in `infra/digitalocean/prepare-event-queue-bot-dir.sh` and `infra/digitalocean/deploy-event-queue-bot.sh`. cloud-init installs thin root wrappers (`/usr/local/bin/*`) that exec these scripts from `/opt/event-queue-bot-bin/`, and the `deploy` job rsyncs the latest copies on every run — so changes to that logic roll out without re-provisioning. Only the wrappers, the sudoers entry, and the cloud-init `runcmd` require a re-provision to change.

Both environments share one droplet: prod runs the `queue-bot` container from `/opt/event-queue-bot`, and dev runs the `queue-bot-nightly` container from `/opt/event-queue-bot-nightly`, each with its own `data/main.sqlite`. The `deploy` job derives the container name, app path, and image tag from the branch and serializes prod/dev deploys via a shared concurrency group.

Secrets, variables, and SSH key setup live in [`INFRA.md`](INFRA.md). For SSH access to the droplet, see [`INFRA.md` → "Connect to the Droplet"](INFRA.md#connect-to-the-droplet).

To promote `master` to prod, open the prefilled compare PR: [`master → prod`](https://github.com/getBoolean/Event-Queue-Bot/compare/prod...getBoolean:Event-Queue-Bot:master).

## Data storage and access

The bot uses a SQLite database, which is stored in the `data/main.sqlite` file.
The database is managed by the `drizzle` package.
The schema is defined in the `src/db/schema.ts` file.
Query statements are defined in the `src/db/queries.ts` file.
Modification statements are defined in the `src/db/store.ts` file.
A store is created and attached to each bot interaction.

## How to create and edit commands

Please reference the other files as examples, they follow very similar structures. These instructions are more geared towards pointing you
to the files that will need to be added/updated.

### Adding commands

1. Add a new `.command.ts` file under `src/commands/commands`, extending `EveryoneCommand` or `AdminCommand`. Subcommands are methods named `<commandName>_<subcommand>` (e.g. `queues_add` for `/queues add`).
2. Register it in `src/commands/commands.loader.ts`.
3. Update `README.md` and the help text in `src/commands/commands/help.command.ts`.

### Adding command options

1. Add a new `.option.ts` file under `src/options/options`, extending a base from `src/options/base-option.ts`. Options expose `.build` (for `SlashCommandBuilder`) and `.get(inter)` (parsed value, cached on the interaction).
2. Register it in `src/options/options.loader.ts`.

### Adding buttons

1. Create a new `.button.ts` file in the `src/buttons/buttons` directory. Buttons should extend `EveryoneButton` or `AdminButton`.
2. Update the `src/buttons/buttons.loader.ts` file.

### Util files

Non-trivial command/button logic should live in a `*.utils.ts` namespace under `src/utils`, keeping the command/button file thin.

### Database changes

If you need to add or modify database tables or columns:

1. Update `src/db/schema.ts`. Use plain numeric defaults (`.default(0)`) — `.default(0n)` trips a `drizzle-kit` BigInt-serialization bug. `$type<bigint>()` still types the column as `bigint`.
2. For new tables or query patterns, update `src/db/store.ts` and `src/db/queries.ts`.
3. Run `npx drizzle-kit generate`. Commit the new `data/migrations/*.sql` and `data/migrations/meta/*` files — the runtime migrator applies them on next startup.

## Misc

Please lint before pushing:

```bash
npm run lint
```

This project is designed to run without compiling thanks to `@swc-node/register/esm`.

## Migrating from the legacy project (pre June 2024)

Open a terminal and navigate to the following directory in this project: `data/migrations/legacy-export`.
Export the old database tables to csv files.

The following command will perform the export for Postgres:

```bash
psql -d queue -Atc "SELECT tablename FROM pg_tables WHERE schemaname='public'" | xargs -I{} psql -d queue -c "\copy {} to 'legacy-export/{}.csv' csv header"
```

*If you have a different database name, replace `queue` with your database name.*

Then in the `.env` file, set `ENABLE_LEGACY_MIGRATION` to true:

```dotenv
ENABLE_LEGACY_MIGRATION=true
```

When `ENABLE_LEGACY_MIGRATION` is true, the bot checks the `data/migrations/legacy-export` directory on startup. If it finds the csv files, it will prompt you via console input to confirm the import. If confirmed, it creates a dated backup of `data/main.sqlite`, then merges the legacy data into the database.

Once the data is imported, set `ENABLE_LEGACY_MIGRATION` back to false.
