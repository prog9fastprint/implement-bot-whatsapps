# 07 — Production Deployment

## Deployment Stack

```
Ubuntu VPS
├── Docker + Docker Compose (all services containerized)
├── Nginx (reverse proxy + SSL termination)
├── PM2 or Docker restart policies (process management)
├── Certbot + Let's Encrypt (SSL)
└── Cron (backup jobs)
```

---

## Docker Compose Architecture

```yaml
# docker-compose.yml (production)
services:
  app:           # Node.js Express application
  postgres:      # PostgreSQL 15
  redis:         # Redis 7
  chromadb:      # ChromaDB vector store
  nginx:         # Reverse proxy + SSL
```

---

## Full docker-compose.yml

```yaml
version: '3.9'

services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: whatsapp_bot_app
    restart: always
    env_file: .env
    environment:
      - NODE_ENV=production
      - POSTGRES_HOST=postgres
      - REDIS_HOST=redis
      - CHROMA_HOST=chromadb
    ports:
      - "3000:3000"
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    volumes:
      - ./logs:/app/logs
      - ./knowledge:/app/knowledge  # RAG documents
      - ./temp:/app/temp            # Temporary media files
    networks:
      - bot_network

  postgres:
    image: postgres:15-alpine
    container_name: whatsapp_bot_postgres
    restart: always
    environment:
      POSTGRES_DB: ${POSTGRES_DB}
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./database/init.sql:/docker-entrypoint-initdb.d/init.sql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - bot_network

  redis:
    image: redis:7-alpine
    container_name: whatsapp_bot_redis
    restart: always
    command: redis-server --requirepass ${REDIS_PASSWORD}
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - bot_network

  chromadb:
    image: chromadb/chroma:latest
    container_name: whatsapp_bot_chroma
    restart: always
    volumes:
      - chroma_data:/chroma/chroma
    networks:
      - bot_network

  nginx:
    image: nginx:alpine
    container_name: whatsapp_bot_nginx
    restart: always
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/conf.d/default.conf
      - /etc/letsencrypt:/etc/letsencrypt:ro
    depends_on:
      - app
    networks:
      - bot_network

volumes:
  postgres_data:
  redis_data:
  chroma_data:

networks:
  bot_network:
    driver: bridge
```

---

## Dockerfile

```dockerfile
FROM node:20-alpine

# Install ffmpeg for audio processing
RUN apk add --no-cache ffmpeg

WORKDIR /app

# Copy package files first for layer caching
COPY package*.json ./
RUN npm ci --only=production

# Copy source
COPY src/ ./src/
COPY database/ ./database/

# Create non-root user
RUN addgroup -S botgroup && adduser -S botuser -G botgroup
RUN chown -R botuser:botgroup /app
USER botuser

EXPOSE 3000

CMD ["node", "src/index.js"]
```

---

## Nginx Configuration

```nginx
# nginx/nginx.conf
server {
    listen 80;
    server_name yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl;
    server_name yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    # Security headers
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header Strict-Transport-Security "max-age=31536000" always;

    # Increase body size for media uploads
    client_max_body_size 20M;

    location /webhook {
        proxy_pass http://app:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 30s;
    }

    location /health {
        proxy_pass http://app:3000;
    }
}
```

---

## SSL Setup (Let's Encrypt)

```bash
# Install Certbot on Ubuntu VPS
sudo apt install certbot python3-certbot-nginx -y

# Get certificate (stop nginx first if port 80 is in use)
sudo certbot certonly --standalone -d yourdomain.com

# Auto-renewal (already set up by certbot, verify with:)
sudo certbot renew --dry-run
```

---

## Deployment Commands

```bash
# 1. Clone repo on VPS
git clone https://github.com/yourorg/whatsapp-bot.git
cd whatsapp-bot

# 2. Create .env from template
cp .env.example .env
nano .env  # Fill in all values

# 3. Build and start all services
docker compose up -d --build

# 4. Check all containers running
docker compose ps

# 5. View app logs
docker compose logs -f app

# 6. Run database migrations
docker compose exec app node src/database/migrate.js

# 7. Ingest RAG documents (after placing PDFs in ./knowledge/)
docker compose exec app node src/scripts/ingest-documents.js
```

---

## Monitoring

### Health Check Endpoint
```javascript
// GET /health — Always available, no auth required
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});
```

### Log Monitoring
```bash
# Real-time error monitoring
docker compose logs -f app | grep '"level":"error"'

# Check PostgreSQL connections
docker compose exec postgres psql -U botuser -d whatsapp_bot -c "SELECT count(*) FROM pg_stat_activity;"
```

---

## Backup Strategy

```bash
# Daily PostgreSQL backup (add to crontab)
0 2 * * * docker compose exec postgres pg_dump -U botuser whatsapp_bot > /backups/db_$(date +\%Y\%m\%d).sql

# Keep last 30 days
0 3 * * * find /backups -name "db_*.sql" -mtime +30 -delete
```

---

## Scaling Strategy

| Scale Level | Action |
|-------------|--------|
| Single VPS (< 1000 users) | Current Docker Compose setup |
| Medium (1000–10,000 users) | Add more app replicas + Redis Cluster |
| Large (> 10,000 users) | Move to Kubernetes, managed RDS, ElastiCache |
| PostgreSQL read load | Add read replicas |
| Message queue | Add BullMQ + Redis for async processing |
| Multi-region | Deploy to multiple VPS regions with DNS routing |

### Immediate Horizontal Scaling Prep
```yaml
# docker-compose.scale.yml
services:
  app:
    deploy:
      replicas: 3  # Run 3 instances
```
```bash
docker compose -f docker-compose.yml -f docker-compose.scale.yml up -d
```
