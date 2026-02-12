# CLAUDE.md

## Project Overview

vogt-ai is a full-stack TypeScript AI chat application that streams responses from Anthropic Claude. Built as a pnpm monorepo with a Hono API backend and React frontend, deployed as a single service on Railway.

## Tech Stack

- **Frontend**: React 19 + Vite 6 + Tailwind CSS 4
- **Backend**: Hono 4 on Node.js 22 (`@hono/node-server`)
- **LLM**: Anthropic Claude (`@anthropic-ai/sdk`, model: `claude-sonnet-4-5-20250929`)
- **Validation**: Zod
- **Runtime**: tsx (TypeScript execution without build step)
- **Package manager**: pnpm with workspaces

## Architecture

```
vogt-ai/
├── apps/
│   ├── api/          # Hono backend — serves API + static frontend
│   │   └── src/
│   │       ├── index.ts           # App entry, middleware, static file serving
│   │       ├── env.ts             # Zod-validated environment variables
│   │       └── routes/
│   │           └── chat-routes.ts # POST /api/chat (SSE streaming)
│   └── web/          # React frontend — built and served by the API
│       └── src/
│           ├── App.tsx
│           ├── main.tsx
│           ├── api/client.ts      # SSE stream parser (async generator)
│           ├── hooks/use-chat.ts  # Chat state + streaming hook
│           └── components/
│               ├── ChatArea.tsx    # Main chat UI
│               └── MessageBubble.tsx
├── package.json
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

### Single-service deployment

In production, the Hono API serves both `/api/*` routes AND the built React app as static files. There is no separate frontend service. The build script (`apps/api/package.json` → `build`) builds the React app and copies it to `apps/api/static/`.

### Data flow

1. User types message → React state holds full conversation history
2. Frontend POSTs to `/api/chat` with all messages (no database, stateless)
3. Hono validates with Zod, calls Claude SDK with `stream: true`
4. Tokens stream back via SSE (`streamSSE` helper)
5. Frontend async generator parses SSE, React hook accumulates tokens

## Development

```bash
pnpm dev          # Runs both API (port 3000) and Vite (port 5173) in parallel
```

- Vite dev server proxies `/api` to `localhost:3000` (configured in `vite.config.ts`)
- API loads env vars from root `.env` via `--env-file=../../.env` flag
- Frontend hot-reloads via Vite, API hot-reloads via `tsx watch`

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | — | Anthropic API key |
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

## API Endpoints

| Method | Path | Description |
|---|---|---|
| POST | `/api/chat` | Stream chat response (SSE). Body: `{ messages: [{ role, content }] }` |
| GET | `/api/health` | Health check → `{ status: "ok" }` |

## Key Patterns

- **SSE streaming**: Backend uses Hono `streamSSE`, frontend uses `ReadableStream` + async generator
- **Stateless**: No database yet. Conversation history sent with each request from client state
- **Thin routes**: Route handlers validate input → call SDK → return response
- **Zod everywhere**: Request validation, env var validation, error middleware catches ZodError

## Planned Next Steps

- Authentication (login/register with JWT)
- PostgreSQL persistence (conversations, messages)
- Odoo integration (read-only data pull)
- Vector search with pgvector (RAG)

## Conventions

See CONVENTIONS.md for naming, file organization, and coding patterns.
