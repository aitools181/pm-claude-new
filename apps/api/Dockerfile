FROM node:20-alpine
RUN corepack enable
WORKDIR /app
COPY . .
RUN apk add --no-cache --virtual .build-deps python3 make g++ \
 && pnpm install --frozen-lockfile \
 && apk del .build-deps
# Build workspace libraries first, then the API (compiled to dist).
RUN pnpm --filter @pm/shared build \
 && pnpm --filter @pm/db build \
 && pnpm --filter @pm/api build
WORKDIR /app/apps/api
EXPOSE 4000
CMD ["node", "dist/main.js"]
