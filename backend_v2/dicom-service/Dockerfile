# ==========================================
# STAGE 1: BUILDER
# ==========================================
FROM python:3.12-slim AS builder
WORKDIR /app
COPY requirements.txt .
RUN pip wheel --no-cache-dir --no-deps --wheel-dir /app/wheels -r requirements.txt

# ==========================================
# STAGE 2: RUNNER (Security & Compliance)
# ==========================================
FROM python:3.12-slim
WORKDIR /app

# HIPAA/GDPR: Create non-root user
RUN groupadd -g 3000 dicomgroup && \
    useradd -u 1000 -g dicomgroup -m dicomuser

COPY --from=builder /app/wheels /wheels
COPY --from=builder /app/requirements.txt .
RUN pip install --no-cache /wheels/*

COPY --chown=dicomuser:dicomgroup . .

# Cloud Run / K8s Port Compatibility
ENV PORT=8005
EXPOSE 8005

# 🛡️ SECURITY: Drop root privileges
USER dicomuser

# Starts Uvicorn on Port 8005 (K8s) OR dynamic $PORT (Cloud Run)
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8005} --workers 2"]