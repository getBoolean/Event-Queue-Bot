#!/usr/bin/env bash
# Ensure the DigitalOcean firewall allows SSH (idempotent).
set -euo pipefail

if ! command -v doctl >/dev/null 2>&1; then
	echo "doctl is required" >&2
	exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
	echo "jq is required" >&2
	exit 1
fi

DO_DROPLET_NAME="${DO_DROPLET_NAME:-event-queue-bot}"
DO_FIREWALL_NAME="${DO_FIREWALL_NAME:-${DO_DROPLET_NAME}-ssh}"

droplet_id="$(doctl compute droplet list \
	--format Name,ID \
	--no-header \
	| awk -v name="${DO_DROPLET_NAME}" '$1 == name { print $2; exit }')"

if [ -z "${droplet_id}" ]; then
	echo "No droplet named ${DO_DROPLET_NAME}; skipping firewall update." >&2
	exit 0
fi

if [ -n "${SSH_ALLOW_IPS:-}" ]; then
	inbound_rules="protocol:tcp,ports:22"
	IFS=',' read -ra ssh_allow_ips <<< "${SSH_ALLOW_IPS}"
	for ip in "${ssh_allow_ips[@]}"; do
		ip="${ip#"${ip%%[![:space:]]*}"}"
		ip="${ip%"${ip##*[![:space:]]}"}"
		[ -n "${ip}" ] || continue
		inbound_rules="${inbound_rules},address:${ip}"
	done
	echo "Restricting SSH to SSH_ALLOW_IPS: ${SSH_ALLOW_IPS}"
else
	inbound_rules="protocol:tcp,ports:22,address:0.0.0.0/0,address:::/0"
	echo "SSH open to all addresses (set SSH_ALLOW_IPS to restrict)."
fi
outbound_rules="protocol:icmp,address:0.0.0.0/0,address:::/0 protocol:tcp,ports:all,address:0.0.0.0/0,address:::/0 protocol:udp,ports:all,address:0.0.0.0/0,address:::/0"

firewalls_json="$(doctl compute firewall list --output json)"
firewall_count="$(
	jq -r --arg name "$DO_FIREWALL_NAME" '[.[] | select(.name == $name)] | length' <<< "$firewalls_json"
)"

if [ "$firewall_count" -gt 1 ]; then
	echo "Found multiple DigitalOcean Firewalls named ${DO_FIREWALL_NAME}" >&2
	exit 1
fi

if [ "$firewall_count" -eq 1 ]; then
	firewall_id="$(jq -r --arg name "$DO_FIREWALL_NAME" '.[] | select(.name == $name) | .id' <<< "$firewalls_json")"
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

echo "Firewall ${DO_FIREWALL_NAME} allows SSH on port 22."
