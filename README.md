# DigitalDepot

DigitalDepot is a Bangladesh-focused, single-retailer e-commerce platform for selling electronics and consumer technology products.

## Tech Stack

| Layer    | Technology                                    |
| -------- | --------------------------------------------- |
| Frontend | Next.js 16 (App Router), React 19, TypeScript |
| Backend  | Node.js (ESM), Express 5, TypeScript          |
| Database | PostgreSQL, Prisma 7 ORM (pg driver adapter)  |
| Monorepo | npm workspaces                                |

## Project Structure

```
digitaldepot/
├── apps/
│   ├── web/          # Next.js frontend (port 3000)
│   └── api/          # Express backend (port 4000)
├── packages/         # Shared packages (introduced when genuinely needed)
└── docs/             # Project documentation
```

## Prerequisites

- **Node.js** v24 or later
- **npm** v10 or later
- **PostgreSQL** v14 or later (running locally on port 5432)
- A PostgreSQL database named `digitaldepot`
- A PostgreSQL user (`digitaldepot_user`) with access to that database

> **Node version manager:** This project uses nvm. If you installed nvm to `~/.config/nvm/` (non-standard path), prefix commands with:
>
> ```bash
> export PATH="$HOME/.config/nvm/versions/node/v24.22.1/bin:$PATH"
> ```
>
> or add it to your shell profile to make it permanent.

## Local Development Setup

### 1. Clone the repository

```bash
git clone <repository-url>
cd digitaldepot
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

Edit **`apps/api/.env`** and set your PostgreSQL credentials:

```env
DATABASE_URL="postgresql://digitaldepot_user:your_password@localhost:5432/digitaldepot"
```

The other values in `apps/api/.env` and `apps/web/.env` are pre-configured for local development and do not need to change.

### 4. Generate the Prisma Client

The Prisma Client is generated into `apps/api/src/generated/` and is deliberately excluded from version control (`.gitignore`).

Run this command on initial setup or whenever `schema.prisma` is updated to generate TypeScript definitions for IDE type assistance:

```bash
npm run db:generate --workspace=apps/api
```

> **Note:** Lifecycle hooks (`predev`, `prebuild`, `pretypecheck`) in `apps/api` also run `prisma generate` automatically before development, compilation, or type checking. Explicitly running it here ensures your editor's language server immediately resolves Prisma types without running a build first.

### 5. Start the applications

Run both applications concurrently:

```bash
npm run dev
```

Or start them individually:

```bash
npm run dev:api   # API server → http://localhost:4000
npm run dev:web   # Frontend   → http://localhost:3000
```

## Verifying the Setup

| Check                | URL                                 |
| -------------------- | ----------------------------------- |
| API health endpoint  | http://localhost:4000/api/v1/health |
| Frontend status page | http://localhost:3000/status        |

A successful health check response:

```json
{
  "success": true,
  "data": {
    "status": "ok",
    "timestamp": "2024-01-01T00:00:00.000Z",
    "database": "connected",
    "version": "0.0.1"
  }
}
```

## Development Scripts

### Root (runs across workspaces)

| Command                | Description                                  |
| ---------------------- | -------------------------------------------- |
| `npm run dev`          | Start both apps concurrently                 |
| `npm run dev:api`      | Start the API server only                    |
| `npm run dev:web`      | Start the frontend only                      |
| `npm run build`        | Build both apps for production               |
| `npm run lint`         | Run ESLint across all workspaces             |
| `npm run format`       | Format all files with Prettier               |
| `npm run format:check` | Check formatting without writing             |
| `npm run typecheck`    | Run TypeScript type checks across workspaces |

### Database (workspace-scoped)

| Command                                          | Description                              |
| ------------------------------------------------ | ---------------------------------------- |
| `npm run db:generate --workspace=apps/api`       | Regenerate the Prisma Client             |
| `npm run db:migrate --workspace=apps/api`        | Create and apply a new migration         |
| `npm run db:migrate:deploy --workspace=apps/api` | Apply pending migrations (CI/production) |
| `npm run db:studio --workspace=apps/api`         | Open Prisma Studio                       |

## API Reference

Base URL: `http://localhost:4000/api/v1`

| Method | Path      | Description                     |
| ------ | --------- | ------------------------------- |
| `GET`  | `/health` | Returns API and database status |

## Project Documentation

- [Project Specification](./docs/PROJECT_SPEC.md)
- [Development Rules](./docs/DEVELOPMENT_RULES.md)
- [Implementation Roadmap](./docs/IMPLEMENTATION_ROADMAP.md)
