# Deploying Shayanomaly to DigitalOcean + Namecheap

## Architecture

```
[Browser] ──HTTPS──▸ [Nginx :443] ──▸ [Next.js :3000]
                         │                   │
                         │ /ws               │ /api/* (proxy)
                         ▼                   ▼
                   [Backend WS :8080]  [Backend HTTP :8081]
                         │
                   [SQLite / Prisma]
```

---

## 1. Create a DigitalOcean Droplet

1. Go to **DigitalOcean > Create > Droplets**
2. Choose **Ubuntu 24.04 LTS**
3. Plan: **Basic $6/mo** (1 vCPU, 1 GB RAM) — enough for MVP
4. Region: pick the closest to your users
5. Auth: **SSH key** (recommended) or password
6. Create the droplet and note its **public IP address**

---

## 2. Point Your Namecheap Domain

1. Log into **Namecheap > Domain List > Manage**
2. Go to **Advanced DNS**
3. Add these records:

| Type  | Host | Value              | TTL  |
|-------|------|--------------------|------|
| A     | @    | `YOUR_DROPLET_IP`  | Auto |
| A     | www  | `YOUR_DROPLET_IP`  | Auto |

4. Wait 5–30 minutes for DNS propagation. Verify with:
```bash
dig +short yourdomain.com
```

---

## 3. Server Setup (SSH into Droplet)

```bash
ssh root@YOUR_DROPLET_IP

# Update system
apt update && apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com | sh
apt install docker-compose-plugin -y

# Install Nginx + Certbot
apt install nginx certbot python3-certbot-nginx -y

# Create project directory
mkdir -p /opt/shayanomaly
```

---

## 4. Upload Your Code

From your local machine:
```bash
# Option A: Git (recommended)
# Push to GitHub/GitLab, then on the server:
cd /opt/shayanomaly
git clone https://github.com/YOUR_USER/YOUR_REPO.git .

# Option B: Direct upload via rsync
rsync -avz --exclude node_modules --exclude .next --exclude '*.db' \
  /path/to/web3-terminal/ root@YOUR_DROPLET_IP:/opt/shayanomaly/
```

---

## 5. Configure Environment Variables

### Frontend (.env.local)
```bash
cd /opt/shayanomaly
cp .env.example .env.local
nano .env.local
```

Set these values:
```env
NEXT_PUBLIC_WC_PROJECT_ID=your_real_walletconnect_id
NEXT_PUBLIC_WS_URL=wss://yourdomain.com/ws
NEXT_PUBLIC_APP_URL=https://yourdomain.com
BACKEND_HTTP_URL=http://backend:8081
```

### Backend (.env)
```bash
cd /opt/shayanomaly/backend
cp .env.example .env
nano .env
```

Set these values:
```env
HTTP_PORT=8081
WS_PORT=8080
ALLOWED_ORIGINS=https://yourdomain.com
BINANCE_API_KEY=your_real_key
BINANCE_SECRET=your_real_secret
ETH_PRIVATE_KEY=your_real_key
ETH_RPC_URL=https://eth.llamarpc.com
DATABASE_URL=file:./data/prod.db
```

### Get a WalletConnect Project ID
1. Go to https://cloud.walletconnect.com
2. Sign up → Create New Project
3. Copy the **Project ID**

---

## 6. Configure Nginx

```bash
# Copy the provided config
cp /opt/shayanomaly/nginx/nginx.conf /etc/nginx/sites-available/shayanomaly

# Replace "yourdomain.com" with your actual domain
sed -i 's/yourdomain.com/YOUR_ACTUAL_DOMAIN/g' /etc/nginx/sites-available/shayanomaly

# Enable the site
ln -sf /etc/nginx/sites-available/shayanomaly /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Get SSL certificate (temporarily comment out the ssl server block first)
# Edit to only have the port 80 block, then:
certbot --nginx -d yourdomain.com -d www.yourdomain.com

# Test and reload
nginx -t
systemctl reload nginx
```

**Certbot auto-renewal** is set up automatically via systemd timer.

---

## 7. Build & Start with Docker

```bash
cd /opt/shayanomaly

# Create a .env file for docker-compose build args
cat > .env <<EOF
NEXT_PUBLIC_WC_PROJECT_ID=your_walletconnect_project_id
NEXT_PUBLIC_WS_URL=wss://yourdomain.com/ws
NEXT_PUBLIC_APP_URL=https://yourdomain.com
EOF

# Build and start
docker compose up -d --build

# Check status
docker compose ps
docker compose logs -f
```

---

## 8. Verify Everything Works

```bash
# Health check
curl https://yourdomain.com/api/health

# Check backend directly
curl http://localhost:8081/health

# Check WebSocket (use wscat)
npx wscat -c wss://yourdomain.com/ws
```

Visit `https://yourdomain.com` in your browser.

---

## Maintenance

### View logs
```bash
docker compose logs -f frontend
docker compose logs -f backend
```

### Restart
```bash
docker compose restart
```

### Update code
```bash
cd /opt/shayanomaly
git pull
docker compose up -d --build
```

### Renew SSL (auto, but manual if needed)
```bash
certbot renew --dry-run
```

### Backup database
```bash
docker compose exec backend cp /app/data/prod.db /app/data/backup-$(date +%Y%m%d).db
```

---

## Cost Estimate (DigitalOcean)

| Resource        | Cost      |
|-----------------|-----------|
| Droplet (1GB)   | $6/mo     |
| Domain (Namecheap) | ~$10/yr |
| SSL (Let's Encrypt) | Free  |
| **Total**       | **~$7/mo** |

With student credits, this is effectively **free** for a long time.

---

## Security Checklist

- [ ] Never commit `.env` or `.env.local` files
- [ ] Use a strong SSH key, disable password auth
- [ ] Set up UFW firewall: `ufw allow 22,80,443/tcp && ufw enable`
- [ ] Get a real WalletConnect project ID
- [ ] Use a dedicated RPC endpoint (Infura/Alchemy) for production
- [ ] Never put real funds in the trading wallet until thoroughly tested
- [ ] Set up DigitalOcean monitoring alerts

---

## Optional Upgrades

- **PostgreSQL**: Replace SQLite with a managed DB for multi-instance scaling
- **Redis**: Add for caching and rate limit state sharing
- **GitHub Actions**: CI/CD pipeline for auto-deploy on push
- **Cloudflare**: Free CDN + DDoS protection in front of your Droplet
