# Deployment & Container Configuration

This document covers Docker container setups, environment dependencies, and deployment procedures for the single-repo backend.

---

## 1. Docker Compose Stack

The stack defines isolated networks and persistent volumes to build and connect the server and redis services securely.

```mermaid
graph LR
    subgraph Services Network [hoodz_backend_net]
        server[server: Express Container including Workers & Cron]
        redis[redis: Alpine Cache & Queue Store]
    end
    
    server --- redis
    server -.-> MongoDBAtlas[(MongoDB Atlas Cloud DB)]
```

### Network Isolation
All containers communicate through the dedicated bridge network `hoodz_backend_net`. External port access is limited:
- **Server**: Exposes port `5027` to direct hosts.
- **Redis**: Exposed on port `6406` localhost.

---

## 2. MongoDB Cloud Database Connection

Instead of managing MongoDB locally in docker containers, this project uses a cloud-managed database (e.g. MongoDB Atlas).

- **Connection**: Handled through the `MONGODB_URI` environment variable loaded by the server.
- **Reliability**: Scalability and replicas are completely managed by MongoDB Atlas.

---

## 3. Environment Variables Reference

Environment configurations reside locally in the `server` directory.

| Service | Environment File | Crucial Variables |
| :--- | :--- | :--- |
| **server** | [server/.env](file:///c:/bdcalling/task/hoodz-backend/server/.env) | `MONGODB_URI`, `REDIS_HOST`, `REDIS_PASSWORD`, `REDIS_PORT`, `JWT_ACCESS_TOKEN_SECRET_KEY`, `OTP_HASH_SECRET`, `SMTP_USER`, `S3_BUCKET_NAME` |

---

## 4. Volume Persistence

Named volumes are declared at the bottom of the Compose file to retain cache data across container resets:
- `redis_data`: Redis memory snapshots.

---

## 5. Running the Production Stack

To build and run the production environment locally or on a server, use the production-optimized Compose file:

```bash
# Start production containers in detached mode
docker compose -f docker-compose.prod.yaml up --build -d

# Check running containers
docker compose -f docker-compose.prod.yaml ps

# Stream production server logs
docker compose -f docker-compose.prod.yaml logs -f server

# Stop the production stack and preserve volumes
docker compose -f docker-compose.prod.yaml down
```

The production build uses the multi-stage [Dockerfile](file:///d:/bd-calling/task/hoodz-backend/server/Dockerfile), which performs TypeScript compilation, runs linting validation, prunes devDependencies, and runs as a non-root `nodejs` user.

