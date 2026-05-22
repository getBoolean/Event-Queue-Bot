# Infrastructure Setup

GitHub Actions provisions a DigitalOcean VPS with the official `doctl` CLI and
deploys the bot. No local Terraform or server setup is required.

## 1. Create DigitalOcean Token

Create a DigitalOcean API token with access to manage:

- Droplets
- SSH keys
- Firewalls
- Tags

Save it as this GitHub repository secret:

```text
DIGITALOCEAN_TOKEN
```

## 2. Create Deploy SSH Key

Create a key pair:

```bash
ssh-keygen -t ed25519 -C "event-queue-bot-deploy" -f event-queue-bot-deploy
```

Save the private key as:

```text
BOT_SSH_PRIVATE_KEY
```

Save the public key as:

```text
BOT_SSH_PUBLIC_KEY
```

## 3. Add Bot Secrets

Save these required GitHub repository secrets:

```text
BOT_APP_ID
BOT_TOKEN
```

| Secret | Where to find it |
| --- | --- |
| `BOT_APP_ID` | Discord Developer Portal -> your application -> `General Information` -> `Application ID` |
| `BOT_TOKEN` | Discord Developer Portal -> your application -> `Bot` -> token |

Optional bot secrets:

| Secret | If omitted |
| --- | --- |
| `TOP_GG_TOKEN` | empty |
| `PATCH_NOTES_CHANNEL_ID` | empty |
| `DEFAULT_COLOR` | `Random` |
| `DEFAULT_SCHEDULE_TIMEZONE` | `america/chicago` |
| `ENABLE_LEGACY_MIGRATION` | `false` |
| `FORCE_SEND_PATCH_NOTES` | `false` |

The workflow generates the server `.env` file from these secrets during deploy.

## 4. Optional GitHub Variables

Defaults:

```text
DO_REGION=nyc3
DO_SIZE=s-1vcpu-1gb
DO_IMAGE=ubuntu-24-04-x64
DO_DROPLET_NAME=event-queue-bot
DO_ENABLE_BACKUPS=false
APP_PATH=/opt/event-queue-bot
```

Set `DO_ENABLE_BACKUPS=true` before the first deploy if you want DigitalOcean
Droplet backups.

## 5. Run Deploy

In GitHub:

1. Open `Actions`.
2. Select `Provision and Deploy Bot`.
3. Run the workflow.

The workflow creates or reuses the VPS, writes `.env`, syncs the repo, and runs
Docker Compose.

Future pushes to `master` deploy automatically.

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
