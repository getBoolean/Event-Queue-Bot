#!/usr/bin/env node

import { appendFileSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const API_BASE = "https://api.digitalocean.com/v2";
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "..");

const requiredEnv = {
	DIGITALOCEAN_TOKEN: process.env.DIGITALOCEAN_TOKEN,
	BOT_SSH_PUBLIC_KEY: process.env.BOT_SSH_PUBLIC_KEY,
};

for (const [name, value] of Object.entries(requiredEnv)) {
	if (!value?.trim()) {
		throw new Error(`${name} is required`);
	}
}

const token = requiredEnv.DIGITALOCEAN_TOKEN;
const publicKey = requiredEnv.BOT_SSH_PUBLIC_KEY.trim();
const dropletName = env("DO_DROPLET_NAME", "event-queue-bot");
const sshKeyName = env("DO_SSH_KEY_NAME", `${dropletName}-deploy`);
const firewallName = env("DO_FIREWALL_NAME", `${dropletName}-ssh`);
const tagName = env("DO_TAG", dropletName);
const appPath = env("APP_PATH", "/opt/event-queue-bot");

const config = {
	region: env("DO_REGION", "nyc3"),
	size: env("DO_SIZE", "s-1vcpu-1gb"),
	image: env("DO_IMAGE", "ubuntu-24-04-x64"),
	enableBackups: parseBoolean(env("DO_ENABLE_BACKUPS", "false")),
};

const output = {};

await main();

async function main() {
	console.log(`Provisioning DigitalOcean resources for ${dropletName}`);

	await ensureTag(tagName);
	const sshKey = await ensureSshKey();
	const userData = renderCloudInit();
	const droplet = await ensureDroplet(sshKey, userData);
	await tagResource(tagName, droplet.id, "droplet");
	await ensureFirewall(droplet.id);

	const activeDroplet = await waitForDroplet(droplet.id);
	const ip = getPublicIpv4(activeDroplet);
	if (!ip) {
		throw new Error(`Droplet ${dropletName} is active but has no public IPv4 address`);
	}

	setOutput("bot_host", ip);
	setOutput("droplet_id", activeDroplet.id);

	console.log(`Droplet ready: ${dropletName} (${ip})`);
}

async function ensureSshKey() {
	const keys = await listAll("/account/keys?per_page=200", "ssh_keys");
	const matchingPublicKey = keys.find((key) => key.public_key?.trim() === publicKey);
	if (matchingPublicKey) {
		console.log(`Reusing SSH key ${matchingPublicKey.name}`);
		return matchingPublicKey;
	}

	const matchingName = keys.find((key) => key.name === sshKeyName);
	if (matchingName) {
		throw new Error(
			`DigitalOcean SSH key "${sshKeyName}" already exists with a different public key. ` +
			"Update BOT_SSH_PUBLIC_KEY or choose a different DO_SSH_KEY_NAME.",
		);
	}

	console.log(`Creating SSH key ${sshKeyName}`);
	const response = await request("POST", "/account/keys", {
		name: sshKeyName,
		public_key: publicKey,
	});

	return response.ssh_key;
}

async function ensureDroplet(sshKey, userData) {
	const droplets = await listAll("/droplets?per_page=200", "droplets");
	const matches = droplets.filter((droplet) => droplet.name === dropletName);

	if (matches.length > 1) {
		throw new Error(`Found multiple DigitalOcean Droplets named "${dropletName}"`);
	}

	if (matches.length === 1) {
		console.log(`Reusing Droplet ${dropletName}`);
		return matches[0];
	}

	console.log(`Creating Droplet ${dropletName}`);
	const response = await request("POST", "/droplets", {
		name: dropletName,
		region: config.region,
		size: config.size,
		image: config.image,
		backups: config.enableBackups,
		ipv6: true,
		monitoring: true,
		ssh_keys: [sshKey.fingerprint ?? sshKey.id],
		tags: [tagName],
		user_data: userData,
	});

	return response.droplet;
}

async function ensureFirewall(dropletId) {
	const body = {
		name: firewallName,
		inbound_rules: [
			{
				protocol: "tcp",
				ports: "22",
				sources: { addresses: ["0.0.0.0/0", "::/0"] },
			},
		],
		outbound_rules: [
			{
				protocol: "tcp",
				ports: "1-65535",
				destinations: { addresses: ["0.0.0.0/0", "::/0"] },
			},
			{
				protocol: "udp",
				ports: "1-65535",
				destinations: { addresses: ["0.0.0.0/0", "::/0"] },
			},
			{
				protocol: "icmp",
				destinations: { addresses: ["0.0.0.0/0", "::/0"] },
			},
		],
		droplet_ids: [dropletId],
		tags: [],
	};

	const firewalls = await listAll("/firewalls?per_page=200", "firewalls");
	const matches = firewalls.filter((firewall) => firewall.name === firewallName);

	if (matches.length > 1) {
		throw new Error(`Found multiple DigitalOcean Firewalls named "${firewallName}"`);
	}

	if (matches.length === 0) {
		console.log(`Creating Firewall ${firewallName}`);
		await request("POST", "/firewalls", body);
		return;
	}

	console.log(`Updating Firewall ${firewallName}`);
	await request("PUT", `/firewalls/${matches[0].id}`, body);
}

async function ensureTag(name) {
	try {
		await request("GET", `/tags/${encodeURIComponent(name)}`);
		console.log(`Reusing tag ${name}`);
	} catch (error) {
		if (error.status !== 404) {
			throw error;
		}

		console.log(`Creating tag ${name}`);
		await request("POST", "/tags", { name });
	}
}

async function tagResource(tag, resourceId, resourceType) {
	await request("POST", `/tags/${encodeURIComponent(tag)}/resources`, {
		resources: [{ resource_id: String(resourceId), resource_type: resourceType }],
	});
}

async function waitForDroplet(id) {
	const timeoutMs = 10 * 60 * 1000;
	const startedAt = Date.now();

	while (Date.now() - startedAt < timeoutMs) {
		const response = await request("GET", `/droplets/${id}`);
		const droplet = response.droplet;

		if (droplet.status === "active" && getPublicIpv4(droplet)) {
			return droplet;
		}

		console.log(`Waiting for Droplet ${dropletName} to become active...`);
		await sleep(10_000);
	}

	throw new Error(`Timed out waiting for Droplet ${dropletName}`);
}

async function listAll(path, key) {
	const items = [];
	let next = path;

	while (next) {
		const page = await request("GET", next);
		items.push(...(page[key] ?? []));
		next = page.links?.pages?.next ?? null;
	}

	return items;
}

async function request(method, pathOrUrl, body) {
	const url = pathOrUrl.startsWith("http") ? pathOrUrl : `${API_BASE}${pathOrUrl}`;
	const response = await fetch(url, {
		method,
		headers: {
			Authorization: `Bearer ${token}`,
			"Content-Type": "application/json",
		},
		body: body == null ? undefined : JSON.stringify(body),
	});

	const text = await response.text();
	const data = text ? JSON.parse(text) : {};

	if (!response.ok) {
		const message = data.message ?? data.id ?? text ?? response.statusText;
		const error = new Error(`DigitalOcean API ${method} ${url} failed: ${message}`);
		error.status = response.status;
		error.data = data;
		throw error;
	}

	return data;
}

function renderCloudInit() {
	const templatePath = resolve(REPO_ROOT, "infra/digitalocean/cloud-init.yml");
	const template = readFileSync(templatePath, "utf8");

	return template
		.replaceAll("{{SSH_PUBLIC_KEY_JSON}}", JSON.stringify(publicKey))
		.replaceAll("{{APP_PATH_SHELL}}", shellQuote(appPath))
		.replaceAll("{{APP_PATH}}", appPath);
}

function getPublicIpv4(droplet) {
	return droplet.networks?.v4?.find((network) => network.type === "public")?.ip_address ?? null;
}

function env(name, fallback) {
	return process.env[name]?.trim() || fallback;
}

function parseBoolean(value) {
	return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function shellQuote(value) {
	return `'${value.replaceAll("'", "'\\''")}'`;
}

function setOutput(name, value) {
	output[name] = value;

	if (process.env.GITHUB_OUTPUT) {
		appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
	}
}

function sleep(ms) {
	return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}
