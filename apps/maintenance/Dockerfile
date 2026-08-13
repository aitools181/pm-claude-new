FROM postgres:18-alpine
RUN apk add --no-cache nodejs npm && npm install -g pnpm@9
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @pm/shared build && pnpm --filter @pm/db build
WORKDIR /app/apps/maintenance
ENTRYPOINT ["pnpm", "-s", "exec", "tsx", "src/index.ts"]
CMD []
