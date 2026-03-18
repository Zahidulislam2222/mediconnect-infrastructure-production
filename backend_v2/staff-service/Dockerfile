# ==========================================
# STAGE 1: BUILDER (The Professional Skeleton)
# ==========================================
FROM node:20-alpine AS builder
WORKDIR /app

# 1. Workspace Skeleton
COPY backend_v2/package.json ./
COPY backend_v2/doctor-service/package.json ./doctor-service/
COPY backend_v2/patient-service/package.json ./patient-service/
COPY backend_v2/booking-service/package.json ./booking-service/
COPY backend_v2/communication-service/package.json ./communication-service/
COPY backend_v2/staff-service/package.json ./staff-service/

# 2. Hoisting Fix
RUN rm -f staff-service/package-lock.json

# 3. Install
RUN npm install

# 4. Copy Code & Build
COPY backend_v2/shared ./shared
COPY backend_v2/staff-service ./staff-service

WORKDIR /app/staff-service
RUN ../node_modules/.bin/tsc --project tsconfig.json

# 5. Prune
WORKDIR /app
RUN npm prune --omit=dev

# ==========================================
# STAGE 2: RUNNER (Security & Compliance)
# ==========================================
FROM node:20-alpine
WORKDIR /app

RUN apk add --no-cache curl

# Security: Non-root user for HIPAA/GDPR compliance
RUN chown -R node:node /app
USER node

# Copy Artifacts
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/staff-service/dist ./dist
COPY --from=builder --chown=node:node /app/staff-service/package*.json ./

ENV NODE_ENV=production
ENV PORT=8086
EXPOSE 8086

CMD sh -c 'if [ -n "$K_SERVICE" ]; then \
      echo "Cloud Run Detected: Bridging OIDC Identity..."; \
      curl -s -H "Metadata-Flavor: Google" "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity?audience=sts.amazonaws.com" > /tmp/aws-token; \
      export AWS_WEB_IDENTITY_TOKEN_FILE=/tmp/aws-token; \
      (while true; do sleep 3000; curl -s -H "Metadata-Flavor: Google" "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity?audience=sts.amazonaws.com" > /tmp/aws-token; done) & \
      echo "Token bridged & background auto-refresh started!"; \
    fi; \
    node dist/staff-service/src/index.js'
