FROM node:20-alpine
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile=false
RUN pnpm --filter @pm/shared build \
 && pnpm --filter @pm/db build \
 && pnpm --filter @pm/worker build
WORKDIR /app/apps/worker
CMD ["node", "dist/main.js"]
