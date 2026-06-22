#!/usr/bin/env bash
# Pull the published image and (re)start the bot container for an app dir.
#
# Installed on the droplet at /opt/event-queue-bot-bin/ and run as root via the
# /usr/local/bin/deploy-event-queue-bot wrapper. The deploy workflow rsyncs this
# file on every deploy, so changes here roll out without re-provisioning.
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "Usage: deploy-event-queue-bot <app-path>" >&2
  exit 1
fi

APP_DIR="$1"

mkdir -p "$APP_DIR/data" "$APP_DIR/logs"
chown -R deploy:deploy "$APP_DIR"

cd "$APP_DIR"

if [ ! -f docker-compose.app.yml ]; then
  echo "Missing $APP_DIR/docker-compose.app.yml; sync deploy artifacts before deploying." >&2
  exit 1
fi

if [ ! -s .env ]; then
  echo "Missing $APP_DIR/.env; refusing to start the bot." >&2
  exit 1
fi

# shellcheck disable=SC1091
set -a
source .env
set +a

if [ -z "${CONTAINER_NAME:-}" ]; then
  echo "CONTAINER_NAME is required in $APP_DIR/.env" >&2
  exit 1
fi

docker compose -f docker-compose.app.yml pull
docker compose -f docker-compose.app.yml up -d
docker image prune -f --filter "until=72h"

for attempt in {1..12}; do
  if docker inspect -f '{{.State.Running}}' "$CONTAINER_NAME" 2>/dev/null | grep -qx true; then
    break
  fi
  if [ "$attempt" -eq 12 ]; then
    echo "Bot container did not start after deploy" >&2
    docker ps -a --filter "name=$CONTAINER_NAME" || true
    docker logs --tail 200 "$CONTAINER_NAME" 2>&1 || true
    exit 1
  fi
  sleep 2
done

docker logs --tail 100 "$CONTAINER_NAME"
