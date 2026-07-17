#!/bin/bash
# ──────────────────────────────────────────────────────────────────────────────
# EC2 Server Setup Script for GAMH Backend
# Run this ONCE on your EC2 instance (Ubuntu 22.04 / Amazon Linux 2023)
# Usage: chmod +x scripts/ec2-setup.sh && sudo ./scripts/ec2-setup.sh
# ──────────────────────────────────────────────────────────────────────────────

set -euo pipefail

DOMAIN="api.gamh.in"
APP_DIR="/opt/gamh-backend"
APP_USER="gamh"

echo "═══════════════════════════════════════════════════════════════════"
echo "  GAMH Backend – EC2 Server Setup"
echo "═══════════════════════════════════════════════════════════════════"

# ─── 1. System updates ───────────────────────────────────────────────────────
echo "[1/8] Updating system packages..."
apt-get update -y && apt-get upgrade -y

# ─── 2. Install Node.js 20 ───────────────────────────────────────────────────
echo "[2/8] Installing Node.js 20..."
if ! command -v node &>/dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
echo "  Node: $(node --version)  npm: $(npm --version)"

# ─── 3. Install Nginx ────────────────────────────────────────────────────────
echo "[3/8] Installing Nginx..."
apt-get install -y nginx
systemctl enable nginx

# ─── 4. Install Certbot (for Let's Encrypt SSL) ──────────────────────────────
echo "[4/8] Installing Certbot..."
apt-get install -y certbot python3-certbot-nginx

# ─── 5. Create app user & directory ──────────────────────────────────────────
echo "[5/8] Creating application user and directory..."
id -u "$APP_USER" &>/dev/null || useradd --system --shell /bin/false "$APP_USER"
mkdir -p "$APP_DIR/uploads"
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

# ─── 6. Setup Nginx config ───────────────────────────────────────────────────
echo "[6/8] Configuring Nginx..."
cat > /etc/nginx/sites-available/"$DOMAIN" <<'NGINX_CONF'
# Temporary HTTP-only config for Certbot validation
server {
    listen 80;
    server_name api.gamh.in;

    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        client_max_body_size 20M;
    }
}
NGINX_CONF

ln -sf /etc/nginx/sites-available/"$DOMAIN" /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

# ─── 7. Get SSL certificate ──────────────────────────────────────────────────
echo "[7/8] Obtaining SSL certificate from Let's Encrypt..."
echo ""
echo "  ⚠  IMPORTANT: Before running this step, make sure:"
echo "     1. DNS A record for '$DOMAIN' points to this server's IP"
echo "     2. Port 80 and 443 are open in your security group"
echo ""
read -p "  Press Enter when DNS is configured, or Ctrl+C to skip SSL for now..."

certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos \
  --email admin@gamh.in --redirect

# ─── 8. Create systemd service ───────────────────────────────────────────────
echo "[8/8] Creating systemd service..."
cat > /etc/systemd/system/gamh-backend.service <<EOF
[Unit]
Description=GAMH Backend API
After=network.target

[Service]
Type=simple
User=$APP_USER
WorkingDirectory=$APP_DIR
EnvironmentFile=$APP_DIR/.env
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=gamh-backend

# Security hardening
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=$APP_DIR/uploads

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable gamh-backend

echo ""
echo "═══════════════════════════════════════════════════════════════════"
echo "  ✅  Setup complete!"
echo ""
echo "  Next steps:"
echo "    1. Copy your app code to $APP_DIR"
echo "    2. Copy .env.production to $APP_DIR/.env"
echo "    3. cd $APP_DIR && npm ci --omit=dev"
echo "    4. sudo systemctl start gamh-backend"
echo "    5. sudo systemctl status gamh-backend"
echo ""
echo "  Your API will be live at: https://$DOMAIN"
echo "═══════════════════════════════════════════════════════════════════"
