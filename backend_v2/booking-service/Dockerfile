# ==========================================
# STAGE 1: BUILDER (The Professional Skeleton)
# ==========================================
FROM node:20-alpine AS builder
WORKDIR /app

# 1. THE PROFESSIONAL FIX: Workspace Skeleton
# We copy all manifests to ensure the NPM dependency tree is calculated correctly.
COPY backend_v2/package.json ./
COPY backend_v2/doctor-service/package.json ./doctor-service/
COPY backend_v2/patient-service/package.json ./patient-service/
COPY backend_v2/booking-service/package.json ./booking-service/
COPY backend_v2/communication-service/package.json ./communication-service/

# 2. THE HOISTING FIX: Force Root node_modules
RUN rm -f booking-service/package-lock.json

# 3. INSTALL
# We use 'npm install' to resolve a fresh, flat tree in the cloud build context.
RUN npm install

# 4. COPY CODE & BUILD
COPY backend_v2/shared ./shared
COPY backend_v2/booking-service ./booking-service

WORKDIR /app/booking-service
RUN ../node_modules/.bin/tsc --project tsconfig.json

# 5. PRUNE (Optimization)
WORKDIR /app
RUN npm prune --omit=dev 

# ==========================================
# STAGE 2: RUNNER (Security & Compliance)
# ==========================================
FROM node:20-alpine
WORKDIR /app

RUN apk add --no-cache curl

# 6. SECURITY: Non-root user for HIPAA/GDPR compliance
RUN chown -R node:node /app
USER node

# 7. COPY ARTIFACTS
# We copy from the root /app/node_modules to ensure all hoisted packages are included.
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/booking-service/dist ./dist
COPY --from=builder --chown=node:node /app/booking-service/package*.json ./

ENV NODE_ENV=production
ENV PORT=8083
EXPOSE 8083

CMD sh -c 'if [ -n "$K_SERVICE" ]; then \
      echo "☁️ Cloud Run Detected: Bridging OIDC Identity..."; \
      # 1. SYNCHRONOUS FETCH: Wait until token is 100% downloaded \
      curl -s -H "Metadata-Flavor: Google" "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity?audience=sts.amazonaws.com" > /tmp/aws-token; \
      export AWS_WEB_IDENTITY_TOKEN_FILE=/tmp/aws-token; \
      # 2. BACKGROUND REFRESH: Start the auto-renewal loop \
      (while true; do sleep 3000; curl -s -H "Metadata-Flavor: Google" "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity?audience=sts.amazonaws.com" > /tmp/aws-token; done) & \
      echo "✅ Token bridged & background auto-refresh started!"; \
    fi; \
    node dist/booking-service/src/index.js'