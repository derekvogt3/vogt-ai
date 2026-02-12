FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9 --activate

# Install all dependencies
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile

# Copy source
COPY apps/api/ apps/api/
COPY apps/web/ apps/web/

# Build the React frontend
RUN pnpm --filter @vogt-ai/web build

# Copy built frontend into API's static directory
RUN cp -r apps/web/dist apps/api/static

EXPOSE 3000
CMD ["pnpm", "--filter", "@vogt-ai/api", "build"]
