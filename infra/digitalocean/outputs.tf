output "bot_host" {
  description = "Public IPv4 address for GitHub Actions BOT_HOST."
  value       = digitalocean_droplet.bot.ipv4_address
}

output "deploy_user" {
  description = "SSH user created by cloud-init."
  value       = "deploy"
}

output "app_path" {
  description = "Server path containing the bot repository, .env, data, and logs."
  value       = var.app_path
}

