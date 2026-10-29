#!/usr/bin/env bash
set -euo pipefail

echo "============================================================"
echo " VIDI X Emulator — Automated Ubuntu Server Setup"
echo " Domain: marinbrusic.from.hr/vidix-emulator"
echo "============================================================"

# 1. Install system packages (git, curl, nginx, ufw)
echo "[1/6] Installing system packages (git, curl, nginx, ufw)..."
sudo apt-get update -y
sudo apt-get upgrade -y
sudo apt-get install -y git curl ca-certificates nginx ufw

# 2. Install Node.js 22 LTS if not already installed
if ! command -v node >/dev/null 2>&1 || [[ "$(node -v | cut -d. -f1 | tr -d 'v')" -lt 20 ]]; then
  echo "[2/6] Installing Node.js 22 LTS..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
else
  echo "[2/6] Node.js $(node -v) already installed."
fi

# 3. Ensure we are in the repo directory and on the right branch, then build
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "[3/6] Fetching latest code and building production bundle..."
git fetch origin
git checkout arena/92418b6e-vidi-x-emulator
git pull origin arena/92418b6e-vidi-x-emulator

npm install --legacy-peer-deps
npm run build

# 4. Copy static build into /var/www/html/vidix-emulator
echo "[4/6] Deploying static bundle to /var/www/html/vidix-emulator..."
sudo mkdir -p /var/www/html/vidix-emulator
sudo rm -rf /var/www/html/vidix-emulator/*
sudo cp -r "$SCRIPT_DIR/dist/"* /var/www/html/vidix-emulator/

if [ ! -f /var/www/html/index.html ] || grep -q "Welcome to nginx" /var/www/html/index.html 2>/dev/null; then
  sudo tee /var/www/html/index.html > /dev/null << 'EOF'
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Marin Brusić</title>
  <style>
    body { background: #141416; color: #e4e4e7; font-family: monospace; padding: 40px; }
    a { color: #e4e4e7; border: 1px solid #52525b; padding: 8px 14px; text-decoration: none; display: inline-block; margin-top: 12px; }
    a:hover { background: #27272a; }
  </style>
</head>
<body>
  <h1>marinbrusic.from.hr</h1>
  <p>Projects:</p>
  <a href="/vidix-emulator/">Open VIDI X Emulator &rarr;</a>
</body>
</html>
EOF
fi

sudo chown -R www-data:www-data /var/www/html
sudo chmod -R 755 /var/www/html

# 5. Configure Nginx for / and /vidix-emulator/
echo "[5/6] Configuring Nginx..."
sudo tee /etc/nginx/sites-available/default > /dev/null << 'EOF'
server {
    listen 80 default_server;
    listen [::]:80 default_server;

    server_name marinbrusic.from.hr www.marinbrusic.from.hr _;
    root /var/www/html;
    index index.html;

    gzip on;
    gzip_types text/plain text/css application/javascript application/json image/svg+xml;

    location = /vidix-emulator {
        return 301 /vidix-emulator/;
    }

    location /vidix-emulator/ {
        try_files $uri $uri/ /vidix-emulator/index.html;
    }

    location / {
        try_files $uri $uri/ =404;
    }
}
EOF

sudo nginx -t
sudo systemctl enable --now nginx
sudo systemctl restart nginx

# 6. Enable UFW firewall (allow SSH on 22 if OpenSSH is currently being used for setup)
echo "[6/6] Configuring UFW firewall..."
sudo ufw default deny incoming
sudo ufw default allow outgoing
if systemctl is-active --quiet ssh || systemctl is-active --quiet sshd; then
  sudo ufw allow 22/tcp
fi
sudo ufw --force enable

echo "============================================================"
echo " DONE! VIDI X Emulator is built and running on port 80."
echo " Local test: curl -I http://localhost/vidix-emulator/"
echo " Next step: Run your Cloudflare Tunnel install command."
echo "============================================================"
