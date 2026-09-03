# Hoodz Backend Nodemailer Service

Standalone SMTP mail service for Hoodz Backend.

## Setup

Install dependencies:

```bash
npm install
```

Create the environment file:

```bash
cp .env.example .env
```

Update `.env` with your SMTP credentials. For Gmail, use an App Password.

## Environment

```bash
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
```

## Scripts

```bash
npm run start:dev
npm run build
npm start
npm run lint
```

## Endpoints

```http
GET /
```

Response:

```text
Hoodz Backend Nodemailer Service is running!
```

```http
GET /health
```

```json
{
  "success": true,
  "service": "hoodz-backend-nodemailer"
}
```

```http
POST /
Content-Type: application/json
```

Body:

```json
{
  "to": "recipient@example.com",
  "subject": "Email Subject",
  "html": "<h1>Hello!</h1>",
  "text": "Optional plain text version"
}
```

Success:

```json
{
  "success": true,
  "message": "Email sent successfully."
}
```

## Project Structure

```text
nodemailer/
|-- src/
|   |-- app.ts
|   |-- index.ts
|   `-- app/
|       |-- @types/
|       |-- configs/
|       `-- utils/
|-- scripts/
|-- dist/
|-- .env.example
|-- package.json
|-- tsconfig.json
`-- README.md
```
