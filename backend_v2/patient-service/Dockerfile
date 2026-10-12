# ==========================================
# STAGE 1: BUILDER (The Professional Skeleton)
# ==========================================
ARG NODE_VERSION
FROM node:${NODE_VERSION} AS builder
WORKDIR /app

# 1. THE PROFESSIONAL FIX: Workspace Skeleton
# We copy all manifests to ensure the NPM dependency tree is calculated correctly.
COPY backend_v2/package.json ./
COPY backend_v2/doctor-service/package.json ./doctor-service/
COPY backend_v2/patient-service/package.json ./patient-service/
COPY backend_v2/booking-service/package.json ./booking-service/
COPY backend_v2/communication-service/package.json ./communication-service/
COPY backend_v2/staff-service/package.json ./staff-service/

# 2. THE HOISTING FIX: Force Root node_modules
COPY backend_v2/package-lock.json ./

# 3. INSTALL
# Install the reviewed workspace dependency graph without changing its lock.
RUN npm ci --include=dev --no-audit --no-fund

# 4. COPY CODE & BUILD
COPY backend_v2/shared ./shared
COPY backend_v2/patient-service/tsconfig.json ./patient-service/
COPY backend_v2/patient-service/src ./patient-service/src

WORKDIR /app/patient-service
RUN ../node_modules/.bin/tsc --project tsconfig.json

# 5. PRUNE (Optimization)
FROM builder AS production-dependencies
WORKDIR /app
RUN npm prune --omit=dev --no-audit --no-fund

# ==========================================
# STAGE 2: RUNNER (Security & Compliance)
# ==========================================
FROM node:${NODE_VERSION}
WORKDIR /app/patient-service

RUN command -v curl

# 6. Run the application as a non-root user
RUN chown -R node:node /app
USER node

# 7. COPY ARTIFACTS
# We copy from the root /app/node_modules to ensure all hoisted packages are included.
COPY --from=production-dependencies --chown=node:node /app/node_modules /app/node_modules
COPY --from=production-dependencies --chown=node:node /app/patient-service/node_modules ./node_modules
COPY --from=production-dependencies --chown=node:node /app/patient-service/dist ./dist
COPY --from=production-dependencies --chown=node:node /app/patient-service/package*.json ./

ENV NODE_ENV=production

COPY --chown=node:node backend_v2/shared/runtime ./runtime
CMD ["node", "runtime/federation-entrypoint.mjs", "dist/patient-service/src/index.js"]
