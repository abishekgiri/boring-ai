# boring-ai

Self-hosted AI back office for freelancers.

Turn receipts into structured expenses in seconds.

## Phase 1 status

Phase 1 sets up the project foundation:

- `frontend/` contains the Next.js app
- `backend/` contains the FastAPI service
- `GET /health` confirms the backend is running
- the frontend homepage checks the backend health endpoint

## Phase 2 status

Phase 2 adds the first user-facing workflow:

- `POST /api/uploads` accepts receipt images and PDFs
- uploads are validated and stored locally under `backend/uploads/`
- upload metadata is persisted for later lookup
- the frontend upload page shows upload state, errors, and file preview

## Phase 3 status

Phase 3 adds the first OCR pass:

- `POST /api/uploads/{id}/ocr` runs OCR on a stored receipt
- image uploads go directly through Tesseract
- PDF uploads are converted to images and OCR'd page by page
- raw OCR text is returned to the frontend and stored in upload metadata

## Phase 4 status

Phase 4 adds AI field extraction:

- `POST /api/uploads/{id}/extract` sends stored OCR text to OpenAI
- extraction returns `vendor`, `amount`, `date`, and `category`
- extracted fields are stored back in upload metadata
- the frontend shows an editable review form before save

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

### 1. Install OCR system tools

On macOS:

```bash
brew install tesseract poppler
```

### 2. Start the backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
export OPENAI_API_KEY=your_key_here
uvicorn app.main:app --reload --port 8000
```

### 3. Start the frontend

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
- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `OPENAI_API_BASE_URL`
- `OPENAI_TIMEOUT_SECONDS`

### Frontend

- `NEXT_PUBLIC_API_BASE_URL`

## Roadmap

The phased execution plan lives in `roadmap.md`.
