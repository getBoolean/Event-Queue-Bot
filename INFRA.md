# Infrastructure Setup

GitHub Actions provisions a DigitalOcean VPS with the official `doctl` CLI and
deploys the bot from `master`. No local Terraform or server setup is required.

Each environment is split into a **gate** env (required reviewers, no secrets;
attached to the `discover` job) and a **secrets** env (no reviewers; attached to
`provision` and `deploy`). Approval is requested once per run.

Shared infra secrets (DO token, SSH keys) live at the **repository** level and
fall through from any environment. Bot identity (`BOT_APP_ID`, `BOT_TOKEN`)
lives per-environment so prod and dev can target different Discord applications.

Create before first deploy:

- `prod-gate` — required reviewers, no secrets/vars.
- `prod` — no reviewers; holds secrets `BOT_APP_ID`, `BOT_TOKEN`, and any per-env vars
  from [Optional GitHub Variables](#5-optional-github-variables).

A `dev` environment is optional — see
[Optional: setting up a dev environment](#optional-setting-up-a-dev-environment).

## 1. Create DigitalOcean Token

Create a DigitalOcean API token with these custom scopes:

- `droplet:read`, `droplet:create`
- `ssh_key:read`, `ssh_key:create`
- `firewall:read`, `firewall:create`, `firewall:update`
- `tag:read`, `tag:create`
- `project:read`, `project:create`, `project:update`

Save it as this GitHub repository secret:

```text
DIGITALOCEAN_TOKEN
```

## 2. Create Deploy SSH Key

Create a key pair:

```bash
ssh-keygen -t ed25519 -C "event-queue-bot-deploy" -f event-queue-bot-deploy
```

Save the private key as this GitHub repository secret:

```text
SSH_DEPLOY_PRIVATE_KEY
```

Save the public key as this GitHub repository secret:

```text
SSH_DEPLOY_PUBLIC_KEY
```

## 3. Create SSH Host Key

Create a key pair for the server's SSH host identity (prevents MITM during deploy):

```bash
ssh-keygen -t ed25519 -C "event-queue-bot-host" -f event-queue-bot-host
```

Save the private key as this GitHub repository secret:

```text
SSH_HOST_PRIVATE_KEY
```

Save the public key as this GitHub repository secret:

```text
SSH_HOST_PUBLIC_KEY
```

**Note:** both private key secrets must end with a trailing newline after
`-----END OPENSSH PRIVATE KEY-----`. Without it, `sshd` fails to load the host
key and deploys fail host-key verification.

**Store both keypairs in a password manager.** GitHub secrets are write-only —
lost local copies are unrecoverable. See [Connect to the Droplet](#connect-to-the-droplet)
for the rotation path.

## 4. Add Bot Secrets

Save these on the **`prod` environment** (not at repo level, so dev can hold a
different application's credentials):

```text
BOT_APP_ID
BOT_TOKEN
```

| Secret | Where to find it |
| --- | --- |
| `BOT_APP_ID` | Discord Developer Portal -> your application -> `General Information` -> `Application ID` |
| `BOT_TOKEN` | Discord Developer Portal -> your application -> `Bot` -> token |

The workflow generates the server `.env` file from these secrets during deploy.

## 5. Optional GitHub Variables

GitHub variables (not secrets). Set at repo level for shared values, or on a
specific environment (`prod`, `dev`) to override. Unset → falls back to
the default below.

| Variable | Default |
| --- | --- |
| `DO_REGION` | `nyc3` |
| `DO_SIZE` | `s-1vcpu-1gb` |
| `DO_IMAGE` | `ubuntu-24-04-x64` |
| `DO_DROPLET_NAME` | `event-queue-bot` |
| `DO_ENABLE_BACKUPS` | `false` |
| `DO_SWAP_SIZE` | `1G` |
| `APP_PATH` | `/opt/event-queue-bot` |
| `BOT_TOP_GG_TOKEN` | empty |
| `BOT_PATCH_NOTES_CHANNEL_ID` | empty |
| `BOT_DEFAULT_COLOR` | `Random` |
| `BOT_DEFAULT_SCHEDULE_TIMEZONE` | `america/chicago` |
| `BOT_ENABLE_LEGACY_MIGRATION` | `false` |
| `BOT_FORCE_SEND_PATCH_NOTES` | `false` |
| `BOT_SILENT` | `false` |

`DO_SWAP_SIZE` accepts a positive integer optionally suffixed `K`/`M`/`G`, or `0` to disable.
Applied only at first boot via cloud-init — changing it doesn't affect existing droplets.

- **Prod (`s-1vcpu-1gb`)**: leave at `1G` default — gives node-gyp/`better-sqlite3` headroom
  during `docker compose up --build` and lets the kernel evict idle anon pages in favor of FS
  cache. Set to `0` to disable if you prefer prod to fail loudly on memory pressure rather than swap.
- **Dev (`s-1vcpu-512mb-10gb`)**: leave at `1G` default — without swap, `npm ci` OOMs during
  native compile.

Set `DO_ENABLE_BACKUPS` to `true` before the first deploy if you want DigitalOcean
Droplet backups. Backups add 20% to the droplet cost. You can also back up the
database manually via `scp` — see [Backup Before Deleting](#backup-before-deleting).

## 6. Run Deploy

In GitHub:

1. Open `Actions`.
2. Select `Provision and Deploy Bot`.
3. Run the workflow.

The workflow creates or reuses the VPS, writes `.env`, syncs the repo, and runs
Docker Compose.

Future pushes to `master` trigger the workflow automatically; each run pauses
at `discover` for a reviewer to approve via the `prod-gate` environment before
`provision` and `deploy` proceed.

## Optional: setting up a dev environment

Optional. Adds a parallel droplet running a second Discord bot from the `dev`
branch, for testing risky changes (migrations, refactors, patch notes) before
prod. The dev side activates only on pushes to `dev`; if the branch and
environments don't exist, prod is unaffected.

Maintainer's dev bot invite:
<https://discord.com/oauth2/authorize?client_id=1507641818907672688>

1. Create a second Discord application; note its Application ID and bot token.
2. Create two GitHub environments:
   - `dev-gate` — required reviewers, no secrets/vars.
   - `dev` — no reviewers.
3. On `dev`, add `BOT_APP_ID` and `BOT_TOKEN` from step 1.
4. On `dev`, add these vars (shared infra secrets stay at repo level):

   | Variable | Value |
   | --- | --- |
   | `DO_DROPLET_NAME` | `event-queue-bot-dev` |
   | `APP_PATH` | `/opt/event-queue-bot-dev` |
   | `DO_PROJECT_NAME` | `Event Queue Bot Dev` |
   | `DO_PROJECT_ENVIRONMENT` | `Development` |
   | `DO_SIZE` | `s-1vcpu-512mb-10gb` (cheapest Basic droplet, ~$4/mo; the bot fits in 512MB for dev) |

   At the 512 MB dev size, leave `DO_SWAP_SIZE` at its `1G` default — without swap,
   `npm ci` OOMs during `better-sqlite3`'s native compile and the build wedges silently.

   Leave `BOT_PATCH_NOTES_CHANNEL_ID`, `BOT_TOP_GG_TOKEN`, etc. empty or point
   at a test channel.
5. Create the `dev` branch from `master` and push. `discover` requests approval
   via `dev-gate`; `provision`/`deploy` then spin up `event-queue-bot-dev`.

Subsequent pushes to `dev` trigger the workflow automatically; each run pauses
at `discover` for `dev-gate` approval before `provision`/`deploy` proceed. Prod
and dev share no state: separate droplets, separate `data/main.sqlite`,
separate Discord applications.

## Connect to the Droplet

Get the droplet IPv4 from the latest workflow's `discover` job, `doctl compute
droplet list`, or the DO console, then connect with the deploy private key from
Section 2:

```bash
ssh -i path/to/event-queue-bot-deploy deploy@<droplet-ip>
```

  Accept the host-key prompt on first connection.

**Lost the deploy key:** regenerate per Section 2, replace the
`SSH_DEPLOY_PRIVATE_KEY` / `SSH_DEPLOY_PUBLIC_KEY` secrets, back up the database
(see [Backup Before Deleting](#backup-before-deleting)), delete the droplet, and
re-run the workflow.

## Backup Before Deleting

The production database is:

```text
/opt/event-queue-bot/data/main.sqlite
```

Download it before deleting the Droplet:

```bash
scp deploy@your_server_ip:/opt/event-queue-bot/data/main.sqlite ./main.sqlite.backup
```

To remove the deployment, delete these DigitalOcean resources:

```text
Droplet:  event-queue-bot
Firewall: event-queue-bot-ssh
SSH key:  event-queue-bot-deploy
Tag:      event-queue-bot
```

If dev is configured, the same names with a `-dev` suffix (derived from
`DO_DROPLET_NAME` in `scripts/provision-digitalocean.sh`):

```text
Database: /opt/event-queue-bot-dev/data/main.sqlite
Droplet:  event-queue-bot-dev
Firewall: event-queue-bot-dev-ssh
SSH key:  event-queue-bot-dev-deploy
Tag:      event-queue-bot-dev
```
