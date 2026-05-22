variable "do_token" {
  description = "DigitalOcean API token. Prefer setting DIGITALOCEAN_TOKEN in the environment instead of passing this value."
  type        = string
  default     = null
  sensitive   = true
}

variable "ssh_public_key" {
  description = "Public SSH key authorized for the deploy user and registered on the Droplet."
  type        = string
  sensitive   = true
}

variable "region" {
  description = "DigitalOcean region for the bot Droplet."
  type        = string
  default     = "nyc3"
}

variable "size" {
  description = "DigitalOcean Droplet size slug."
  type        = string
  default     = "s-1vcpu-1gb"
}

variable "image" {
  description = "DigitalOcean Ubuntu image slug."
  type        = string
  default     = "ubuntu-24-04-x64"
}

variable "repo_url" {
  description = "Git repository cloned onto the Droplet."
  type        = string
  default     = "https://github.com/getBoolean/Event-Queue-Bot.git"
}

variable "branch" {
  description = "Git branch deployed by default."
  type        = string
  default     = "master"
}

variable "app_path" {
  description = "Absolute path where the bot repository and persistent data live."
  type        = string
  default     = "/opt/event-queue-bot"
}

variable "enable_backups" {
  description = "Enable paid DigitalOcean Droplet backups."
  type        = bool
  default     = false
}

