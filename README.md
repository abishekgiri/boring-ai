# boring-ai

> Self-hosted AI back office for freelancers  
> Turn receipts into structured expenses in seconds.

---

## What it does

`boring-ai` takes messy receipts and turns them into clean, structured expense data.

- Upload receipts as images or PDFs
- Extract text using OCR
- Convert text into structured fields using AI
- Review and edit extracted data
- Save expenses into a database
- Browse and filter expenses
- Export data to CSV

---

## Features

- Receipt upload for images and PDFs
- OCR with Tesseract
- AI-powered field extraction for vendor, amount, date, and category
- Editable review before saving
- SQLite persistence
- Expense workspace with search and filters
- CSV export
- Delete expenses

---

## How it works

```text
Upload -> OCR -> AI extraction -> Review -> Save -> Browse -> Export
```

---

## Screenshots

Add demo GIFs or screenshots here. This will make the repository much easier to understand at a glance.

---

## Project structure

```text
boring-ai/
├── backend/        # FastAPI backend
├── frontend/       # Next.js frontend
├── examples/
├── .env.example
├── README.md
└── roadmap.md
```

---

## Local setup

### 1. Install OCR tools

macOS:

```bash
brew install tesseract poppler
```

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

Create `frontend/.env.local` with:

```bash
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000
```

Then run:

```bash
cd frontend
npm install
npm run dev
```

Open: [http://localhost:3000](http://localhost:3000)

If `OPENAI_API_KEY` is not set, upload and OCR still work, but AI extraction will not.

---

## Environment variables

### Backend

- `APP_ENV`
- `BACKEND_CORS_ORIGINS`
- `SQLITE_DATABASE_PATH`
- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `OPENAI_API_BASE_URL`
- `OPENAI_TIMEOUT_SECONDS`

### Frontend

- `NEXT_PUBLIC_API_BASE_URL`

Use [`./.env.example`](./.env.example) as the starting point.

---

## Deploy with Render and Vercel

The cleanest setup for the current codebase is:

- Render for the FastAPI backend
- Vercel for the Next.js frontend

This repo includes [`render.yaml`](./render.yaml) for the backend side.

### Why this split makes sense

- the frontend is a standard Next.js app, which fits Vercel well
- the backend needs OCR system packages like Tesseract and Poppler, which is why the Render backend uses Docker
- the backend also needs persistent storage for SQLite and uploaded files

### Render backend

The Render backend uses:

- [`render.yaml`](./render.yaml)
- [`backend/Dockerfile`](./backend/Dockerfile)
- one persistent disk mounted for uploads and SQLite

#### Render setup steps

1. Push the repo to GitHub.
2. In Render, create a new Blueprint and select this repository.
3. Let Render detect [`render.yaml`](./render.yaml).
4. Fill in the required environment variables:
   - `OPENAI_API_KEY`
   - `BACKEND_CORS_ORIGINS`
5. Deploy the backend service.

#### Render values to set

- `BACKEND_CORS_ORIGINS`
  Set this to your Vercel frontend URL, for example `https://boring-ai.vercel.app`

### Vercel frontend

For Vercel, import the same GitHub repository and set the project root directory to `frontend`.

#### Vercel setup steps

1. In Vercel, create a new project from this repository.
2. Set the root directory to `frontend`.
3. Add the environment variable:
   - `NEXT_PUBLIC_API_BASE_URL`
4. Deploy the frontend.

#### Vercel value to set

- `NEXT_PUBLIC_API_BASE_URL`
  Set this to your Render backend URL, for example `https://boring-ai-api.onrender.com`

### Important notes

- the backend is on a paid Render plan because persistent disk is required for SQLite and uploads
- the backend will not have zero-downtime deploys while that persistent disk is attached
- Vercel preview deployments will need matching backend CORS rules if you want previews to talk to the live backend
- this is a solid early deployment setup, but a later production setup should move from SQLite plus local uploads to Postgres plus object storage

---

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

---

## V1 scope

This project intentionally stays simple:

- upload receipts
- extract OCR text
- convert OCR text to structured data
- review and edit fields
- save expenses
- browse and filter expenses
- export CSV

---

## Current status

Completed so far:

- Phase 1: frontend and backend scaffold with health check
- Phase 2: receipt upload, local storage, and preview
- Phase 3: OCR flow
- Phase 4: AI extraction and editable review
- Phase 5: save reviewed expenses to SQLite
- Phase 6: expense workspace with search and filters
- Phase 7: CSV export and delete action

---

## Privacy notes

- uploaded files stay on the local filesystem under `backend/uploads/files/`
- upload metadata stays under `backend/uploads/metadata/`
- saved expenses are stored in local SQLite
- AI extraction currently uses the OpenAI API
- local model support is planned later

---

## Roadmap

See [`./roadmap.md`](./roadmap.md).

Planned:

- edit expense
- multi-user support
- bank CSV import
- mobile support
- better OCR accuracy
- UI improvements

---

## Contributing

See `CONTRIBUTING.md` for setup, workflow, and pull request guidelines.

---

## Why this exists

Managing receipts is boring.

This project automates the boring parts so freelancers can focus on real work.

---

## License

MIT. See [`LICENSE`](./LICENSE).
