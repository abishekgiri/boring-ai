from __future__ import annotations

import os
from datetime import datetime, timezone

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware


def parse_cors_origins() -> list[str]:
    raw_value = os.getenv(
        "BACKEND_CORS_ORIGINS",
        "http://localhost:3000,http://127.0.0.1:3000",
    )
    return [origin.strip() for origin in raw_value.split(",") if origin.strip()]


app = FastAPI(
    title="boring-ai backend",
    version="0.1.0",
    description="Phase 1 API scaffold for the boring-ai freelancer back office.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=parse_cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", tags=["system"])
def health() -> dict[str, str]:
    return {
        "status": "ok",
        "service": "boring-ai-backend",
        "environment": os.getenv("APP_ENV", "development"),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

