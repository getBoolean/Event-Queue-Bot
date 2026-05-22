provider "digitalocean" {
  token = var.do_token
}

locals {
  droplet_name = "event-queue-bot"
}

resource "digitalocean_ssh_key" "deploy" {
  name       = "${local.droplet_name}-deploy"
  public_key = var.ssh_public_key
}

resource "digitalocean_droplet" "bot" {
  name     = local.droplet_name
  region   = var.region
  size     = var.size
  image    = var.image
  backups  = var.enable_backups
  ssh_keys = [digitalocean_ssh_key.deploy.id]

  user_data = templatefile("${path.module}/cloud-init.yml.tftpl", {
    ssh_public_key = var.ssh_public_key
    repo_url       = var.repo_url
    branch         = var.branch
    app_path       = var.app_path
  })
}

resource "digitalocean_firewall" "bot" {
  name = "${local.droplet_name}-ssh"

  droplet_ids = [digitalocean_droplet.bot.id]

  inbound_rule {
    protocol         = "tcp"
    port_range       = "22"
    source_addresses = ["0.0.0.0/0", "::/0"]
  }

  outbound_rule {
    protocol              = "tcp"
    port_range            = "1-65535"
    destination_addresses = ["0.0.0.0/0", "::/0"]
  }

  outbound_rule {
    protocol              = "udp"
    port_range            = "1-65535"
    destination_addresses = ["0.0.0.0/0", "::/0"]
  }

  outbound_rule {
    protocol              = "icmp"
    destination_addresses = ["0.0.0.0/0", "::/0"]
  }
}

