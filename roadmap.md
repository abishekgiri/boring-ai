# boring-ai roadmap

## Product direction

**Brand:** boring-ai

**Tagline:** Self-hosted AI back office for freelancers

**V1 promise:** Upload receipts -> extract data -> organize expenses -> export CSV

## Target user

Start with one user type only:

- freelancers

## What V1 does

V1 should only solve this core flow:

1. Upload a receipt image or PDF
2. Extract raw OCR text
3. Use AI to extract structured fields
4. Let the user edit those fields
5. Save the expense
6. Show saved expenses in a list
7. Export expenses as CSV

## Structured fields for V1

Extract only:

- vendor
- amount
- date
- category

## What is not in V1

Do not build these in the first version:

- invoices
- PDF generation
- auth
- multi-user support
- complex settings
- background workers
- full accounting features
- tax-ready marketing claims
- fully private AI claims while using hosted APIs

## Product principles

These rules should guide every implementation choice:

1. Always allow manual editing before save.
2. Speed and usefulness matter more than perfect extraction.
3. Make one flow feel magical: upload -> auto-fill -> save.
4. Avoid unnecessary complexity.

## Tech stack

### Frontend

- Next.js
- Tailwind CSS

### Backend

- FastAPI

### Database

- SQLite

### OCR

- Tesseract

### AI extraction

- OpenAI API for V1
- Ollama or local models later

## Repo structure

Keep the repo simple:

```text
boring-ai/
├── frontend/
├── backend/
├── examples/
├── .env.example
├── docker-compose.yml
└── README.md
```

## Core user flow

### Receipt flow

1. User opens the app
2. User uploads a receipt image or PDF
3. Backend stores the file locally
4. OCR extracts raw text
5. AI converts OCR text into structured fields
6. Frontend shows editable fields
7. User corrects anything needed
8. User saves the expense
9. Expense appears in the expense list
10. User exports CSV when needed

## Simple API map

### Health

- `GET /health`

### Uploads

- `POST /api/uploads`
- `GET /api/uploads/{id}`

### OCR and extraction

- `POST /api/uploads/{id}/ocr`
- `POST /api/uploads/{id}/extract`

### Expenses

- `POST /api/expenses`
- `GET /api/expenses`
- `GET /api/expenses/{id}`
- `PUT /api/expenses/{id}`

### Export

- `GET /api/expenses/export/csv`

## Data model

### Expense

- `id`
- `file_path`
- `vendor_name`
- `amount`
- `expense_date`
- `category`
- `raw_ocr_text`
- `created_at`

## Build order

### Step 1: Setup

- create repo structure
- initialize Next.js frontend
- initialize FastAPI backend
- add health endpoint
- connect frontend to backend

Goal: app runs locally

### Step 2: Upload system

- build upload UI
- create upload API
- save files locally
- show file preview

Goal: user can upload a receipt

### Step 3: OCR

- integrate Tesseract
- extract raw text from uploaded file
- return OCR text to frontend
- show OCR output

Goal: upload -> see text

### Step 4: AI extraction

- send OCR text to the LLM
- validate JSON response
- map output to `vendor`, `amount`, `date`, `category`

Goal: receipt becomes structured data

### Step 5: Editable form

- show extracted fields in the UI
- allow manual corrections
- add save button

Goal: user can review before save

### Step 6: Save to database

- create expenses table
- save file path, OCR text, and extracted fields

Goal: persistence works

### Step 7: Expense list

- build expense table
- add search
- add basic filters

Goal: dashboard is useful

### Step 8: CSV export

- generate CSV from saved expenses
- add frontend download button

Goal: accountant-friendly export

## Execution phases

Use these phases as the actual build sequence for V1.

### Phase 1: Foundation

Focus:

- create `frontend/` and `backend/`
- initialize Next.js and FastAPI
- add environment config
- add a backend health route
- connect frontend to backend

Deliverable:

A running local app where the frontend can reach the backend successfully.

Exit criteria:

- frontend starts locally
- backend starts locally
- `GET /health` works
- frontend shows backend health status

### Phase 2: Receipt ingestion

Focus:

- build the receipt upload UI
- create `POST /api/uploads`
- validate image and PDF uploads
- save files locally
- show upload preview in the frontend

Deliverable:

A user can upload a receipt and preview the stored file.

Exit criteria:

- image upload works
- PDF upload works
- invalid files are rejected
- uploaded file preview is visible

### Phase 3: OCR and AI extraction

Focus:

- integrate Tesseract
- extract raw OCR text from the uploaded file
- display OCR output in the frontend
- send OCR text to OpenAI
- validate structured JSON output
- map the result to `vendor`, `amount`, `date`, and `category`

Deliverable:

The app turns an uploaded receipt into editable structured expense fields.

Exit criteria:

- OCR text is returned for uploaded receipts
- structured extraction runs successfully
- invalid AI output is handled safely
- extracted fields appear in the UI

### Phase 4: Review and save

Focus:

- build the editable extraction form
- allow users to correct extracted data
- create the SQLite expense table
- save file path, OCR text, and structured fields

Deliverable:

The user can review a receipt, fix mistakes, and save it as an expense.

Exit criteria:

- extracted fields are editable
- save action persists data to SQLite
- saved expense can be fetched again
- raw OCR text is stored with the record

### Phase 5: Expense workspace

Focus:

- create the expense list page
- show vendor, amount, date, and category
- add search
- add simple category and date filters

Deliverable:

Users can browse and manage saved expenses in a useful dashboard view.

Exit criteria:

- saved expenses appear in a table
- search works
- filters work
- empty and loading states are handled

### Phase 6: Export and ship

Focus:

- generate CSV export
- add frontend download action
- improve README and setup docs
- add Docker support for local self-hosting
- test the end-to-end flow

Deliverable:

A demoable V1 that can be run locally and used to export expenses.

Exit criteria:

- CSV export works
- README explains local setup
- Docker flow is documented
- upload -> OCR -> extract -> edit -> save -> export works end to end

## Milestones

### Milestone 1: Working receipt-to-expense flow

Scope:

- frontend and backend setup
- receipt upload
- OCR extraction
- AI field extraction
- editable review form
- save expense to SQLite

Success definition:

A user can upload a receipt, see OCR output, review extracted fields, correct
them, and save the expense.

Includes:

- `GET /health`
- `POST /api/uploads`
- OCR pipeline
- AI extraction pipeline
- save expense flow
- basic expense detail fetch

Demo story:

Upload a receipt, watch the app extract vendor, amount, date, and category, fix
any errors, and save it as an expense.

### Milestone 2: Useful expense workspace

Scope:

- expense list page
- search
- category filter
- date filter
- basic loading and empty states

Success definition:

A user can browse previously saved expenses and quickly find what they need.

Includes:

- `GET /api/expenses`
- search by vendor
- filter by category
- filter by date
- responsive expense table

Demo story:

Open the workspace, view all saved expenses, and filter or search them like a
real bookkeeping tool.

### Milestone 3: Accountant-friendly export

Scope:

- CSV export
- export button in frontend
- export formatting cleanup
- README polish
- Docker setup
- end-to-end testing

Success definition:

A user can export saved expenses into a CSV file that is easy to review and
share with an accountant.

Includes:

- `GET /api/expenses/export/csv`
- frontend download action
- documented local setup
- documented Docker setup
- tested full flow

Demo story:

Upload receipts, save them as structured expenses, then export the dataset in
one click.

## Suggested V1 definition

V1 is complete when all of this works:

- upload receipt
- run OCR
- extract structured fields
- let user edit fields
- save expense
- list expenses
- search and filter expenses
- export CSV

That is the full first version.

## Suggested post-V1 roadmap

### V1.1

- better extraction prompts
- confidence indicators
- duplicate receipt detection
- better PDF preview
- manual expense creation

### V1.2

- invoice creation
- invoice PDF export
- business settings
- logo and invoice numbering

### V2

- local model support through Ollama
- multi-user accounts
- accountant export packs
- recurring workflows
- bank CSV import

## Good AI use cases

- extract structured data from OCR text
- suggest expense categories
- detect incomplete receipts later
- summarize expenses later

## Bad early AI use cases

- general chatbot features
- complex agent systems
- autonomous finance actions
- too many automations before the core flow works

## README positioning

### Title

boring-ai

### Subtitle

Self-hosted AI back office for freelancers

### First line

Turn receipts into structured expenses in seconds.

## Biggest mistakes to avoid

- building auth first
- adding invoices before the receipt flow works
- overcomplicating the architecture too early
- supporting too many business types too soon
- marketing unreliable outputs as tax-ready
- skipping manual correction
- polishing the UI before the core backend flow exists

## V1 completion checklist

- frontend and backend run locally
- frontend can reach backend health route
- receipt upload works for images and PDFs
- OCR returns raw text
- AI extraction returns structured fields
- extracted fields can be edited
- reviewed expense saves to SQLite
- saved expenses appear in workspace
- search and filters work
- CSV export works
- README explains setup
- Docker flow is documented
- full flow works end to end

## Immediate next steps

Do these next, in order:

1. Set up `frontend` and `backend`
2. Add backend health route
3. Build upload API
4. Build upload UI
5. Connect frontend to backend

## One-sentence MVP definition

A freelancer uploads a receipt, the app extracts key fields with AI, saves it
as an expense, and lets them export expense data as CSV.
