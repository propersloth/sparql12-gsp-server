# syntax=docker/dockerfile:1

# ============== Build Stage ==============
FROM node:26-alpine AS builder

WORKDIR /app

# Install full dependency set (including devDependencies) so the
# TypeScript compiler is available for the build below.
COPY package.json package-lock.json ./
RUN npm ci

# Production build config (tsconfig.prod.json) is separate from the
# dev/CI build config (tsconfig.build.json) -- see npm run build:prod.
COPY tsconfig.json tsconfig.prod.json ./
COPY src ./src

RUN npm run build:prod

# ============== Production Stage ==============
FROM node:26-alpine AS production

LABEL org.opencontainers.image.title="GSP Server"
LABEL org.opencontainers.image.description="SPARQL 1.2 Graph Store Protocol Server"
LABEL org.opencontainers.image.source="https://github.com/propersloth/sparql12-gsp-server"
LABEL org.opencontainers.image.licenses="MIT"

# Non-root user for the runtime process.
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nestjs -u 1001 -G nodejs

WORKDIR /app

# Fresh, production-only install -- deliberately not copied over from the
# builder stage's node_modules, which also contains devDependencies.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder --chown=nestjs:nodejs /app/dist ./dist

USER nestjs

EXPOSE 3000

ENV NODE_ENV=production
ENV GSP_AUTH_ENABLED=true

# Matches src/health/health.controller.ts, which is unauthenticated and
# does not touch the database.
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# Let container runtimes (Docker/Compose/Kubernetes) signal shutdown with
# SIGTERM; combined with app.enableShutdownHooks() in src/main.ts this
# lets Nest run onModuleDestroy (e.g. closing the TypeORM connection)
# before the process exits.
STOPSIGNAL SIGTERM

CMD ["node", "dist/main.js"]
