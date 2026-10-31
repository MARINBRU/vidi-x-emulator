#!/usr/bin/env bash
set -euo pipefail

echo "============================================================"
echo " marinbrusic.from.hr — Automated Ubuntu Server Setup"
echo "   • /vidix-emulator  (VIDI X Hardware Emulator)"
echo "   • /localshare      (Local Network File & Text Sharing)"
echo "   • /textshare       (Local Network Text Sharing)"
echo "============================================================"

# Package metadata is time-sensitive; unattended upgrades can also hold apt locks.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/scripts/apt-lock.sh"
source "$SCRIPT_DIR/scripts/system-clock.sh"

# 1. Install system packages (git, curl, nginx, ufw)
echo "[1/8] Installing system packages (git, curl, nginx, ufw)..."
vidix_sync_system_clock
echo "Waiting for automatic updates if the package manager is busy (up to 15 minutes)."
apt_get_with_lock_wait update -y
apt_get_with_lock_wait upgrade -y
apt_get_with_lock_wait install -y git curl ca-certificates nginx ufw

# 2. Install Node.js 22 LTS if not already installed
if ! command -v node >/dev/null 2>&1 || [[ "$(node -v | cut -d. -f1 | tr -d 'v')" -lt 20 ]]; then
  echo "[2/8] Installing Node.js 22 LTS..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  apt_get_with_lock_wait install -y nodejs
else
  echo "[2/8] Node.js $(node -v) already installed."
fi

# 3. Install Cloudflare Tunnel (cloudflared) if not already installed
if ! command -v cloudflared >/dev/null 2>&1; then
  echo "[3/8] Installing Cloudflare Tunnel (cloudflared)..."
  curl -fsSL --output /tmp/cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
  apt_get_with_lock_wait install -y /tmp/cloudflared.deb
  rm -f /tmp/cloudflared.deb
else
  echo "[3/8] cloudflared already installed."
fi

# 4. Fetch latest code and build VIDI X Emulator
cd "$SCRIPT_DIR"

echo "[4/8] Fetching latest code and building production bundle..."
git fetch origin
git checkout arena/92418b6e-vidi-x-emulator
git pull origin arena/92418b6e-vidi-x-emulator

npm install --legacy-peer-deps
npm run build

# 5. Deploy VIDI X Emulator to /var/www/html/vidix-emulator
echo "[5/8] Deploying /vidix-emulator, /localshare, and /textshare static files..."
sudo mkdir -p /var/www/html/vidix-emulator
sudo rm -rf /var/www/html/vidix-emulator/*
sudo cp -r "$SCRIPT_DIR/dist/"* /var/www/html/vidix-emulator/

# Deploy LocalShare static frontend to /var/www/html/localshare
sudo mkdir -p /var/www/html/localshare
sudo cp "$SCRIPT_DIR/localshare/index.html" /var/www/html/localshare/index.html

# Deploy TextShare; it uses the same signaling service as LocalShare.
sudo mkdir -p /var/www/html/textshare
sudo cp "$SCRIPT_DIR"/textshare/{index.html,style.css,app.js} /var/www/html/textshare/

# Update root homepage /var/www/html/index.html
sudo tee /var/www/html/index.html > /dev/null << 'EOF'
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Marin Brusić</title>
  <style>
    body { background: #141416; color: #e4e4e7; font-family: monospace; padding: 40px; }
    .links { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 14px; }
    a { color: #e4e4e7; border: 1px solid #52525b; padding: 10px 16px; text-decoration: none; display: inline-block; background: #1c1c1f; }
    a:hover { background: #27272a; }
  </style>
</head>
<body>
  <h1>marinbrusic.from.hr</h1>
  <p>Projects:</p>
  <div class="links">
    <a href="/vidix-emulator/">VIDI X Emulator &rarr;</a>
    <a href="/localshare/">LocalShare (LAN File Transfer) &rarr;</a>
    <a href="/textshare/">TextShare (LAN Text Sharing) &rarr;</a>
  </div>
</body>
</html>
EOF

sudo chown -R www-data:www-data /var/www/html
sudo chmod -R 755 /var/www/html

# 6. Install and start the sandboxed LocalShare WebSocket signaling service on 127.0.0.1:3080
echo "[6/8] Configuring LocalShare signaling service (127.0.0.1:3080)..."
sudo mkdir -p /opt/localshare
sudo cp "$SCRIPT_DIR/localshare/server.mjs" /opt/localshare/server.mjs
sudo cp "$SCRIPT_DIR/localshare/index.html" /opt/localshare/index.html
sudo chown -R www-data:www-data /opt/localshare
sudo chmod 755 /opt/localshare/server.mjs

NODE_BIN="$(command -v node)"
sudo tee /etc/systemd/system/localshare.service > /dev/null << EOF
[Unit]
Description=LocalShare Zero-Storage LAN Signaling Server
After=network.target

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=/opt/localshare
Environment=LOCALSHARE_HOST=127.0.0.1
Environment=LOCALSHARE_PORT=3080
ExecStart=${NODE_BIN} /opt/localshare/server.mjs
Restart=always
RestartSec=2
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now localshare.service
sudo systemctl restart localshare.service

# 7. Configure Nginx for the home page, emulator, LocalShare, and TextShare.
echo "[7/8] Configuring Nginx..."
sudo tee /etc/nginx/sites-available/default > /dev/null << 'EOF'
server {
    listen 80 default_server;
    listen [::]:80 default_server;

    server_name marinbrusic.from.hr www.marinbrusic.from.hr _;
    root /var/www/html;
    index index.html;

    client_header_buffer_size 64k;
    large_client_header_buffers 8 64k;

    gzip on;
    gzip_types text/plain text/css application/javascript application/json image/svg+xml;

    # 1. VIDI X Emulator (/vidix-emulator)
    location = /vidix-emulator {
        return 301 /vidix-emulator/;
    }

    location /vidix-emulator/ {
        try_files $uri $uri/ /vidix-emulator/index.html;
    }

    # 2. LocalShare (/localshare) + WebSocket signaling (/localshare/ws)
    location = /localshare {
        return 301 /localshare/;
    }

    location = /localshare/ws {
        proxy_pass http://127.0.0.1:3080/localshare/ws;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
        proxy_set_header CF-Connecting-IP $http_cf_connecting_ip;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }

    location /localshare/ {
        try_files $uri $uri/ /localshare/index.html;
    }

    # 3. TextShare (/textshare) uses the same LocalShare relay and rooms.
    location = /textshare {
        return 301 /textshare/;
    }

    location = /textshare/ws {
        proxy_pass http://127.0.0.1:3080/textshare/ws;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
        proxy_set_header CF-Connecting-IP $http_cf_connecting_ip;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }

    location /textshare/ {
        add_header Cache-Control "no-cache";
        try_files $uri $uri/ /textshare/index.html;
    }

    # 4. Root Home Page (/)
    location / {
        try_files $uri $uri/ =404;
    }
}
EOF

sudo nginx -t
sudo systemctl enable --now nginx
sudo systemctl restart nginx

# 8. Ensure UFW firewall remains locked down
echo "[8/8] Verifying UFW firewall..."
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw --force enable

echo "============================================================"
echo " DONE! Apps are deployed:"
echo "   • https://marinbrusic.from.hr/vidix-emulator"
echo "   • https://marinbrusic.from.hr/localshare"
echo "   • https://marinbrusic.from.hr/textshare"
echo "============================================================"
