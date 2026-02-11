# CONVENTIONS

## Architecture
- Monorepo: pnpm workspaces. Two packages: @vogt-ai/web (Vite React), @vogt-ai/api (Hono).
- Single language: TypeScript end-to-end.
- Conversation history lives in React state (client-side). Sent with each API request.

## File Organization
- Colocate related code. One file per domain concept where possible.
- Flat route files in apps/api/src/routes/.
- Frontend components in apps/web/src/components/.

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
