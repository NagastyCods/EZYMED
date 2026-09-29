# EZYMED Production Deployment

## Pre-deploy checklist

- [ ] `NODE_ENV=production`
- [ ] Strong `JWT_SECRET` and `ENCRYPTION_KEY` (48+ random bytes each)
- [ ] MongoDB Atlas with backups and IP allowlist
- [ ] HTTPS enabled via reverse proxy or platform TLS
- [ ] `APP_URL` set to your public HTTPS URL
- [ ] SMTP configured for email verification and notifications
- [ ] Default staff passwords changed in the database
- [ ] `OPENAI_PHI_ENABLED` left `false` until legal/BAA review

## Recommended stack

| Layer | Recommendation |
|-------|----------------|
| Hosting | Railway, Render, DigitalOcean, AWS EC2, Azure VM |
| Database | MongoDB Atlas (M10+ with backups) |
| TLS | Nginx, Caddy, or platform-managed HTTPS |
| Process | PM2 or systemd |
| Monitoring | UptimeRobot / Better Stack on `/api/health` |

## Environment

```env
NODE_ENV=production
PORT=3000
APP_URL=https://your-domain.com
MONGODB_URI=mongodb+srv://...
JWT_SECRET=<random>
ENCRYPTION_KEY=<random>
EMAIL_FROM=noreply@your-domain.com
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=<sendgrid-api-key>
CORS_ORIGIN=https://your-domain.com
```

## PM2

```bash
npm install -g pm2
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

## Nginx reverse proxy (example)

```nginx
server {
  listen 443 ssl http2;
  server_name your-domain.com;

  ssl_certificate     /etc/ssl/certs/your-domain.crt;
  ssl_certificate_key /etc/ssl/private/your-domain.key;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

## Health monitoring

Monitor `GET /api/health` every 1–5 minutes. Alert on:

- HTTP status ≠ 200
- `checks.mongodb` ≠ `up`

## Backups

- Enable automated MongoDB Atlas backups
- Test a restore procedure before go-live
- Clinical file uploads live in `uploads/consultations/` — back up or migrate to object storage for multi-instance deploys

## Scaling notes

- Single-instance: current setup works with local file uploads
- Multi-instance: use S3-compatible storage for uploads and Redis adapter for Socket.IO
- Sticky sessions required if scaling Socket.IO without Redis

## Incident response

1. Check `/api/health` and application logs (structured JSON in production)
2. Verify MongoDB Atlas status and connection string
3. Rotate `JWT_SECRET` only with a planned session invalidation window
4. Contact `privacy@ezymed.com` for data breach procedures per your privacy notice
