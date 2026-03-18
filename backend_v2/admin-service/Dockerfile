# ==========================================
# STAGE 1: BUILDER
# ==========================================
FROM python:3.12-slim AS builder
WORKDIR /app
COPY backend_v2/admin-service/requirements.txt .
RUN pip wheel --no-cache-dir --no-deps --wheel-dir /app/wheels -r requirements.txt

# ==========================================
# STAGE 2: RUNNER (Security & Compliance)
# ==========================================
FROM python:3.12-slim
WORKDIR /app

# HIPAA/GDPR: Create non-root user
RUN groupadd -g 3000 admingroup && \
    useradd -u 1000 -g admingroup -m adminuser

COPY --from=builder /app/wheels /wheels
COPY --from=builder /app/requirements.txt .
RUN pip install --no-cache /wheels/*

COPY --chown=adminuser:admingroup backend_v2/admin-service/ .

# Cloud Run / K8s Port Compatibility
ENV PORT=8085
EXPOSE 8085

# Security: Drop root privileges
USER adminuser

CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8085} --workers 2"]
