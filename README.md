# vogt-ai

Client-facing AI services platform with invite-only registration, role-based access control, and per-user service assignments. Each client/project gets isolated service directories with shared infrastructure.

## Quick Start

### Prerequisites

- Node.js 22+ (via nvm)
- pnpm
- Docker (for local PostgreSQL)

### Setup

```bash
# 1. Install dependencies
pnpm install

# 2. Start local PostgreSQL
docker run -d --name vogt-ai-postgres \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=vogt_ai \
  -p 5432:5432 postgres:16

# 3. Create .env at monorepo root
cat > .env << 'EOF'
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/vogt_ai
JWT_SECRET=your-secret-here-must-be-at-least-32-characters-long
ANTHROPIC_API_KEY=sk-ant-...
EOF

# 4. Start dev servers (API + Vite + Astro)
pnpm dev
```

The app is available at:
- **Platform**: http://localhost:5173/app/
- **Marketing site**: http://localhost:4321
- **API**: http://localhost:3000/api/health

### First-time database setup

Migrations run automatically on server startup. To create the first admin user:

```bash
# Register an account at /app/register (requires an invite code)
# For the very first user, insert an invite code manually:
docker exec vogt-ai-postgres psql -U postgres -d vogt_ai \
  -c "INSERT INTO invite_codes (id, code, created_by) VALUES (gen_random_uuid(), 'FIRST-CODE', (SELECT id FROM users LIMIT 1));"

# After registering, promote to admin and seed services:
pnpm --filter @vogt-ai/api seed <your-email>

# Optionally reset password (useful if you forgot it):
pnpm --filter @vogt-ai/api seed <your-email> -- --reset-password <newpass>
```

## Common Commands

### Development

| Command | Description |
|---|---|
| `pnpm dev` | Start all dev servers (API, Vite, Astro) |
| `pnpm --filter @vogt-ai/api test` | Run backend tests |
| `pnpm --filter @vogt-ai/api test:watch` | Run tests in watch mode |

### Database

| Command | Description |
|---|---|
| `pnpm --filter @vogt-ai/api db:generate` | Generate migration from schema changes |
| `pnpm --filter @vogt-ai/api db:migrate` | Apply pending migrations |
| `pnpm --filter @vogt-ai/api db:studio` | Open Drizzle Studio GUI |

### Seeding & Admin

| Command | Description |
|---|---|
| `pnpm --filter @vogt-ai/api seed <email>` | Promote user to admin + seed services |
| `pnpm --filter @vogt-ai/api seed <email> -- --reset-password <pass>` | Same + reset password |

### Docker (local PostgreSQL)

| Command | Description |
|---|---|
| `docker start vogt-ai-postgres` | Start existing container |
| `docker stop vogt-ai-postgres` | Stop container |
| `docker exec vogt-ai-postgres psql -U postgres -d vogt_ai` | Connect to database |

## Production (Railway)

### Deployment

Auto-deploys on push to `main` via GitHub integration.

- **Build**: `pnpm --filter @vogt-ai/api build`
- **Start**: `pnpm --filter @vogt-ai/api start`
- **URL**: vogt-aiapi-production.up.railway.app

### Environment Variables

Set these in Railway Variables tab:

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Auto | PostgreSQL connection (auto-provisioned by Railway plugin) |
| `JWT_SECRET` | Yes | `openssl rand -base64 48` |
| `ANTHROPIC_API_KEY` | Yes | Anthropic API key |
| `CORS_ORIGIN` | No | Defaults to `http://localhost:5173` |
| `PORT` | No | Defaults to `3000` |

### Production seed

After first deploy, seed the admin user and services:

```bash
# Get your Railway DATABASE_URL from the Railway dashboard (use the public URL, not internal)
DATABASE_URL="postgresql://postgres:...@....railway.app:5432/railway" \
  pnpm --filter @vogt-ai/api seed <your-email>
```

### Useful Railway commands

```bash
railway link          # Link local project to Railway
railway logs          # View production logs
railway variables     # List environment variables
```

## Architecture

```
apps/
├── api/              # Hono backend (serves API + static frontends)
│   └── src/
│       ├── services/rlc/     # RL Controls service (schema, routes, scripts)
│       ├── middleware/       # Auth + service access middleware
│       ├── routes/           # Platform routes (auth, admin, services)
│       └── scripts/          # Platform CLI tools (seed)
├── web/              # React platform app (served at /app)
│   └── src/
│       ├── services/rlc/     # RL Controls frontend (page + API client)
│       └── components/       # Platform components (auth, routing, admin)
└── marketing/        # Astro static site (served at /)
```

See [CLAUDE.md](./CLAUDE.md) for full architecture details, API endpoints, and patterns.
