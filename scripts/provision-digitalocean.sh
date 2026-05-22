#!/usr/bin/env bash
set -euo pipefail

require_env() {
  if [ -z "${!1:-}" ]; then
    echo "$1 is required" >&2
    exit 1
  fi
}

write_output() {
  if [ -n "${GITHUB_OUTPUT:-}" ]; then
    printf '%s=%s\n' "$1" "$2" >> "$GITHUB_OUTPUT"
  fi
}

yaml_quote() {
  printf "%s" "$1" | sed "s/'/''/g; s/^/'/; s/$/'/"
}

require_env BOT_SSH_PUBLIC_KEY

if ! command -v doctl >/dev/null 2>&1; then
  echo "doctl is required. Install it with digitalocean/action-doctl in GitHub Actions." >&2
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required" >&2
  exit 1
fi

DO_REGION="${DO_REGION:-nyc3}"
DO_SIZE="${DO_SIZE:-s-1vcpu-1gb}"
DO_IMAGE="${DO_IMAGE:-ubuntu-24-04-x64}"
DO_DROPLET_NAME="${DO_DROPLET_NAME:-event-queue-bot}"
DO_SSH_KEY_NAME="${DO_SSH_KEY_NAME:-${DO_DROPLET_NAME}-deploy}"
DO_FIREWALL_NAME="${DO_FIREWALL_NAME:-${DO_DROPLET_NAME}-ssh}"
DO_TAG="${DO_TAG:-${DO_DROPLET_NAME}}"
DO_ENABLE_BACKUPS="${DO_ENABLE_BACKUPS:-false}"
APP_PATH="${APP_PATH:-/opt/event-queue-bot}"

if [[ ! "$APP_PATH" =~ ^/[A-Za-z0-9._/-]+$ ]]; then
  echo "APP_PATH must be an absolute path containing only letters, numbers, dots, underscores, dashes, and slashes" >&2
  exit 1
fi

public_key_file="$(mktemp)"
cloud_init_file="$(mktemp)"

cleanup() {
  rm -f "$public_key_file" "$cloud_init_file"
}
trap cleanup EXIT

printf '%s\n' "$BOT_SSH_PUBLIC_KEY" > "$public_key_file"

ssh_key_fingerprint="$(ssh-keygen -E md5 -lf "$public_key_file" | awk '{print $2}' | sed 's/^MD5://')"
ssh_public_key_yaml="$(yaml_quote "$BOT_SSH_PUBLIC_KEY")"
app_path_shell="'$APP_PATH'"

SSH_PUBLIC_KEY_YAML="$ssh_public_key_yaml" \
APP_PATH_SHELL="$app_path_shell" \
perl -0pe 's/\{\{SSH_PUBLIC_KEY_YAML\}\}/$ENV{SSH_PUBLIC_KEY_YAML}/g; s/\{\{APP_PATH_SHELL\}\}/$ENV{APP_PATH_SHELL}/g' \
  infra/digitalocean/cloud-init.yml > "$cloud_init_file"

echo "Provisioning DigitalOcean resources for ${DO_DROPLET_NAME}"

if doctl compute tag get "$DO_TAG" >/dev/null 2>&1; then
  echo "Reusing tag ${DO_TAG}"
else
  echo "Creating tag ${DO_TAG}"
  doctl compute tag create "$DO_TAG"
fi

ssh_keys_json="$(doctl compute ssh-key list --format ID,Name,FingerPrint --output json)"
ssh_key_id="$(
  jq -r --arg fp "$ssh_key_fingerprint" '
    map(select(.FingerPrint == $fp)) |
    if length > 1 then error("multiple SSH keys match fingerprint")
    elif length == 1 then .[0].ID
    else "" end
  ' <<< "$ssh_keys_json"
)"

if [ -n "$ssh_key_id" ]; then
  echo "Reusing SSH key with fingerprint ${ssh_key_fingerprint}"
else
  existing_key_by_name="$(
    jq -r --arg name "$DO_SSH_KEY_NAME" '
      map(select(.Name == $name)) |
      if length > 1 then error("multiple SSH keys match name")
      elif length == 1 then .[0].FingerPrint
      else "" end
    ' <<< "$ssh_keys_json"
  )"

  if [ -n "$existing_key_by_name" ]; then
    echo "DigitalOcean SSH key ${DO_SSH_KEY_NAME} exists with a different fingerprint" >&2
    exit 1
  fi

  echo "Creating SSH key ${DO_SSH_KEY_NAME}"
  ssh_key_id="$(
    doctl compute ssh-key import "$DO_SSH_KEY_NAME" \
      --public-key-file "$public_key_file" \
      --format ID \
      --no-header |
      awk 'NR == 1 { print $1 }'
  )"
fi

droplets_json="$(doctl compute droplet list --format ID,Name,PublicIPv4,Status --output json)"
droplet_count="$(
  jq -r --arg name "$DO_DROPLET_NAME" '[.[] | select(.Name == $name)] | length' <<< "$droplets_json"
)"

if [ "$droplet_count" -gt 1 ]; then
  echo "Found multiple DigitalOcean Droplets named ${DO_DROPLET_NAME}" >&2
  exit 1
fi

if [ "$droplet_count" -eq 1 ]; then
  droplet_id="$(jq -r --arg name "$DO_DROPLET_NAME" '.[] | select(.Name == $name) | .ID' <<< "$droplets_json")"
  echo "Reusing Droplet ${DO_DROPLET_NAME}"
else
  echo "Creating Droplet ${DO_DROPLET_NAME}"
  create_args=(
    compute droplet create "$DO_DROPLET_NAME"
    --region "$DO_REGION"
    --size "$DO_SIZE"
    --image "$DO_IMAGE"
    --ssh-keys "$ssh_key_id"
    --tag-names "$DO_TAG"
    --user-data-file "$cloud_init_file"
    --enable-ipv6
    --enable-monitoring
    --wait
    --format ID
    --no-header
  )

  if [[ "$DO_ENABLE_BACKUPS" =~ ^(1|true|TRUE|yes|YES|on|ON)$ ]]; then
    create_args+=(--enable-backups)
  fi

  droplet_id="$(doctl "${create_args[@]}" | awk 'NR == 1 { print $1 }')"
fi

firewalls_json="$(doctl compute firewall list --format ID,Name --output json)"
firewall_count="$(
  jq -r --arg name "$DO_FIREWALL_NAME" '[.[] | select(.Name == $name)] | length' <<< "$firewalls_json"
)"

if [ "$firewall_count" -gt 1 ]; then
  echo "Found multiple DigitalOcean Firewalls named ${DO_FIREWALL_NAME}" >&2
  exit 1
fi

inbound_rules="protocol:tcp,ports:22,address:0.0.0.0/0,address:::/0"
outbound_rules="protocol:icmp,address:0.0.0.0/0,address:::/0 protocol:tcp,ports:all,address:0.0.0.0/0,address:::/0 protocol:udp,ports:all,address:0.0.0.0/0,address:::/0"

if [ "$firewall_count" -eq 1 ]; then
  firewall_id="$(jq -r --arg name "$DO_FIREWALL_NAME" '.[] | select(.Name == $name) | .ID' <<< "$firewalls_json")"
  echo "Updating Firewall ${DO_FIREWALL_NAME}"
  doctl compute firewall update "$firewall_id" \
    --name "$DO_FIREWALL_NAME" \
    --inbound-rules "$inbound_rules" \
    --outbound-rules "$outbound_rules" \
    --droplet-ids "$droplet_id"
else
  echo "Creating Firewall ${DO_FIREWALL_NAME}"
  doctl compute firewall create \
    --name "$DO_FIREWALL_NAME" \
    --inbound-rules "$inbound_rules" \
    --outbound-rules "$outbound_rules" \
    --droplet-ids "$droplet_id"
fi

for attempt in {1..60}; do
  droplet_json="$(doctl compute droplet get "$droplet_id" --format ID,Name,PublicIPv4,Status --output json)"
  droplet_status="$(jq -r '.[0].Status' <<< "$droplet_json")"
  bot_host="$(jq -r '.[0].PublicIPv4' <<< "$droplet_json")"

  if [ "$droplet_status" = "active" ] && [ -n "$bot_host" ] && [ "$bot_host" != "<nil>" ]; then
    write_output bot_host "$bot_host"
    write_output droplet_id "$droplet_id"
    echo "Droplet ready: ${DO_DROPLET_NAME} (${bot_host})"
    exit 0
  fi

  echo "Waiting for Droplet ${DO_DROPLET_NAME} to become active..."
  sleep 10
done

echo "Timed out waiting for Droplet ${DO_DROPLET_NAME}" >&2
exit 1
