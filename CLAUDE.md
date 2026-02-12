# CLAUDE.md

## Project Overview

vogt-ai is a full-stack TypeScript AI chat application that streams responses from Anthropic Claude. Built as a pnpm monorepo with a Hono API backend and React frontend, deployed as a single service on Railway.

## Tech Stack

- **Frontend**: React 19 + Vite 6 + Tailwind CSS 4 + React Router 7
- **Backend**: Hono 4 on Node.js 22 (`@hono/node-server`)
- **Database**: PostgreSQL + Drizzle ORM (`drizzle-orm` + `postgres` driver)
- **Auth**: JWT in httpOnly cookies (`hono/jwt`) + bcryptjs for password hashing
- **LLM**: Anthropic Claude (`@anthropic-ai/sdk`, model: `claude-sonnet-4-5-20250929`)
- **Validation**: Zod
- **Testing**: Vitest
- **Runtime**: tsx (TypeScript execution without build step)
- **Package manager**: pnpm with workspaces

## Architecture

```
vogt-ai/
├── apps/
│   ├── api/          # Hono backend — serves API + static frontend
│   │   ├── drizzle/              # SQL migration files (committed to git)
│   │   ├── drizzle.config.ts     # Drizzle Kit config
│   │   ├── vitest.config.ts      # Test config
│   │   └── src/
│   │       ├── index.ts           # App entry, middleware, static file serving
│   │       ├── env.ts             # Zod-validated environment variables
│   │       ├── db.ts              # Drizzle + postgres.js connection
│   │       ├── schema.ts          # Database table definitions (users)
│   │       └── routes/
│   │           ├── auth-routes.ts      # POST register/login/logout, GET me
│   │           ├── auth-routes.test.ts # Auth route tests
│   │           ├── chat-routes.ts      # POST /api/chat (SSE streaming)
│   │           └── chat-routes.test.ts # Chat auth protection tests
│   └── web/          # React frontend — built and served by the API
│       └── src/
│           ├── App.tsx                   # Router + AuthProvider wrapper
│           ├── main.tsx
│           ├── api/
│           │   ├── client.ts             # SSE stream parser (async generator)
│           │   └── auth-client.ts        # Auth API fetch wrappers
│           ├── hooks/
│           │   ├── use-chat.ts           # Chat state + streaming hook
│           │   └── use-auth.ts           # AuthContext + useAuth hook
│           └── components/
│               ├── AuthProvider.tsx       # Auth context provider
│               ├── ProtectedRoute.tsx     # Redirects to /login if unauthenticated
│               ├── LoginPage.tsx          # Login form
│               ├── RegisterPage.tsx       # Register form
│               ├── ChatArea.tsx           # Main chat UI
│               └── MessageBubble.tsx
├── package.json
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

### Single-service deployment

In production, the Hono API serves both `/api/*` routes AND the built React app as static files. There is no separate frontend service. The build script (`apps/api/package.json` → `build`) builds the React app and copies it to `apps/api/static/`.

### Authentication

- **Protect-by-default**: All `/api/*` routes require JWT auth. Only routes in the `PUBLIC_PATHS` whitelist (health, register, login, logout) are exempt. New routes are automatically protected.
- **JWT in httpOnly cookies**: Tokens are set as `httpOnly`, `secure` (production), `sameSite=Lax` cookies with 7-day expiry
- **Password hashing**: bcryptjs with cost factor 12
- **Frontend flow**: Unauthenticated users are redirected to `/login`. After login/register, redirected to `/` (chat). `AuthProvider` checks `/api/auth/me` on mount to restore sessions.
- **401 handling**: The SSE client redirects to `/login` on 401 responses

### Data flow

1. User types message → React state holds full conversation history
2. Frontend POSTs to `/api/chat` with all messages (no database, stateless)
3. Hono validates with Zod, JWT middleware verifies auth cookie, calls Claude SDK with `stream: true`
4. Tokens stream back via SSE (`streamSSE` helper)
5. Frontend async generator parses SSE, React hook accumulates tokens

## Development

```bash
pnpm dev          # Runs both API (port 3000) and Vite (port 5173) in parallel
pnpm --filter @vogt-ai/api test       # Run backend tests
pnpm --filter @vogt-ai/api test:watch # Run tests in watch mode
```

- Vite dev server proxies `/api` to `localhost:3000` (configured in `vite.config.ts`)
- API loads env vars from root `.env` via `--env-file=../../.env` flag
- Frontend hot-reloads via Vite, API hot-reloads via `tsx watch`
- Requires local PostgreSQL (Docker: `docker run -d --name vogt-ai-postgres -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=vogt_ai -p 5432:5432 postgres:16`)

### Database migrations

```bash
pnpm --filter @vogt-ai/api db:generate  # Generate migration from schema changes
pnpm --filter @vogt-ai/api db:migrate   # Apply pending migrations
pnpm --filter @vogt-ai/api db:studio    # Open Drizzle Studio GUI
```

Migrations auto-run on server startup via `migrate()` in `index.ts`.

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | — | Anthropic API key |
| `DATABASE_URL` | Yes | — | PostgreSQL connection string |
| `JWT_SECRET` | Yes | — | JWT signing secret (min 32 chars) |
| `CORS_ORIGIN` | No | `http://localhost:5173` | Allowed CORS origin (local dev) |
| `PORT` | No | `3000` | Server port |

Local dev: set in `.env` at monorepo root.
Production (Railway): set in Railway Variables tab. No `.env` file needed.

## Deployment (Railway)

- **Platform**: Railway with Railpack builder (auto-detects pnpm monorepo)
- **Build command**: `pnpm --filter @vogt-ai/api build` (builds React frontend + copies to static/)
- **Start command**: `pnpm --filter @vogt-ai/api start` (runs `tsx src/index.ts`)
- **Watch paths**: `/apps/api/**` and `/apps/web/**`
- **URL**: vogt-aiapi-production.up.railway.app
- **GitHub repo**: github.com/derekvogt3/vogt-ai (auto-deploys on push to main)
- **PostgreSQL**: Add Railway PostgreSQL plugin (auto-provisions `DATABASE_URL`)
- **JWT_SECRET**: Generate with `openssl rand -base64 48`, add to Railway Variables

## API Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/health` | Public | Health check → `{ status: "ok" }` |
| POST | `/api/auth/register` | Public | Register user. Body: `{ email, password }` |
| POST | `/api/auth/login` | Public | Login. Body: `{ email, password }`. Sets auth cookie |
| POST | `/api/auth/logout` | Public | Logout. Clears auth cookie |
| GET | `/api/auth/me` | Protected | Get current user from JWT |
| POST | `/api/chat` | Protected | Stream chat response (SSE). Body: `{ messages: [{ role, content }] }` |

## Key Patterns

- **Protect-by-default middleware**: Global JWT middleware on `/api/*` with `PUBLIC_PATHS` whitelist — any new route is automatically protected
- **SSE streaming**: Backend uses Hono `streamSSE`, frontend uses `ReadableStream` + async generator
- **Stateless chat**: No database for conversations yet. History sent with each request from client state
- **Thin routes**: Route handlers validate input → call SDK → return response
- **Zod everywhere**: Request validation, env var validation, error middleware catches ZodError
- **Hono built-ins**: Uses `hono/jwt` (sign, verify, middleware) and `hono/cookie` — no external JWT/cookie libraries
- **Queue-based test mocks**: Tests mock Drizzle DB with `selectResults`/`insertResults` arrays. See `auth-routes.test.ts`

## Testing

- Backend tests use Vitest with Hono's `app.request()` (no HTTP server needed)
- Mock `env.js` and `db.js` modules to avoid needing real env vars or database
- Tests mirror the global protect-by-default middleware pattern from `index.ts`
- Run: `pnpm --filter @vogt-ai/api test`

## Planned Next Steps

- PostgreSQL persistence (conversations, messages)
- Odoo integration (read-only data pull)
- Vector search with pgvector (RAG)

## Conventions

See CONVENTIONS.md for naming, file organization, and coding patterns.
