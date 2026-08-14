FROM node:20-alpine
RUN corepack enable
WORKDIR /app
COPY . .
RUN apk add --no-cache --virtual .build-deps python3 make g++ \
 && pnpm install --frozen-lockfile \
 && apk del .build-deps
# next.config.mjs evaluates rewrites() during `next build` and bakes the
# destination into .next/routes-manifest.json - it is NOT read from the
# environment at runtime. Without this the destination is baked as
# http://localhost:4000, so the running container proxies /api and /socket.io to
# itself, and every API call returns a plain-text 500 ("Request failed" in the UI).
ARG INTERNAL_API_URL=http://api:4000
ENV INTERNAL_API_URL=$INTERNAL_API_URL
RUN pnpm --filter @pm/shared build \
 && pnpm --filter @pm/db build \
 && pnpm --filter @pm/web build \
 && node -e "const m=require('/app/apps/web/.next/routes-manifest.json');const r=m.rewrites.afterFiles.find(x=>x.source==='/api/:path*');if(!r||r.destination.includes('localhost'))throw new Error('rewrite baked wrong: '+(r&&r.destination));console.log('rewrite ok ->',r.destination)"
WORKDIR /app/apps/web
EXPOSE 3000
CMD ["pnpm", "start"]
