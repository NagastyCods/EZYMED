# EZYMED

AI-powered healthcare platform with patient, doctor, hospital, and pharmacy portals.

## Features

- Patient portal: appointments, symptom checker, queue, telemedicine, pharmacy orders
- Doctor portal: consultations, prescriptions, patient chart, AI summaries
- Hospital dashboard: live queue, bed occupancy, analytics
- Pharmacy portal: e-prescription workflow with patient notifications
- Security: encryption at rest, MFA, RBAC, audit logs, consent management

## Requirements

- Node.js 18+
- MongoDB 6+ (local or Atlas)

## Quick start

```bash
cp .env.example .env
# Edit .env with your MongoDB URI and secrets

npm install
npm start
```

Open http://localhost:3000

### Default staff credentials (seeded on first run)

| Portal | Login | Password |
|--------|-------|----------|
| Doctor | `dr-001` (see doctor list) | `Doctor@123` |
| Hospital | `admin@ezymed.com` | `Admin@123` |
| Pharmacy | `central` | `Pharmacy@123` |

Change these immediately after deploying.

## Environment variables

See `.env.example` for the full list. Production requires:

- `NODE_ENV=production`
- `JWT_SECRET` — long random string
- `ENCRYPTION_KEY` — separate long random string
- `MONGODB_URI` — MongoDB connection string
- `APP_URL` — public HTTPS URL (e.g. `https://app.ezymed.com`)

Optional:

- `SMTP_*` — email delivery (verification, password reset, notifications)
- `OPENAI_PHI_ENABLED=true` — only after legal/BAA review
- `CORS_ORIGIN` — comma-separated allowed origins for Socket.IO

## Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Start the server |
| `npm test` | Run unit tests |
| `npm run start:prod` | Start with production env |

## API health check

```
GET /api/health
```

Returns service status, MongoDB connectivity, version, and uptime.

## Tests

```bash
npm test
```

## Deployment

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for production deployment with HTTPS, PM2, and MongoDB Atlas.

## Portals

| Portal | URL |
|--------|-----|
| Patient | `/login.html`, `/dashboard.html` |
| Doctor | `/doctor.html` |
| Hospital | `/hospital.html` |
| Pharmacy | `/pharmacy.html` |

## License

ISC
