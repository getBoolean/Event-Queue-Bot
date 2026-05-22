# Infrastructure Setup

GitHub Actions provisions a DigitalOcean VPS with the official `doctl` CLI and
deploys the bot from `master`. No local Terraform or server setup is required.

Store the secrets and variables below at the **repository** level
(`Settings → Secrets and variables → Actions`).

Create a GitHub environment named `production` with required reviewers — it
gates the `discover` job (and therefore the whole pipeline) but does **not**
hold any secrets or variables.

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

Save these required GitHub repository secrets:

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

These are repository variables (not secrets).

| Variable | Default |
| --- | --- |
| `DO_REGION` | `nyc3` |
| `DO_SIZE` | `s-1vcpu-1gb` |
| `DO_IMAGE` | `ubuntu-24-04-x64` |
| `DO_DROPLET_NAME` | `event-queue-bot` |
| `DO_ENABLE_BACKUPS` | `false` |
| `APP_PATH` | `/opt/event-queue-bot` |
| `BOT_TOP_GG_TOKEN` | empty |
| `BOT_PATCH_NOTES_CHANNEL_ID` | empty |
| `BOT_DEFAULT_COLOR` | `Random` |
| `BOT_DEFAULT_SCHEDULE_TIMEZONE` | `america/chicago` |
| `BOT_ENABLE_LEGACY_MIGRATION` | `false` |
| `BOT_FORCE_SEND_PATCH_NOTES` | `false` |

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

Future pushes to `master` deploy automatically.

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
