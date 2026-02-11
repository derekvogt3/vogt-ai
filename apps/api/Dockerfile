FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile

COPY apps/api/ apps/api/

EXPOSE 3000
CMD ["pnpm", "--filter", "@vogt-ai/api", "build"]
