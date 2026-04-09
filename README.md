# boring-ai

Self-hosted AI back office for freelancers.

`boring-ai` turns receipt files into structured expenses you can review, save, browse, clean up, and export. The product stays intentionally narrow for V1: upload receipts, run OCR, extract the key fields with AI, save the result, and export accountant-friendly CSV.

## What works today

- upload receipt images and PDFs
- preview uploaded files in the UI
- run OCR with Tesseract on images and PDFs
- extract `vendor`, `amount`, `date`, and `category` with OpenAI
- review and edit extracted fields before save
- save expenses to local SQLite
- browse all saved expenses in a dedicated workspace
- search by vendor
- filter by category and date range
- export the current filtered workspace as CSV
- delete bad records from the workspace

## Product direction

**V1 promise**

Upload receipts -> extract data -> organize expenses -> export CSV

**First target user**

Freelancers

**What V1 is not**

- not a full accounting system
- not a tax filing tool
- not multi-user yet
- not local-model-first yet

## Current flow

1. Upload a receipt image or PDF.
2. Run OCR to extract the raw text.
3. Send OCR text to the extraction endpoint.
4. Review and correct the AI-filled fields.
5. Save the expense into SQLite.
6. Open the expense workspace to search, filter, export, or delete records.

## Stack

- Frontend: Next.js
- Backend: FastAPI
- Database: SQLite
- OCR: Tesseract + pdf2image
- AI extraction: OpenAI API
- Storage: local filesystem under `backend/uploads/`

## Project status

Phases completed so far:

- Phase 1: frontend/backend scaffold + health check
- Phase 2: receipt upload + local storage + preview
- Phase 3: OCR flow
- Phase 4: AI extraction + editable review
- Phase 5: save reviewed expenses to SQLite
- Phase 6: expense workspace with search and filters
- Phase 7: CSV export + delete action

## Quick start

### Prerequisites

- Python 3.9+
- Node.js 20+
- `tesseract`
- `poppler`
- an OpenAI API key if you want to use the extraction step

On macOS:

```bash
brew install tesseract poppler
```

### 1. Configure environment variables

Copy values from [`./.env.example`](./.env.example).

Backend env vars:

- `APP_ENV`
- `BACKEND_CORS_ORIGINS`
- `SQLITE_DATABASE_PATH`
- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `OPENAI_API_BASE_URL`
- `OPENAI_TIMEOUT_SECONDS`

Frontend env vars:

- `NEXT_PUBLIC_API_BASE_URL`

Create `frontend/.env.local` with:

```bash
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000
```

If `OPENAI_API_KEY` is not set, uploads and OCR still work, but `POST /api/uploads/{id}/extract` will return an error until extraction is configured.

### 2. Start the backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
export APP_ENV=development
export BACKEND_CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
export SQLITE_DATABASE_PATH=backend/data/boring-ai.db
export OPENAI_API_KEY=your_key_here
export OPENAI_MODEL=gpt-4o-mini
export OPENAI_API_BASE_URL=https://api.openai.com/v1
export OPENAI_TIMEOUT_SECONDS=30
uvicorn app.main:app --reload --port 8000
```

### 3. Start the frontend

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## API overview

### System

- `GET /health`

### Uploads

- `POST /api/uploads`
- `GET /api/uploads/{id}`
- `POST /api/uploads/{id}/ocr`
- `POST /api/uploads/{id}/extract`

### Expenses

- `POST /api/expenses`
- `GET /api/expenses`
- `GET /api/expenses/{id}`
- `GET /api/expenses/export`
- `DELETE /api/expenses/{id}`

## Notes on privacy

- uploaded files are stored locally under `backend/uploads/files/`
- upload metadata is stored locally under `backend/uploads/metadata/`
- expenses are stored in local SQLite
- the current extraction step calls the OpenAI API when you run `POST /api/uploads/{id}/extract`
- local model support is planned later, but not part of the current implementation

## Current limitations

- single-user flow only
- no Docker setup yet
- no invoice generation yet
- extraction depends on an OpenAI API key today

## Repository structure

```text
boring-ai/
├── backend/
│   ├── app/
│   │   ├── core/
│   │   ├── db/
│   │   ├── routes/
│   │   ├── schemas/
│   │   └── services/
│   └── requirements.txt
├── examples/
├── frontend/
│   ├── app/
│   └── components/
├── .env.example
├── README.md
└── roadmap.md
```

## Near-term roadmap

After the current V1 flow, the next likely steps are:

- richer expense detail views and edits
- better extraction quality and retry UX
- Docker and smoother self-hosted setup
- invoice creation in a later milestone
- local model support through Ollama

The detailed phased plan lives in [`./roadmap.md`](./roadmap.md).
