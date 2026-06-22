#!/usr/bin/env bash
# Create an app directory (data + logs) owned by the deploy user.
#
# Installed on the droplet at /opt/event-queue-bot-bin/ and run as root via the
# /usr/local/bin/prepare-event-queue-bot-dir wrapper. The deploy workflow rsyncs
# this file on every deploy, so changes here roll out without re-provisioning.
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "Usage: prepare-event-queue-bot-dir <app-path>" >&2
  exit 1
fi

APP_DIR="$1"

case "$APP_DIR" in
  /opt/event-queue-bot|/opt/event-queue-bot-nightly) ;;
  *)
    echo "Refusing to prepare unexpected path: $APP_DIR" >&2
    exit 1
    ;;
esac

mkdir -p "$APP_DIR/data" "$APP_DIR/logs"
chown -R deploy:deploy "$APP_DIR"
