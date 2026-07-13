# 🚀 Hoodz Backend System

[![TypeScript](https://img.shields.io/badge/Language-TypeScript-blue.svg)](https://www.typescriptlang.org/)
[![Express](https://img.shields.io/badge/Framework-Express%20v5-lightgrey.svg)](https://expressjs.com/)
[![MongoDB](https://img.shields.io/badge/Database-MongoDB%20Atlas-green.svg)](https://www.mongodb.com/)
[![Redis](https://img.shields.io/badge/Cache-Redis-red.svg)](https://redis.io/)
[![Docker](https://img.shields.io/badge/Container-Docker-blue.svg)](https://www.docker.com/)
[![License-ISC](https://img.shields.io/badge/License-ISC-orange.svg)](https://opensource.org/licenses/ISC)

> [!WARNING]
> **This project is strictly Docker-centric.**
> Do not attempt to run Redis or the Node.js server directly on your host machine for development.
> Always use Docker Compose to manage, run, and scale services locally.

---

## 1. Purpose & Overview

This repository houses the backend system for the **Hoodz Backend** application. It provides a robust, decoupled, and layered API designed to manage:
- User accounts, roles, profiles, and statuses.
- One-Time Password (OTP) verification with short-term Redis caching.
- File management and direct cloud uploads to AWS S3.
- Event-driven notifications via BullMQ queues and WebSockets (Socket.IO).
- System-wide administrative configurations and parameters.

---

## 2. Technology Stack & Integrations

- **Core Runtime**: Node.js (LTS v22.14.0)
- **Programming Language**: TypeScript
- **Web Framework**: Express (v5.2.1) & Socket.IO (v4.8.3)
- **Database**: MongoDB (via Mongoose v9.7.0)
- **Job Queues & Scheduler**: BullMQ (v5.79.2) + Redis (v7-alpine) & Node-Cron (v4.2.1)
- **Third-Party Services**:
  - **AWS S3**: Cloud media storage and retrieval
  - **Stripe**: Credit card billing and invoice webhooks
  - **Twilio / NodeMailer**: SMS/Email OTP verification code dispatch
  - **Firebase Admin**: Real-time push notification delivery

---

## 3. Directory Layout

Below is a bird's-eye view of the current project directory structure:

```text
.
|-- docker-compose.yaml         # Local Docker Compose stack: API server + Redis
|-- docs/                       # Developer guides, architecture notes, API rules
|-- nodemailer/                 # Standalone Hoodz Backend SMTP mail service
|   |-- Dockerfile              # Production mail-service container build
|   |-- Dockerfile.dev          # Development mail-service container build
|   |-- README.md               # Mail-service setup and endpoint docs
|   |-- scripts/                # Build/runtime helper scripts
|   |-- src/
|   |   |-- app.ts              # Express mail API setup
|   |   |-- index.ts            # Mail-service HTTP entrypoint
|   |   `-- app/
|   |       |-- @types/         # Shared TypeScript types
|   |       |-- configs/        # Env and Nodemailer transport configuration
|   |       `-- utils/          # Mail options, shutdown, validation helpers
|   `-- tsconfig.json           # Mail-service TypeScript config
|-- server/                     # Main Hoodz Backend API package
|   |-- Dockerfile              # Production API container build
|   |-- Dockerfile.dev          # Development API container build
|   |-- public/                 # Static/public assets
|   |-- scripts/                # Admin creation, seeding, import helper scripts
|   |-- src/
|   |   |-- app.ts              # Express setup and middleware attachment
|   |   |-- server.ts           # API server entrypoint
|   |   `-- app/
|   |       |-- @types/         # Global application types
|   |       |-- builder/        # Query builder utilities
|   |       |-- configs/        # Database, Redis, trace, CORS, email, S3 configs
|   |       |-- constant/       # Global constants and API version prefixes
|   |       |-- core/           # Core shared application logic
|   |       |-- errors/         # Custom/global error handling
|   |       |-- jobs/           # Scheduled background jobs
|   |       |-- middlewares/    # Auth, multer, trace, global error middleware
|   |       |-- modules/        # Domain modules: auth, user, otp, notification, settings, upload
|   |       |-- queues/         # BullMQ queue definitions
|   |       |-- redis/          # Redis client and cache helpers
|   |       |-- routes/         # Versioned API route registry
|   |       |-- socket/         # Socket.IO handlers
|   |       |-- utils/          # Shared utility functions
|   |       `-- worker/         # Queue workers and email templates
|   `-- tsconfig.json           # API TypeScript config
|-- .dockerignore
|-- .gitignore
`-- README.md                   # Root setup guide
```

---

## 4. Environment Variables Configuration

To run the application, create a `.env` file in the `server` directory using the template provided:

```bash
cp server/.env.example server/.env
```

Ensure all variables are populated correctly:
- **`MONGODB_URI`**: Connection string to your MongoDB Atlas cloud database cluster.
- **`REDIS_PASSWORD`**: Security credential password for the Redis container.
- **`JWT_ACCESS_TOKEN_SECRET_KEY` / `JWT_REFRESH_TOKEN_SECRET_KEY`**: Cryptographic keys for signing user tokens.
- **`OTP_HASH_SECRET`**: Key used for validation signatures of OTP codes in Redis.
- **`SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS`**: NodeMailer mail server credentials.
- **`S3_ACCESS_KEY` / `S3_SECRET_KEY` / `S3_REGION` / `S3_BUCKET_NAME`**: AWS credentials for file uploads.
- **`EXCHANGE_RATE_API_KEY`**: Key for the external exchange rates service.

---

## 5. Development Stack Setup

Start the local stack with code hot-reloading enabled:

```bash
docker compose up --build
```

### What this does:
1. Builds the server image using `Dockerfile.dev`.
2. Starts the `redis` container.
3. Mounts the `./server/src` directory inside the container for hot-reloading using `nodemon` and `tsc-alias`.
4. Publishes the API on `http://localhost:5029`.
5. Publishes Redis on `127.0.0.1:6408` for host-side debugging tools.
6. Saves dependencies inside container volumes.

### Useful Commands:
```bash
# Check running container statuses
docker compose ps

# Stream logs of the running Express server
docker compose logs -f server

# Stop the development stack
docker compose down
```

---

## 6. Database Seeding & Seeding Workflows

Once the development stack is running, seed the initial application database collections:

### A. Seed Platform Settings
Initialize default settings (Terms, Privacy Policies, Support Contact details):
```bash
docker compose exec server pnpm run seed:settings
```

### B. Create Admin Account
Create a default administrator account interactively:
```bash
docker compose exec server pnpm run create:admin
```

---

## 7. Container Ports

The current local Docker stack is defined in `docker-compose.yaml`:

| Service | Container | Host Access |
| :--- | :--- | :--- |
| API server | `hoodz_backend_server` | `http://localhost:5029` |
| Redis | `hoodz_backend_redis` | `127.0.0.1:6408` -> `6379` |

The standalone `nodemailer/` service has its own Dockerfiles and README. Add it to Compose only when you want to run it as a separate container.

---

## 8. Health Verification

The API server exposes a health endpoint to verify startup integrity:

- **Endpoint**: `GET /health`
- **Expected Status**: `HTTP 200`
- **Expected Payload**:
```json
{
  "status": 200,
  "success": true,
  "message": "Server Is Running",
  "traceId": "unique-uuid-string"
}
```

---

## 9. Developer Scripts Reference

All scripts must be executed within the `server` environment.

| Script | Command | Purpose |
| :--- | :--- | :--- |
| **dev** | `nodemon` | Starts server with live-reloads |
| **build** | `bash scripts/build.sh` | Lints, compiles TS, and fixes paths with tsc-alias |
| **start** | `node ./dist/server.js` | Starts built production files |
| **lint** | `eslint "src/**/*.{ts,js}" --quiet` | Static code analysis check |
| **format** | `prettier --write "src/**/*.ts"` | Standardizes code styling formatting |
| **create:module** | `node ./scripts/createModule.js` | Scaffolds a new domain module |
| **create:admin** | `node ./scripts/createAdmin.js` | Prompts/seeds an administrator user |
| **seed:settings** | `node ./scripts/seedSettings.js` | Seeds initial site-settings |

---

## 10. Developer Documentation Index

Explore the directories in `docs/` to details conventions used across the project:

- [System Architecture Details](docs/ARCHITECTURE.md): Structural layout and data workflows.
- [Authentication and Sessions](docs/AUTHENTICATION.md): Session logic, RBAC, and OTP lifetimes.
- [API Conventions](docs/API_GUIDELINES.md): Return templates and error structure formats.
- [Code Style & Standards](docs/CODING_RULES.md): ESLint rules and folder structural naming schemas.
- [Database & Seed Routines](docs/DATABASE_SEEDING.md): Seeding idempotency rules and schema notes.
- [Container Stack Deployments](docs/DEPLOYMENT.md): Volume mappings and network guides.
- [Testing & Quality Verification](docs/TESTING_WORKFLOW.md): Local verification routines.
