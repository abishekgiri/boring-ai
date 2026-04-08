# boring-ai

Self-hosted AI back office for freelancers.

Turn receipts into structured expenses in seconds.

## Phase 1 status

Phase 1 sets up the project foundation:

- `frontend/` contains the Next.js app
- `backend/` contains the FastAPI service
- `GET /health` confirms the backend is running
- the frontend homepage checks the backend health endpoint

## V1 scope

The first version stays intentionally small:

- upload receipt images or PDFs
- extract OCR text
- convert OCR text into structured fields
- let the user edit those fields
- save expenses
- list and filter expenses
- export CSV

## Project structure

```text
boring-ai/
├── backend/
├── examples/
├── frontend/
├── .env.example
├── README.md
└── roadmap.md
```

## Local setup

### 1. Start the backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### 2. Start the frontend

```bash
cd frontend
cp ../.env.example .env.local
npm install
npm run dev
```

Then open `http://localhost:3000`.

## Environment variables

Use `.env.example` as the starting point.

### Backend

- `APP_ENV`
- `BACKEND_CORS_ORIGINS`

### Frontend

- `NEXT_PUBLIC_API_BASE_URL`

## Roadmap

The phased execution plan lives in `roadmap.md`.
