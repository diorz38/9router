# Complete Production Deployment Guide: 9Router on Linux VPS (Native Node.js)

This document is an exhaustive, production-grade deployment guide for running **9Router** natively (without Docker) on a Linux VPS (Ubuntu 22.04/24.04 LTS or Debian 11/12). It includes all required configuration files, security hardening, rate limiting, and automated service management.

---

## Architecture Overview

```
                      Internet Client
                             │
                             ▼
     ┌──────────────────────────────────────────────┐
     │ 1. UFW Firewall & Fail2ban (Kernel/Iptables) │
     │    • Port 80 (HTTP), 443 (HTTPS), 22 (SSH)   │
     │    • Port 20228 BLOCKED from public access   │
     │    • Automated IP jail for repeat abusers   │
     └───────────────────────┬──────────────────────┘
                             │
                             ▼
     ┌──────────────────────────────────────────────┐
     │ 2. Nginx Reverse Proxy (SSL + Rate Limiter)  │
     │    • Let's Encrypt TLS 1.3                   │
     │    • In-memory rate limits (RPS/RPM)         │
     │    • Connection limits (Slowloris defense)   │
     │    • OpenAI-compatible 429 JSON response     │
     │    • Buffering OFF for SSE AI streaming      │
     └───────────────────────┬──────────────────────┘
                             │ http://127.0.0.1:20228
                             ▼
     ┌──────────────────────────────────────────────┐
     │ 3. 9Router Node.js Application (Systemd)     │
     │    • Managed via systemd service             │
     │    • Auto-restart on failure & boot          │
     │    • Isolated service user (ninerouter)      │
     │    • SQLite database in /var/lib/9router     │
     │    • Per-key model gating & token quotas     │
     └──────────────────────────────────────────────┘
```

---

## Table of Contents
1. [VPS Sizing & Initial Setup](#1-vps-sizing--initial-setup)
2. [Install System Dependencies](#2-install-system-dependencies)
3. [Create Dedicated Service User & Directories](#3-create-dedicated-service-user--directories)
4. [Clone, Configure, and Build 9Router](#4-clone-configure-and-build-9router)
5. [File 1: Production Environment File (`.env`)](#5-file-1-production-environment-file-env)
6. [File 2: Systemd Service (`9router.service`)](#6-file-2-systemd-service-9routerservice)
7. [File 3: Nginx Reverse Proxy & Rate Limiting (`9router.conf`)](#7-file-3-nginx-reverse-proxy--rate-limiting-9routerconf)
8. [File 4 & 5: Fail2ban IP Jail Configuration](#8-file-4--5-fail2ban-ip-jail-configuration)
9. [File 6: Logrotate Configuration](#9-file-6-logrotate-configuration)
10. [Obtain Free SSL Certificate (HTTPS)](#10-obtain-free-ssl-certificate-https)
11. [Verification & Load Testing](#11-verification--load-testing)
12. [Maintenance, Backup & Updates](#12-maintenance-backup--updates)

---

## 1. VPS Sizing & Initial Setup

### Requirements:
* **Operating System:** Ubuntu 22.04 LTS / 24.04 LTS or Debian 11 / 12.
* **Hardware:** Minimum 1 vCPU, 1 GB RAM (with 2 GB Swap). Recommended: 2 vCPU, 2 GB+ RAM.
* **Domain Name:** An A record pointing to your VPS public IP (e.g. `router.yourdomain.com`).

Connect to your server via SSH:
```bash
ssh root@YOUR_SERVER_IP
```

### 1.1 Configure Swap Memory (Mandatory for 1–2 GB RAM VPS)
Compiling the Next.js production build requires temporary memory. Without swap, low-RAM VPS processes will get killed by the Linux OOM (Out Of Memory) killer.

```bash
# Verify if swap exists
swapon --show

# Create 2GB swap if none exists
fallocate -l 2G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile

# Make swap persistent across reboots
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

### 1.2 Firewall Setup (UFW)
Only open SSH and web traffic. **Never** open port `20228` directly to the public:
```bash
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
```

---

## 2. Install System Dependencies

Install Node.js 20 LTS, Nginx, Certbot, Fail2ban, and build tools:

```bash
# Update package indices
apt update && apt upgrade -y

# Install build tools & utilities
apt install -y curl wget git build-essential ufw fail2ban logrotate sqlite3

# Install Node.js 20 LTS via NodeSource
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Verify Node and npm
node -v   # Should be v20.x or higher
npm -v

# Install Nginx and Certbot
apt install -y nginx certbot python3-certbot-nginx
```

---

## 3. Create Dedicated Service User & Directories

For security, the application should run under its own unprivileged system user (`ninerouter`), not as `root`.

```bash
# Create system user and group without shell login
useradd -r -s /bin/false -d /opt/9router ninerouter

# Create app directory and data directory
mkdir -p /opt/9router
mkdir -p /var/lib/9router/db
mkdir -p /var/log/9router

# Set ownership
chown -R ninerouter:ninerouter /opt/9router
chown -R ninerouter:ninerouter /var/lib/9router
chown -R ninerouter:ninerouter /var/log/9router

# Lock down permissions on the SQLite database directory (mode 700)
chmod 700 /var/lib/9router
```

---

## 4. Clone, Configure, and Build 9Router

```bash
# Clone the repository
cd /opt
git clone https://github.com/diorz38/9router.git /opt/9router
cd /opt/9router

# Install npm dependencies
npm install

# Build the Next.js production bundle
npm run build
```

---

## 5. File 1: Production Environment File (`.env`)

Generate random cryptographic secrets using `openssl`:
```bash
openssl rand -hex 32   # Use output for JWT_SECRET
openssl rand -hex 32   # Use output for API_KEY_SECRET
openssl rand -hex 16   # Use output for MACHINE_ID_SALT
```

Create `/opt/9router/.env`:
```bash
nano /opt/9router/.env
```

Paste the following template and replace placeholder values:

```dotenv
# ==============================================================================
# 9Router Production Environment Configuration
# File: /opt/9router/.env
# ==============================================================================

# ----------------- SECURITY & AUTHENTICATION (MANDATORY) -----------------
# 64-character random string from openssl rand -hex 32
JWT_SECRET=replace_with_64_character_hex_string_from_openssl

# Strong dashboard password for administrator login
INITIAL_PASSWORD=YourUltraSecurePassword2026!

# Cryptographic salt for client API key generation
API_KEY_SECRET=replace_with_another_64_character_hex_string
MACHINE_ID_SALT=replace_with_32_character_hex_string

# Set cookie security to true when running behind HTTPS/SSL
AUTH_COOKIE_SECURE=true

# Require API keys for inference calls
REQUIRE_API_KEY=true

# ----------------- RUNTIME SETTINGS -----------------
NODE_ENV=production
PORT=20228
USER_PORT=20229
HOSTNAME=127.0.0.1
DATA_DIR=/var/lib/9router
ENABLE_REQUEST_LOGS=true
OBSERVABILITY_ENABLED=true

# ----------------- BASE URL CONFIGURATION -----------------
# Internal server loopback
BASE_URL=http://127.0.0.1:20228

# Public URL (replace router.yourdomain.com with your actual domain)
NEXT_PUBLIC_BASE_URL=https://router.yourdomain.com
```

Lock down file permissions so only `ninerouter` and `root` can read the secrets:
```bash
chown ninerouter:ninerouter /opt/9router/.env
chmod 600 /opt/9router/.env
```

---

## 6. File 2: Systemd Service (`9router.service`)

Create the systemd service file to handle auto-starting on boot, graceful restarts, and background management.

Create `/etc/systemd/system/9router.service`:
```bash
nano /etc/systemd/system/9router.service
```

Paste the following configuration:

```ini
[Unit]
Description=9Router AI Gateway Production Service
Documentation=https://github.com/diorz38/9router
After=network.target

[Service]
Type=simple
User=ninerouter
Group=ninerouter
WorkingDirectory=/opt/9router
EnvironmentFile=/opt/9router/.env

# Execute production wrapper
ExecStart=/usr/bin/node custom-server.js

# Restart policy
Restart=always
RestartSec=5s

# Logging
StandardOutput=append:/var/log/9router/access.log
StandardError=append:/var/log/9router/error.log
SyslogIdentifier=9router

# Security Hardening Sandbox
NoNewPrivileges=true
ProtectSystem=full
ProtectHome=true
PrivateTmp=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true

# File descriptor limits (high concurrency support)
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
```

Enable and start the service:
```bash
systemctl daemon-reload
systemctl enable 9router
systemctl start 9router

# Verify status
systemctl status 9router
```

---

## 7. File 3: Nginx Reverse Proxy & Rate Limiting (`9router.conf`)

This configuration sets up:
* In-memory rate limiting zones (20 req/s on API, 5 req/min on login).
* Connection limits to block Slowloris attacks.
* Custom OpenAI-compatible HTTP 429 JSON response.
* SSE (Server-Sent Events) buffering disabled for real-time AI token streaming.

Create `/etc/nginx/sites-available/9router.conf`:
```bash
nano /etc/nginx/sites-available/9router.conf
```

Paste the configuration:

```nginx
# ==============================================================================
# 9Router Nginx Reverse Proxy & Multi-Tier Rate Limiting
# File: /etc/nginx/sites-available/9router.conf
# ==============================================================================

# WebSocket upgrade map
map $http_upgrade $connection_upgrade {
    default upgrade;
    '' close;
}

# 1. Rate Limiting Zones (Allocates 10MB memory per zone = ~160,000 unique IPs)
# Global API rate limit per client IP (20 requests per second)
limit_req_zone $binary_remote_addr zone=api_ip_limit:10m rate=20r/s;

# Per-API-key rate limit (if client sends Authorization Bearer)
limit_req_zone $http_authorization zone=api_key_limit:10m rate=30r/s;

# Strict rate limit for dashboard login (5 requests per minute per IP)
limit_req_zone $binary_remote_addr zone=login_limit:10m rate=5r/m;

# Connection limit zone (Max 20 concurrent open TCP connections per IP)
limit_conn_zone $binary_remote_addr zone=conn_limit:10m;

server {
    listen 80;
    listen [::]:80;
    server_name router.yourdomain.com; # <-- Replace with your domain

    # Allow Let's Encrypt ACME verification
    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    # Redirect all HTTP to HTTPS
    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name router.yourdomain.com; # <-- Replace with your domain

    # SSL Certificate paths (Configured automatically by Certbot)
    # ssl_certificate /etc/letsencrypt/live/router.yourdomain.com/fullchain.pem;
    # ssl_certificate_key /etc/letsencrypt/live/router.yourdomain.com/privkey.pem;

    # SSL Security parameters
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;

    # Maximum upload size (supports image/audio uploads for multimodal LLMs)
    client_max_body_size 50M;

    # Concurrent connection limit per IP
    limit_conn conn_limit 20;

    # Use HTTP 429 status code for rate limit rejection
    limit_req_status 429;

    # Custom OpenAI-compatible 429 JSON response
    error_page 429 = @rate_limited;
    location @rate_limited {
        default_type application/json;
        return 429 '{"error":{"message":"Too many requests. Rate limit exceeded.","type":"requests","code":"rate_limit_exceeded"}}\n';
    }

    # Security Headers
    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options SAMEORIGIN always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;

    # ----------------- 1. Protect Dashboard Login Route -----------------
    location /api/auth/login {
        limit_req zone=login_limit burst=3 nodelay;

        proxy_pass http://127.0.0.1:20228;
        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # ----------------- 2. Main API & Dashboard Routes -----------------
    location / {
        # Burst allows traffic spikes (up to 40 requests) served immediately
        limit_req zone=api_ip_limit burst=40 nodelay;

        proxy_pass http://127.0.0.1:20228;
        proxy_http_version 1.1;

        # WebSocket support
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;

        # Header forwarding (custom-server.js relies on this for IP verification)
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # CRITICAL FOR AI STREAMING (Server-Sent Events / SSE):
        # Disable proxy buffering so chunks are delivered in real time to clients
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 600s;
        proxy_send_timeout 600s;
        chunked_transfer_encoding on;
    }
}
```

Enable the Nginx site:
```bash
ln -sf /etc/nginx/sites-available/9router.conf /etc/nginx/sites-enabled/
# Remove default site if present
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx
```

---

## 8. File 4 & 5: Fail2ban IP Jail Configuration

Fail2ban monitors Nginx logs. If an IP exceeds rate limits 20 times in 1 minute, Fail2ban temporarily bans that IP in Linux `iptables`, preventing resource exhaustion.

### File 4: Fail2ban Filter Definition
Create `/etc/fail2ban/filter.d/nginx-9router-ratelimit.conf`:
```bash
nano /etc/fail2ban/filter.d/nginx-9router-ratelimit.conf
```

Paste:
```ini
[Definition]
# Matches any request returning HTTP 429
failregex = ^<HOST> -.*"(GET|POST|PUT|DELETE).*" 429
ignoreregex =
```

### File 5: Fail2ban Jail Local Configuration
Create or edit `/etc/fail2ban/jail.local`:
```bash
nano /etc/fail2ban/jail.local
```

Paste:
```ini
[DEFAULT]
bantime = 3600
findtime = 60
maxretry = 5

[sshd]
enabled = true
port = ssh

[nginx-9router-ratelimit]
enabled = true
port = http,https
filter = nginx-9router-ratelimit
logpath = /var/log/nginx/access.log
# If an IP gets 20 rate limit hits within 60 seconds, ban for 1 hour:
maxretry = 20
findtime = 60
bantime = 3600
```

Restart Fail2ban:
```bash
systemctl restart fail2ban
fail2ban-client status nginx-9router-ratelimit
```

---

## 9. File 6: Logrotate Configuration

Prevents log files in `/var/log/9router` from filling up disk space.

Create `/etc/logrotate.d/9router`:
```bash
nano /etc/logrotate.d/9router
```

Paste:
```
/var/log/9router/*.log {
    daily
    missingok
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 ninerouter ninerouter
    sharedscripts
    postrotate
        systemctl kill -s HUP 9router 2>/dev/null || true
    endscript
}
```

Test logrotate:
```bash
logrotate -d /etc/logrotate.d/9router
```

---

## 10. Obtain Free SSL Certificate (HTTPS)

Make sure your DNS A record (e.g. `router.yourdomain.com`) is pointing to your VPS IP before running:

```bash
certbot --nginx -d router.yourdomain.com
```

Certbot will automatically:
1. Verify domain ownership.
2. Generate the Let's Encrypt certificate.
3. Configure the SSL lines in `/etc/nginx/sites-available/9router.conf`.
4. Set up an automatic renewal cron job.

Verify automatic SSL renewal:
```bash
certbot renew --dry-run
```

---

## 11. Verification & Load Testing

### 11.1 Check Running Services
```bash
systemctl status 9router
systemctl status nginx
systemctl status fail2ban
```

### 11.2 Check Dashboard Access
Open your browser to:
```
https://router.yourdomain.com/dashboard
```
Log in using the `INITIAL_PASSWORD` you configured in `/opt/9router/.env`.

### 11.3 Test Rate Limiting
From another terminal or laptop, run a rapid request loop:
```bash
for i in {1..30}; do
  curl -s -o /dev/null -w "%{http_code}\n" https://router.yourdomain.com/v1/models
done
```
* Requests within limit return `401` (Unauthorized / API key required) or `200`.
* Excessive requests will return `429` with the JSON response:
  ```json
  {"error":{"message":"Too many requests. Rate limit exceeded.","type":"requests","code":"rate_limit_exceeded"}}
  ```

---

## 12. Maintenance, Backup & Updates

### Live Database Backup (SQLite)
Run this command anytime without stopping 9Router (safe live copy):
```bash
mkdir -p /opt/backups
sqlite3 /var/lib/9router/db/data.sqlite ".backup '/opt/backups/data_$(date +%F_%H%M%S).sqlite'"
```

To automate daily backups at 3:00 AM, add to `crontab -e`:
```cron
0 3 * * * sqlite3 /var/lib/9router/db/data.sqlite ".backup '/opt/backups/data_\$(date +\%F).sqlite'" && find /opt/backups -type f -mtime +14 -delete
```

### Updating 9Router to Latest Version
```bash
cd /opt/9router
git pull origin extended
npm install
npm run build
systemctl restart 9router
```

### Viewing Real-Time Logs
```bash
# Application error log
tail -f /var/log/9router/error.log

# Application access log
tail -f /var/log/9router/access.log

# Systemd journal
journalctl -u 9router -f
```
