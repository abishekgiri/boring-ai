from __future__ import annotations

from datetime import datetime, timezone

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.core.config import get_settings
from app.routes.uploads import router as uploads_router


settings = get_settings()


app = FastAPI(
    title="boring-ai backend",
    version="0.2.0",
    description="Upload and preview foundation for the boring-ai freelancer back office.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.cors_origins),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount(
    settings.uploads_public_path,
    StaticFiles(directory=settings.uploads_files_dir),
    name="uploads",
)
app.include_router(uploads_router)


@app.get("/health", tags=["system"])
def health() -> dict[str, str]:
    return {
        "status": "ok",
        "service": "boring-ai-backend",
        "environment": settings.app_env,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
