# DigitalOcean Deployment

This Terraform module provisions one Ubuntu Droplet for Queue Bot. Cloud-init installs Docker, creates a `deploy` user, clones the repository into `/opt/event-queue-bot`, and writes `/usr/local/bin/deploy-event-queue-bot`.

Secrets are intentionally not stored in Terraform state. The production `.env` is written by GitHub Actions from the `BOT_ENV` repository secret.

## Provision

```bash
cd infra/digitalocean
terraform init
terraform apply
terraform output bot_host
```

Required input:

- `ssh_public_key`: public key for the `deploy` user.
- `do_token`: optional if `DIGITALOCEAN_TOKEN` is set in your shell.

Optional inputs:

- `region` defaults to `nyc3`.
- `size` defaults to `s-1vcpu-1gb`.
- `image` defaults to `ubuntu-24-04-x64`.
- `repo_url` defaults to `https://github.com/getBoolean/Event-Queue-Bot.git`.
- `branch` defaults to `master`.
- `enable_backups` defaults to `false`.

## GitHub Secrets

Set these repository secrets before running the deploy workflow:

- `BOT_HOST`: value from `terraform output bot_host`.
- `BOT_SSH_PRIVATE_KEY`: private key matching `ssh_public_key`.
- `BOT_ENV`: full production `.env` file content.

Example `BOT_ENV`:

```dotenv
CLIENT_ID=
TOKEN=
TOP_GG_TOKEN=
PATCH_NOTES_CHANNEL_ID=
DEFAULT_COLOR=Random
DEFAULT_SCHEDULE_TIMEZONE=america/chicago
ENABLE_LEGACY_MIGRATION=false
FORCE_SEND_PATCH_NOTES=false
```

## Manual Server Deploy

```bash
ssh deploy@$(terraform output -raw bot_host)
sudo /usr/local/bin/deploy-event-queue-bot
```

The deploy command preserves `data/` and `logs/`, pulls the configured branch, rebuilds the Docker image, and restarts the `queue-bot` container.

