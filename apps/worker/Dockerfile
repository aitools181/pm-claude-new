FROM node:20-alpine
RUN corepack enable
WORKDIR /app
COPY . .
RUN apk add --no-cache --virtual .build-deps python3 make g++ \
 && pnpm install --frozen-lockfile \
 && apk del .build-deps
RUN pnpm --filter @pm/shared build \
 && pnpm --filter @pm/db build \
 && pnpm --filter @pm/worker build
WORKDIR /app/apps/worker
CMD ["node", "dist/main.js"]
