# CONVENTIONS

## Architecture
- Monorepo: pnpm workspaces. Three packages: @vogt-ai/web (Vite React), @vogt-ai/api (Hono), @vogt-ai/marketing (Astro).
- Single language: TypeScript end-to-end.
- Multi-service platform: each client/project gets its own services/<name>/ directory on both API and frontend.
- Access control: requireService(slug) middleware on API + ServiceRoute component on frontend.

## File Organization
- Colocate related code. One file per domain concept where possible.
- Platform routes in apps/api/src/routes/ (auth, admin, services).
- Platform components in apps/web/src/components/.
- Per-service code in apps/api/src/services/<name>/ (schema, routes, scripts).
- Per-service frontend in apps/web/src/services/<name>/ (pages, API clients).
- Service tables use name-prefixed tables (e.g., rlc_documents) for isolation.
- Each service has its own schema.ts picked up by Drizzle's glob config.

## Naming
- Files: kebab-case (e.g., chat-routes.ts, use-chat.ts).
- Types/interfaces: PascalCase.
- Zod schemas: camelCase suffixed with Schema.

## Patterns
- API route handlers are thin: validate input, call service/SDK, return response.
- Streaming responses use Hono streamSSE helper.
- Frontend uses async generators to consume SSE streams.
- Environment variables validated with Zod on startup.

## Error Handling
- Hono HTTPException for API errors.
- Zod .parse() for validation (throws on failure, caught by error middleware).

## Dependencies
- Never add a dependency without checking if existing deps solve the problem.
- Prefer built-in Node/Hono functionality over third-party packages.
