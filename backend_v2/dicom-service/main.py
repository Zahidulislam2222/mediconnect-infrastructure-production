
from fastapi import FastAPI
from routers import imaging

app = FastAPI(title="MediConnect DICOM Service", version="1.0.0")

app.include_router(imaging.router, prefix="/api/v1")

@app.get("/health")
def health_check():
    return {"status": "UP", "service": "dicom-worker"}