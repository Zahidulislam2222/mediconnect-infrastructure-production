# ==========================================
# STAGE 1: BUILDER
# ==========================================
FROM node:20-alpine AS builder
WORKDIR /app

# 1. COPY MANIFESTS
COPY backend_v2/package.json ./
COPY backend_v2/doctor-service/package.json ./doctor-service/
COPY backend_v2/patient-service/package.json ./patient-service/
COPY backend_v2/booking-service/package.json ./booking-service/
COPY backend_v2/communication-service/package.json ./communication-service/

# 2. THE WORKING FIX: IGNORE LOCKFILES & FLAT INSTALL
RUN rm -f package-lock.json
RUN rm -f communication-service/package-lock.json

RUN npm install

# 3. COPY SOURCE CODE
COPY backend_v2/shared ./shared
COPY backend_v2/communication-service ./communication-service

# 4. BUILD
WORKDIR /app/communication-service
RUN ../node_modules/.bin/tsc --project tsconfig.json

# 5. PRUNE
WORKDIR /app
RUN npm prune --omit=dev 

# ==========================================
# STAGE 2: RUNNER
# ==========================================
FROM node:20-alpine
WORKDIR /app

RUN apk add --no-cache curl

RUN chown -R node:node /app
USER node

# 6. COPY ARTIFACTS
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/communication-service/dist ./dist
COPY --from=builder --chown=node:node /app/communication-service/package*.json ./

ENV NODE_ENV=production
ENV PORT=8084
EXPOSE 8084

CMD sh -c 'if [ -n "$K_SERVICE" ]; then \
      echo "☁️ Cloud Run Detected: Bridging OIDC Identity..."; \
      # 1. SYNCHRONOUS FETCH: Wait until token is 100% downloaded \
      curl -s -H "Metadata-Flavor: Google" "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity?audience=sts.amazonaws.com" > /tmp/aws-token; \
      export AWS_WEB_IDENTITY_TOKEN_FILE=/tmp/aws-token; \
      # 2. BACKGROUND REFRESH: Start the auto-renewal loop \
      (while true; do sleep 3000; curl -s -H "Metadata-Flavor: Google" "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity?audience=sts.amazonaws.com" > /tmp/aws-token; done) & \
      echo "✅ Token bridged & background auto-refresh started!"; \
    fi; \
    node dist/communication-service/src/index.js'