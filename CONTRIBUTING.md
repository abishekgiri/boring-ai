# Contributing to boring-ai

Thanks for your interest in contributing to `boring-ai`.

`boring-ai` is a self-hosted AI back office for freelancers. The goal is to keep the project practical, simple, and easy to work on. Small, focused improvements are better than large unclear changes.

## Contribution rules

- keep changes small and focused, with one feature or fix per pull request
- do not mix multiple unrelated changes in one pull request
- open an issue first for large features or major changes
- prefer simple and readable code over complex solutions
- do not introduce heavy dependencies without discussion
- keep the existing structure and patterns consistent
- reuse existing logic instead of duplicating code
- validate inputs properly in both backend and frontend changes
- handle error, loading, and empty states clearly in UI work
- do not break the core flow: upload -> OCR -> extract -> save -> workspace
- write clear and descriptive commit messages
- remove debug code such as `console.log` or `print` statements before submitting
- do not commit secrets or local environment files
- ensure the project builds successfully before submitting a pull request
- add a short note on how your change was tested
- include screenshots in the pull request for UI changes
- stay respectful and constructive in discussions

## Ways to contribute

You can help by:

- fixing bugs
- improving the UI
- improving OCR or extraction reliability
- improving documentation
- adding tests
- suggesting product improvements
- improving developer experience and setup

## Before you start

Please:

1. Check existing issues and pull requests first.
2. Open an issue before starting large changes.
3. Keep pull requests small and focused.
4. Avoid mixing unrelated changes in one pull request.

Good first contributions include:

- UI polish
- better empty and loading states
- validation improvements
- README improvements
- bug fixes
- CSV export improvements
- OCR edge-case handling

## Development setup

### Requirements

- Node.js 20+
- Python 3.9+
- Tesseract OCR
- Poppler
- OpenAI API key for extraction-related work

### Install OCR tools

#### macOS

```bash
brew install tesseract poppler
```

### Run the backend

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

### Run the frontend

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

Then open `http://localhost:3000`.

## Environment variables

Set up values from `.env.example`.

Backend variables include:

- `APP_ENV`
- `BACKEND_CORS_ORIGINS`
- `SQLITE_DATABASE_PATH`
- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `OPENAI_API_BASE_URL`
- `OPENAI_TIMEOUT_SECONDS`

Frontend variables include:

- `NEXT_PUBLIC_API_BASE_URL`

## Project structure

```text
boring-ai/
├── backend/
├── frontend/
├── examples/
├── .env.example
├── CONTRIBUTING.md
├── README.md
└── roadmap.md
```

## Branch naming

Use short, descriptive branch names.

Examples:

- `fix/upload-validation`
- `feat/csv-export`
- `feat/expense-delete`
- `docs/readme-update`

## Commit style

Use clear commit messages.

Examples:

- `feat: add filtered expense listing API`
- `feat: add expense workspace with search and filters`
- `fix: handle invalid date range in export route`
- `docs: improve local setup instructions`

## Pull request guidelines

Please make sure your pull request:

- has a clear title
- explains what changed
- explains why the change is needed
- includes testing notes
- stays focused on one main change

A good pull request description includes:

- summary
- files changed
- how it was tested
- screenshots if UI changed

## Testing

Before opening a pull request, run the relevant checks.

### Backend

```bash
cd backend
.venv/bin/python -m compileall app
```

### Frontend

```bash
cd frontend
npx next build --webpack
```

If your change affects OCR, extraction, saving, filtering, export, or delete flows, include a short note about how you verified it.

Examples:

- uploaded a sample receipt and confirmed OCR output
- saved an expense and fetched it back
- checked search, category, and date filters
- exported filtered CSV successfully
- deleted an expense and verified row removal

## Code style

### General

- prefer simple code over clever code
- keep functions small and readable
- avoid unnecessary abstractions
- keep changes scoped to the phase or feature

### Backend

- keep route validation strict and explicit
- return clear error responses
- reuse filtering and query logic where possible

### Frontend

- keep UI responsive and easy to understand
- handle loading, empty, success, and error states clearly
- avoid adding large dependencies without a good reason

## Issues

When opening an issue, please include:

- what you expected
- what happened instead
- steps to reproduce
- screenshots or logs if helpful

For feature requests, explain:

- the use case
- why it helps users
- the smallest useful version of the feature

## Security

Please do not open public issues for sensitive security problems.

Instead, contact the maintainer privately if you discover a serious vulnerability.

## Scope

The project is intentionally focused.

Current core flow:

- upload receipt
- OCR
- AI extraction
- review and edit
- save
- browse and filter
- export CSV
- delete bad records

Please avoid opening large pull requests for unrelated features without discussing them first.

Examples of things that should usually be discussed first:

- authentication
- multi-user support
- major database changes
- cloud storage
- background job systems
- full redesigns

## Need help?

If something is unclear, open an issue and describe what you want to work on.

Clear, small contributions are always appreciated.

Thanks for contributing to `boring-ai`.
