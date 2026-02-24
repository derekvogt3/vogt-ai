# CLAUDE.md

## Project Overview

vogt-ai is a client-facing AI services platform with invite-only registration, role-based access control, and per-user service assignments. Built as a pnpm monorepo with a Hono API backend, React frontend, and Astro marketing site, deployed as a single service on Railway.

## Tech Stack

- **Marketing Site**: Astro 5 (static output) + Tailwind CSS 4
- **Platform App**: React 19 + Vite 6 + Tailwind CSS 4 + React Router 7
- **Backend**: Hono 4 on Node.js 22 (`@hono/node-server`)
- **Database**: PostgreSQL + Drizzle ORM (`drizzle-orm` + `postgres` driver)
- **Auth**: JWT in httpOnly cookies (`hono/jwt`) + bcryptjs for password hashing + invite-code registration
- **Validation**: Zod
- **Testing**: Vitest
- **Runtime**: tsx (TypeScript execution without build step)
- **Package manager**: pnpm with workspaces

## Architecture

```
vogt-ai/
├── apps/
│   ├── api/          # Hono backend — serves API + both frontends
│   │   ├── drizzle/              # SQL migration files (committed to git)
│   │   ├── drizzle.config.ts     # Drizzle Kit config
│   │   ├── vitest.config.ts      # Test config
│   │   └── src/
│   │       ├── index.ts           # App entry, middleware, static file serving
│   │       ├── env.ts             # Zod-validated environment variables
│   │       ├── db.ts              # Drizzle + postgres.js connection
│   │       ├── schema.ts          # Database tables (users, invite_codes, services, user_services, documents)
│   │       ├── middleware/
│   │       │   └── require-admin.ts  # Admin role check middleware
│   │       ├── routes/
│   │       │   ├── auth-routes.ts      # POST register (with invite code)/login/logout, GET me
│   │       │   ├── auth-routes.test.ts # Auth route tests
│   │       │   ├── admin-routes.ts     # User management, invite codes, service assignments (admin only)
│   │       │   ├── service-routes.ts   # GET /services/mine (user's assigned services)
│   │       │   └── document-routes.ts  # Document search, stats, detail (RLC Controls)
│   │       └── scripts/
│   │           ├── bootstrap-admin.ts  # Promote user to admin + seed services
│   │           ├── dropbox-ingest.ts   # Dropbox → PostgreSQL document ingestion pipeline
│   │           ├── dropbox-search.ts   # CLI document search tool
│   │           └── dropbox-explore.ts  # Dropbox API file explorer
│   ├── marketing/    # Astro static marketing site — served at /
│   │   ├── astro.config.mjs
│   │   └── src/
│   │       ├── layouts/BaseLayout.astro  # SEO meta tags, JSON-LD, Open Graph
│   │       ├── components/               # Header, Hero, Services, About, Contact, Footer
│   │       └── pages/index.astro         # Single-page marketing site
│   └── web/          # React platform app — served at /app
│       └── src/
│           ├── App.tsx                   # Router (basename="/app") + AuthProvider
│           ├── main.tsx
│           ├── api/
│           │   ├── auth-client.ts        # Auth API fetch wrappers (login, register w/ invite code)
│           │   ├── admin-client.ts       # Admin API client (users, invite codes, services)
│           │   ├── services-client.ts    # Service listing API client
│           │   └── documents-client.ts   # Document search/stats/detail API client
│           ├── hooks/
│           │   └── use-auth.ts           # AuthContext + useAuth hook
│           └── components/
│               ├── AuthProvider.tsx       # Auth context provider
│               ├── ProtectedRoute.tsx     # Redirects to /app/login if unauthenticated
│               ├── AdminRoute.tsx         # Redirects to /app if not admin
│               ├── LoginPage.tsx          # Login form
│               ├── RegisterPage.tsx       # Register form (requires invite code)
│               ├── DashboardPage.tsx      # Service dashboard (home page)
│               ├── AdminPage.tsx          # Admin panel (users, invite codes, services)
│               └── RLCPage.tsx            # RL Controls document search UI
├── package.json
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

### URL routing

| Path | Serves | Source |
|---|---|---|
| `/` | Marketing site (Astro static HTML) | `apps/marketing` |
| `/app` | Dashboard (services list) | `apps/web` |
| `/app/rlc` | RL Controls document search | `apps/web` |
| `/app/admin` | Admin panel (admin only) | `apps/web` |
| `/app/login` | Login page | `apps/web` |
| `/app/register` | Register page (requires invite code) | `apps/web` |
| `/api/*` | API routes (JWT-protected) | `apps/api` |

### Single-service deployment

In production, the Hono API serves `/api/*` routes, the React platform app at `/app/*`, and the Astro marketing site at `/`. There is no separate frontend service. The build script (`apps/api/package.json` → `build`) builds both the Astro marketing site and the React app, copying them to `apps/api/static/marketing/` and `apps/api/static/app/` respectively.

### Authentication & Authorization

- **Protect-by-default**: All `/api/*` routes require JWT auth. Only routes in the `PUBLIC_PATHS` whitelist (health, register, login, logout) are exempt. New routes are automatically protected.
- **Invite-only registration**: Users must provide a valid invite code (generated by admin) to register. Codes are single-use and can have expiration dates.
- **Roles**: Users have a `role` field (`admin` | `user`). Role is included in the JWT payload.
- **Admin middleware**: `requireAdmin` middleware checks `jwtPayload.role === 'admin'` and returns 403 if not.
- **Service access**: Users are assigned specific services via `user_services` join table. Admins see all enabled services.
- **JWT in httpOnly cookies**: Tokens are set as `httpOnly`, `secure` (production), `sameSite=Lax` cookies with 7-day expiry. JWT payload includes `sub`, `email`, `role`.
- **Password hashing**: bcryptjs with cost factor 12
- **Frontend flow**: Unauthenticated users are redirected to `/app/login`. After login/register, redirected to `/app` (dashboard). `AuthProvider` checks `/api/auth/me` on mount to restore sessions.

### Database Schema

| Table | Purpose |
|---|---|
| `users` | User accounts with email, passwordHash, role (admin/user) |
| `invite_codes` | Single-use registration codes created by admins |
| `services` | Available services on the platform (slug, name, description, route) |
| `user_services` | Join table: which users have access to which services |
| `documents` | Indexed documents from Dropbox with full-text search (tsvector + GIN index) |

### Document Search (RLC Controls)

The platform includes a full-text search system for ~12,500 documents (45M words) from a Dropbox folder, indexed into PostgreSQL:

- **Backend**: `document-routes.ts` — search (FTS with ranking + snippets), stats, document detail
- **Frontend**: `RLCPage.tsx` — search bar, file type filter, result cards with highlighted snippets, document detail panel
- **Search**: Uses PostgreSQL `tsvector`, `plainto_tsquery`, `ts_rank`, and `ts_headline` with `<mark>` tags
- **Utility scripts**: `dropbox-ingest.ts` (ingestion pipeline), `dropbox-search.ts` (CLI search), `dropbox-explore.ts` (file explorer)

## Development

```bash
pnpm dev          # Runs API (port 3000), Vite (port 5173), and Astro (port 4321) in parallel
pnpm --filter @vogt-ai/api test       # Run backend tests
pnpm --filter @vogt-ai/api test:watch # Run tests in watch mode
```

- Vite dev server proxies `/api` to `localhost:3000` (configured in `vite.config.ts`)
- API loads env vars from root `.env` via `--env-file=../../.env` flag
- React app hot-reloads via Vite at `localhost:5173/app/`
- Astro marketing site hot-reloads at `localhost:4321`
- API hot-reloads via `tsx watch`
- Requires local PostgreSQL (Docker: `docker run -d --name vogt-ai-postgres -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=vogt_ai -p 5432:5432 postgres:16`)

### Database migrations

```bash
pnpm --filter @vogt-ai/api db:generate  # Generate migration from schema changes
pnpm --filter @vogt-ai/api db:migrate   # Apply pending migrations
pnpm --filter @vogt-ai/api db:studio    # Open Drizzle Studio GUI
```

Migrations auto-run on server startup via `migrate()` in `index.ts`.

### Admin Bootstrap

After deploying the new schema, bootstrap the first admin and seed services:

```bash
pnpm --filter @vogt-ai/api tsx src/scripts/bootstrap-admin.ts <email>
```

This promotes a registered user to admin, creates the RLC Controls service, and grants the admin access.

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | Yes | — | PostgreSQL connection string |
| `JWT_SECRET` | Yes | — | JWT signing secret (min 32 chars) |
| `CORS_ORIGIN` | No | `http://localhost:5173` | Allowed CORS origin (local dev) |
| `PORT` | No | `3000` | Server port |

Local dev: set in `.env` at monorepo root.
Production (Railway): set in Railway Variables tab. No `.env` file needed.

## Deployment (Railway)

- **Platform**: Railway with Railpack builder (auto-detects pnpm monorepo)
- **Build command**: `pnpm --filter @vogt-ai/api build` (builds Astro marketing site + React app, copies to static/)
- **Start command**: `pnpm --filter @vogt-ai/api start` (runs `tsx src/index.ts`)
- **Watch paths**: `/apps/api/**`, `/apps/web/**`, and `/apps/marketing/**`
- **URL**: vogt-aiapi-production.up.railway.app
- **GitHub repo**: github.com/derekvogt3/vogt-ai (auto-deploys on push to main)
- **PostgreSQL**: Add Railway PostgreSQL plugin (auto-provisions `DATABASE_URL`)
- **JWT_SECRET**: Generate with `openssl rand -base64 48`, add to Railway Variables

## API Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/health` | Public | Health check |
| POST | `/api/auth/register` | Public | Register (requires invite code). Body: `{ email, password, inviteCode }` |
| POST | `/api/auth/login` | Public | Login. Body: `{ email, password }`. Sets auth cookie |
| POST | `/api/auth/logout` | Public | Logout. Clears auth cookie |
| GET | `/api/auth/me` | Protected | Get current user (id, email, role) |
| GET | `/api/services/mine` | Protected | List services user has access to |
| GET | `/api/documents/search` | Protected | Full-text search. Query: `q, type, limit, page` |
| GET | `/api/documents/stats` | Protected | Corpus statistics |
| GET | `/api/documents/:id` | Protected | Full document detail with extracted text |
| GET | `/api/admin/users` | Admin | List all users with service assignments |
| PATCH | `/api/admin/users/:id/role` | Admin | Change user role |
| POST | `/api/admin/invite-codes` | Admin | Generate invite code |
| GET | `/api/admin/invite-codes` | Admin | List all invite codes |
| DELETE | `/api/admin/invite-codes/:id` | Admin | Revoke unused invite code |
| GET | `/api/admin/services` | Admin | List all services |
| POST | `/api/admin/users/:uid/services/:sid` | Admin | Grant service access |
| DELETE | `/api/admin/users/:uid/services/:sid` | Admin | Revoke service access |

## Key Patterns

- **Protect-by-default middleware**: Global JWT middleware on `/api/*` with `PUBLIC_PATHS` whitelist — any new route is automatically protected
- **Role in JWT**: JWT payload includes `role`, checked by `requireAdmin` middleware for admin routes
- **Invite-code registration**: No open registration. Admin generates codes, users provide code to register.
- **Service access model**: `services` table defines available services; `user_services` join table controls per-user access; admins see all enabled services
- **Thin routes**: Route handlers validate input → query DB → return response
- **Zod everywhere**: Request validation, env var validation, error middleware catches ZodError
- **Hono built-ins**: Uses `hono/jwt` (sign, verify, middleware) and `hono/cookie` — no external JWT/cookie libraries
- **Queue-based test mocks**: Tests mock Drizzle DB with `selectResults`/`insertResults`/`updateResults` arrays. See `auth-routes.test.ts`
- **Raw SQL for FTS**: Document search uses `db.execute(sql\`...\`)` for PostgreSQL full-text search features not exposed via Drizzle's query builder

## Testing

- Backend tests use Vitest with Hono's `app.request()` (no HTTP server needed)
- Mock `env.js` and `db.js` modules to avoid needing real env vars or database
- Tests mirror the global protect-by-default middleware pattern from `index.ts`
- Run: `pnpm --filter @vogt-ai/api test`

## Utility Scripts

Located in `apps/api/src/scripts/`:

| Script | Purpose |
|---|---|
| `bootstrap-admin.ts` | Promote user to admin, seed services |
| `dropbox-ingest.ts` | Ingest documents from Dropbox into PostgreSQL (resumable) |
| `dropbox-search.ts` | CLI full-text search tool |
| `dropbox-explore.ts` | List files in Dropbox via API |

## Conventions

See CONVENTIONS.md for naming, file organization, and coding patterns.
