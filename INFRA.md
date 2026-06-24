# Infrastructure Setup

GitHub Actions builds the bot image, pushes it to GHCR, provisions a single
DigitalOcean VPS with the official `doctl` CLI, and deploys the bot. Pushes to
`master` deploy the **dev** container; promotion to prod is a deliberate
`master → prod` PR merge. No local Terraform or server setup is required.

Both environments share **one droplet**. Prod runs the `queue-bot` container
from `/opt/event-queue-bot`; dev runs the `queue-bot-nightly` container from
`/opt/event-queue-bot-nightly`. Each has its own `data/main.sqlite`, so they
share the box but not state. The `deploy` job derives the container name, app
path, and image tag from the branch and serializes prod/dev deploys via a shared
concurrency group.

Each environment has a **gate** env (required reviewers, no secrets; attached to
the `gate` job) and a **secrets** env (no reviewers; attached to `deploy`).
Approval is requested once per run. The `build-and-push`, `discover`, and
`provision` jobs are not environment-scoped — they read repo-level secrets/vars
and target the single shared droplet.

Shared infra secrets (DO token, SSH keys) live at the **repository** level and
fall through from any environment. Bot identity (`BOT_APP_ID`, `BOT_TOKEN`)
lives per-environment so prod and dev can target different Discord applications.

Create before first deploy:

- `dev-gate` — required reviewers, no secrets/vars.
- `dev` — no reviewers; holds secrets `BOT_APP_ID`, `BOT_TOKEN`, and any per-env vars
  from [Optional GitHub Variables](#5-optional-github-variables).

A `prod` environment and `prod` branch are required for prod deploys — see
[Setting up the prod promotion path](#setting-up-the-prod-promotion-path).

## 1. Create DigitalOcean Token

Create a DigitalOcean API token with these custom scopes:

- `droplet:read`, `droplet:create`, `droplet:delete`
- `ssh_key:read`, `ssh_key:create`
- `firewall:read`, `firewall:create`, `firewall:update`
- `tag:read`, `tag:create`
- `project:read`, `project:create`, `project:update`

`droplet:delete` is required only when tearing down the droplet for a
re-provision (see [Re-provisioning via the CLI](#re-provisioning-via-the-cli));
CI day-to-day deploys use the read/create scopes.

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

Save these on the **`dev` environment** (not at repo level, so prod can hold a
different application's credentials):

```text
BOT_APP_ID
BOT_TOKEN
```

When the prod promotion path is set up, the prod bot's `BOT_APP_ID` /
`BOT_TOKEN` go on the **`prod` environment** instead — see
[Setting up the prod promotion path](#setting-up-the-prod-promotion-path).

| Secret | Where to find it |
| --- | --- |
| `BOT_APP_ID` | Discord Developer Portal -> your application -> `General Information` -> `Application ID` |
| `BOT_TOKEN` | Discord Developer Portal -> your application -> `Bot` -> token |

The workflow generates the server `.env` file from these secrets during deploy.

## 4b. GHCR image access

The `build-and-push` job pushes the image to `ghcr.io/getboolean/event-queue-bot`
and the droplet pulls it during deploy. Make the pull work one of two ways:

- **Public package (simplest):** in the GHCR package settings, set the package
  visibility to public. No extra secret is needed.
- **Private package:** create a classic PAT with the `read:packages` scope and
  save it as the repository secret `GHCR_PULL_TOKEN`. The deploy job pipes the
  token to `docker login --password-stdin` on the droplet over SSH (the token is
  never embedded in the remote command string). If the secret is empty, the login
  step is skipped (so it is safe to leave unset for a public package).

The deploy job also writes `GHCR_IMAGE=ghcr.io/<owner>/<repo>` into the server
`.env` so `docker-compose.app.yml` can pull the correct registry path without
hardcoding it in the compose file.

## 5. Optional GitHub Variables

GitHub variables (not secrets). The `DO_*` infra variables drive the single
shared droplet, so set them at the **repository** level. The `BOT_*` variables
are per-environment so prod and dev can differ. Unset → falls back to the
default below.

| Variable | Scope | Default |
| --- | --- | --- |
| `DO_REGION` | repo | `nyc3` |
| `DO_SIZE` | repo | `s-1vcpu-1gb` |
| `DO_IMAGE` | repo | `ubuntu-24-04-x64` |
| `DO_DROPLET_NAME` | repo | `event-queue-bot` |
| `DO_ENABLE_BACKUPS` | repo | `false` |
| `DO_SWAP_SIZE` | repo | `1G` |
| `SSH_ALLOW_IPS` | repo | empty (SSH open to all) |
| `APP_PATH` | env | branch-derived (see above) |
| `BOT_TOP_GG_TOKEN` | env | empty |
| `BOT_PATCH_NOTES_CHANNEL_ID` | env | empty |
| `BOT_DEFAULT_COLOR` | env | `Random` |
| `BOT_DEFAULT_SCHEDULE_TIMEZONE` | env | `america/chicago` |
| `BOT_ENABLE_LEGACY_MIGRATION` | env | `false` |
| `BOT_FORCE_SEND_PATCH_NOTES` | env | `false` |
| `BOT_SILENT` | env | `false` |

The app path, container name, and image tag are derived from the branch by the
`deploy` job (prod → `/opt/event-queue-bot` / `queue-bot` / `prod`; dev →
`/opt/event-queue-bot-nightly` / `queue-bot-nightly` / `master`). Override the
app path per environment with the optional `APP_PATH` variable.

`DO_SWAP_SIZE` accepts a positive integer optionally suffixed `K`/`M`/`G`, or `0` to disable.
Applied only at first boot via cloud-init — changing it doesn't affect existing droplets.

Leave `DO_SWAP_SIZE` at the `1G` default. The shared droplet runs both the prod
and dev containers; since images are now built in CI and only pulled on the box,
build-time memory pressure is gone, but swap still gives the two resident bots
headroom. If memory proves tight, bump `DO_SIZE` to `s-1vcpu-2gb`.

Set `DO_ENABLE_BACKUPS` to `true` before the first deploy if you want DigitalOcean
Droplet backups. Backups add 20% to the droplet cost. You can also back up the
database manually via `scp` — see [Backup Before Deleting](#backup-before-deleting).

## 6. Run Deploy

In GitHub:

1. Open `Actions`.
2. Select `Provision and Deploy Bot`.
3. Run the workflow.

The workflow builds and pushes the image to GHCR, creates or reuses the VPS,
syncs `docker-compose.app.yml`, writes `.env`, pulls the image, and runs Docker
Compose via `/usr/local/bin/deploy-event-queue-bot` (installed by cloud-init).
The deploy script and sudoers entry live in cloud-init — changing them requires
a re-provision. Firewall rules are reconciled by `scripts/ensure-firewall.sh`
in both the `provision` and `deploy` jobs, so firewall changes apply even when
provision is skipped.

Production containers run as the `node` user (see `Dockerfile`), with per-service
CPU/memory limits in `docker-compose.app.yml` suited to a 1 GB droplet running
both prod and dev bots. Patch notes and other stdin prompts are disabled in
production compose (`stdin_open` / `tty` are local-only in `docker-compose.yml`);
set `BOT_FORCE_SEND_PATCH_NOTES=true` on the environment when you want patch
notes sent without an interactive prompt.

Local `.env` files are excluded from the Docker build context (`.dockerignore`)
so secrets are not baked into images.

Future pushes to `master` deploy to dev automatically; each run pauses at
`gate` for `dev-gate` reviewer approval before `build-and-push`, `discover`,
`provision`, and `deploy` proceed. Prod is reached only by merging
`master → prod` — see
[Setting up the prod promotion path](#setting-up-the-prod-promotion-path).

## Setting up the prod promotion path

Required for prod deploys. Without this, the workflow only ever targets dev.
Adds the prod environment and the `master → prod` merge gate so feature work
auto-validates on dev and only reaches users when explicitly promoted. Both
environments deploy to the **same** droplet (provisioned on the first dev or
prod run), so no second droplet is created — only the prod-side credentials and
the promotion workflow.

The default `dev` environment from §4 already runs the dev container (the dev
Discord application from §4's `BOT_APP_ID`/`BOT_TOKEN`). What follows sets up the
*prod* side and the promotion workflow.

Maintainer's dev bot invite (for reference; install this on your own test
guild so you can poke at it):
<https://discord.com/oauth2/authorize?client_id=1507641818907672688>

1. Create a second Discord application for **prod**; note its Application ID
   and bot token. (The dev application from §4 stays on dev.)
2. Create two GitHub environments:
   - `prod-gate` — required reviewers, no secrets/vars.
   - `prod` — no reviewers.
3. On `prod`, add `BOT_APP_ID` and `BOT_TOKEN` from step 1, plus any per-env
   `BOT_*` variables you want to differ from dev. Infra `DO_*` vars and secrets
   stay at the repository level (shared droplet); there are no per-environment
   droplet/path/size overrides.
4. Create the `prod` branch from `master` and push it. Pushes and merges to
   `prod` deploy the prod container to the shared droplet, gated by `prod-gate`.
5. Add branch protection on `prod`:
   - Require a pull request before merging.
   - Require deployments to succeed before merging → add `dev`. This forces
     the head SHA to have already passed a dev deploy before it can land on
     prod.
   - (Optional) restrict who can merge, require approvals, dismiss stale
     approvals on push.

**Promotion workflow:** feature branch → PR to `master` → merge → dev deploys
automatically (gated by `dev-gate`) → open PR [`master → prod`][promote-pr] → branch
protection confirms the head SHA succeeded on dev → merge → prod deploys
(gated by `prod-gate`).

[promote-pr]: https://github.com/getBoolean/Event-Queue-Bot/compare/prod...getBoolean:Event-Queue-Bot:master

Prod and dev share one droplet but no state: separate containers
(`queue-bot` vs `queue-bot-nightly`), separate app dirs and `data/main.sqlite`,
separate Discord applications.

## Single-instance requirement

Each environment should run **one** bot container against **one** SQLite database.
SQLite write concurrency is poor with multiple writers on the same file.

**Event sync** (`EventSyncLock`) uses a row in `event_sync_lock` so two processes
that accidentally share a database will not run `syncEventQueues` /
`reconcileRoomChannels` in parallel. Stale locks older than 10 minutes are cleared
at startup.

**Scheduled occurrence jobs** (`node-schedule` in `event-jobs.registry`) remain
process-local — do not run multiple bot processes against the same DB.

## Re-provisioning via the CLI

When cloud-init changes (deploy script, sudoers, swap size, etc.), delete the
droplet and re-run the workflow so provision creates a fresh one. The same
`DIGITALOCEAN_TOKEN` secret CI uses works locally with `doctl`:

```bash
export DIGITALOCEAN_TOKEN=<your-token>
doctl auth init -t "$DIGITALOCEAN_TOKEN"
```

The token needs the scopes listed in [§1](#1-create-digitalocean-token),
including **`droplet:delete`** for teardown. Typical sequence:

1. Back up both databases (see [Backup Before Deleting](#backup-before-deleting)).
2. Delete the droplet: `doctl compute droplet delete event-queue-bot` (or the
   DO console).
3. Push the updated cloud-init and run `Provision and Deploy Bot` — provision
   recreates the droplet, then deploy starts the containers.
4. Restore each database if needed (stop container, copy `main.sqlite` back,
   restart).

## SSH access and hardening

SSH (port 22) is reachable from the public internet by default. The DigitalOcean
cloud firewall created by `scripts/ensure-firewall.sh` allows inbound TCP/22 from
`0.0.0.0/0` and `::/0` unless you restrict it.

**Mitigations in this repo:**

- **fail2ban** — installed on first boot via cloud-init with an `sshd` jail
  (5 failures → 1 hour ban). Requires a **re-provision** to apply on an
  existing droplet.
- **Optional IP allowlist** — set the repository variable `SSH_ALLOW_IPS` to a
  comma-separated list of CIDRs (e.g. `203.0.113.10/32,198.51.100.0/24`). The
  next deploy run updates the DO firewall to allow SSH only from those addresses.
  Useful when your admin IP or a VPN egress range is stable. GitHub Actions
  runners use varying IPs, so do not rely on this alone for CI unless you also
  allow the ranges you need for deploy SSH.
- **Project-level controls** — consider a DigitalOcean project firewall,
  Tailscale-only SSH, or disabling password auth (already off via cloud-init).

Treat an open SSH port as a residual risk: keep the OS patched, rotate deploy
keys if compromised, and prefer restricting SSH at the network layer when
feasible.

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

Both databases live on the shared droplet:

```text
Prod: /opt/event-queue-bot/data/main.sqlite
Dev:  /opt/event-queue-bot-nightly/data/main.sqlite
```

Download them before deleting the droplet:

```bash
scp deploy@your_server_ip:/opt/event-queue-bot/data/main.sqlite ./main.sqlite.prod.backup
scp deploy@your_server_ip:/opt/event-queue-bot-nightly/data/main.sqlite ./main.sqlite.dev.backup
```

To remove the deployment entirely, delete these DigitalOcean resources (names
derived from `DO_DROPLET_NAME` in `scripts/provision-digitalocean.sh`):

```text
Droplet:  event-queue-bot
Firewall: event-queue-bot-ssh
SSH key:  event-queue-bot-deploy
Tag:      event-queue-bot
```
