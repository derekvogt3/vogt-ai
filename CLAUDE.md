# CLAUDE.md

## Project Overview

vogt-ai is a client-facing AI services platform with invite-only registration, role-based access control, and per-user service assignments. Built as a pnpm monorepo with a Hono API backend, React frontend, and Astro marketing site, deployed as a single service on Railway.

Each client/project gets its own service directory (`services/<name>/`) on both the API and frontend, with a shared database using table-name prefixes for isolation (e.g., `rlc_documents`).

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
│   │   ├── drizzle.config.ts     # Drizzle Kit config (multi-schema glob)
│   │   ├── vitest.config.ts      # Test config
│   │   └── src/
│   │       ├── index.ts           # App entry, middleware, static file serving
│   │       ├── env.ts             # Zod-validated environment variables
│   │       ├── db.ts              # Drizzle + postgres.js connection
│   │       ├── schema.ts          # Platform tables (users, invite_codes, services, user_services)
│   │       ├── middleware/
│   │       │   ├── require-admin.ts    # Admin role check middleware
│   │       │   └── require-service.ts  # Service-level access control middleware
│   │       ├── routes/
│   │       │   ├── auth-routes.ts      # POST register (with invite code)/login/logout, GET me
│   │       │   ├── auth-routes.test.ts # Auth route tests
│   │       │   ├── admin-routes.ts     # User management, invite codes, service assignments (admin only)
│   │       │   └── service-routes.ts   # GET /services/mine (user's assigned services)
│   │       ├── services/
│   │       │   └── rlc/               # RL Controls — first client service
│   │       │       ├── schema.ts       # rlc_documents table definition
│   │       │       ├── routes.ts       # Document search, stats, detail endpoints
│   │       │       └── scripts/
│   │       │           ├── ingest.ts   # Dropbox → PostgreSQL document ingestion pipeline
│   │       │           ├── search.ts   # CLI document search tool
│   │       │           └── explore.ts  # Dropbox API file explorer
│   │       └── scripts/
│   │           └── seed.ts            # Promote admin + seed services + optional password reset
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
│           │   └── services-client.ts    # Service listing API client
│           ├── hooks/
│           │   └── use-auth.ts           # AuthContext + useAuth hook
│           ├── components/
│           │   ├── AuthProvider.tsx       # Auth context provider
│           │   ├── ProtectedRoute.tsx     # Redirects to /app/login if unauthenticated
│           │   ├── AdminRoute.tsx         # Redirects to /app if not admin
│           │   ├── ServiceRoute.tsx       # Checks service access before rendering
│           │   ├── LoginPage.tsx          # Login form
│           │   ├── RegisterPage.tsx       # Register form (requires invite code)
│           │   ├── DashboardPage.tsx      # Service dashboard (home page)
│           │   └── AdminPage.tsx          # Admin panel (users, invite codes, services)
│           └── services/
│               └── rlc/                  # RL Controls frontend
│                   ├── RLCPage.tsx        # Document search UI
│                   └── api.ts            # Document search/stats/detail API client
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
- **Service access middleware**: `requireService(slug)` middleware checks `user_services` join table. Admins bypass all service checks. Returns 403 if user doesn't have access.
- **Service access (frontend)**: `ServiceRoute` component checks `/api/services/mine` before rendering. Admins bypass. Users without access are redirected to dashboard. This is defense-in-depth — the real enforcement is server-side.
- **JWT in httpOnly cookies**: Tokens are set as `httpOnly`, `secure` (production), `sameSite=Lax` cookies with 7-day expiry. JWT payload includes `sub`, `email`, `role`.
- **Password hashing**: bcryptjs with cost factor 12
- **Frontend flow**: Unauthenticated users are redirected to `/app/login`. After login/register, redirected to `/app` (dashboard). `AuthProvider` checks `/api/auth/me` on mount to restore sessions.

### Database Schema

| Table | Purpose |
|---|---|
| `users` | User accounts with email, passwordHash, role (admin/user) |
| `invite_codes` | Single-use registration codes created by admins |
| `services` | Available services on the platform (slug, name, description, route, enabled) |
| `user_services` | Join table: which users have access to which services |
| `rlc_documents` | Indexed documents from Dropbox with full-text search (tsvector + GIN index) |

### Multi-service pattern

Each client/project is isolated in its own `services/<name>/` directory on both API and frontend:
- **API schema**: `apps/api/src/services/<name>/schema.ts` — table definitions prefixed with the service name (e.g., `rlc_documents`)
- **API routes**: `apps/api/src/services/<name>/routes.ts` — service-specific endpoints
- **API scripts**: `apps/api/src/services/<name>/scripts/` — CLI utilities for the service
- **Frontend**: `apps/web/src/services/<name>/` — React components and API clients
- **Access control**: `requireService('<slug>')` middleware on API routes + `<ServiceRoute slug="<slug>">` wrapper on frontend routes
- **Drizzle config**: Uses glob `['./src/schema.ts', './src/services/*/schema.ts']` to pick up all schema files

To add a new service:
1. Create `apps/api/src/services/<name>/schema.ts` with prefixed table names
2. Create `apps/api/src/services/<name>/routes.ts` with endpoints
3. Add `requireService('<slug>')` + `app.route()` in `index.ts`
4. Create `apps/web/src/services/<name>/` with components and API client
5. Add route in `App.tsx` wrapped with `<ServiceRoute slug="<slug>">`
6. Add service definition to `SERVICE_DEFINITIONS` in `seed.ts`
7. Run `db:generate` and `db:migrate`

### Document Search (RLC Controls)

The platform includes a full-text search system for ~12,500 documents (45M words) from a Dropbox folder, indexed into PostgreSQL:

- **Backend**: `services/rlc/routes.ts` — search (FTS with ranking + snippets), stats, document detail
- **Frontend**: `services/rlc/RLCPage.tsx` — search bar, file type filter, result cards with highlighted snippets, document detail panel
- **Search**: Uses PostgreSQL `tsvector`, `plainto_tsquery`, `ts_rank`, and `ts_headline` with `<mark>` tags
- **Utility scripts**: `services/rlc/scripts/ingest.ts` (ingestion pipeline), `search.ts` (CLI search), `explore.ts` (file explorer)

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

### Seeding (admin + services)

After deploying or setting up a new environment, seed the admin user and services:

```bash
# Local (uses .env for DATABASE_URL)
pnpm --filter @vogt-ai/api seed <email>

# With password reset (useful for dev)
pnpm --filter @vogt-ai/api seed <email> -- --reset-password <newpass>

# Against Railway production
DATABASE_URL="postgresql://..." pnpm --filter @vogt-ai/api seed <email>
```

This promotes a registered user to admin, creates all service records from `SERVICE_DEFINITIONS`, and grants the admin access to each service.

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | Yes | — | PostgreSQL connection string |
| `JWT_SECRET` | Yes | — | JWT signing secret (min 32 chars) |
| `ANTHROPIC_API_KEY` | Yes | — | Anthropic API key |
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

### Production setup after first deploy

1. Migrations run automatically on server startup
2. Register an account via `/app/register` (requires invite code — for the very first user, insert one manually into the `invite_codes` table)
3. Run the seed script to promote admin and create services:
   ```bash
   DATABASE_URL="postgresql://..." pnpm --filter @vogt-ai/api seed <email>
   ```

## API Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/health` | Public | Health check |
| POST | `/api/auth/register` | Public | Register (requires invite code). Body: `{ email, password, inviteCode }` |
| POST | `/api/auth/login` | Public | Login. Body: `{ email, password }`. Sets auth cookie |
| POST | `/api/auth/logout` | Public | Logout. Clears auth cookie |
| GET | `/api/auth/me` | Protected | Get current user (id, email, role) |
| GET | `/api/services/mine` | Protected | List services user has access to |
| GET | `/api/documents/search` | Service: rlc-controls | Full-text search. Query: `q, type, limit, page` |
| GET | `/api/documents/stats` | Service: rlc-controls | Corpus statistics |
| GET | `/api/documents/:id` | Service: rlc-controls | Full document detail with extracted text |
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
- **Service access enforcement**: `requireService(slug)` middleware checks `user_services` table. Admins bypass. Applied per-service in `index.ts`. Frontend `ServiceRoute` component provides defense-in-depth.
- **Invite-code registration**: No open registration. Admin generates codes, users provide code to register.
- **Service access model**: `services` table defines available services; `user_services` join table controls per-user access; admins see all enabled services
- **Service isolation**: Each service lives in `services/<name>/` with its own schema, routes, scripts, and frontend. Table names are prefixed (e.g., `rlc_*`).
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

### Platform scripts (`apps/api/src/scripts/`)

| Script | Command | Purpose |
|---|---|---|
| `seed.ts` | `pnpm --filter @vogt-ai/api seed <email>` | Promote admin, seed services, optional password reset |

### RLC service scripts (`apps/api/src/services/rlc/scripts/`)

| Script | Purpose |
|---|---|
| `ingest.ts` | Ingest documents from Dropbox into PostgreSQL (resumable) |
| `search.ts` | CLI full-text search tool |
| `explore.ts` | List files in Dropbox via API |

## Conventions

See CONVENTIONS.md for naming, file organization, and coding patterns.
