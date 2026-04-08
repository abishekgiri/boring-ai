import HealthStatus from "../components/health-status";
import UploadForm from "../components/upload-form";

const phaseChecklist = [
  "User can upload a receipt image or PDF",
  "Backend validates and stores the file locally",
  "OCR runs on images and PDFs",
  "Frontend shows raw extracted text with loading and error states",
];

const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";

async function getInitialHealthState() {
  try {
    const response = await fetch(`${apiBaseUrl}/health`, {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Health check failed with ${response.status}`);
    }

    const payload = await response.json();

    return {
      status: "online",
      message: "Backend is reachable from the frontend.",
      data: payload,
    };
  } catch (error) {
    return {
      status: "offline",
      message:
        error instanceof Error ? error.message : "Unable to reach the backend.",
      data: null,
    };
  }
}

export default async function Home() {
  const initialHealthState = await getInitialHealthState();

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(245,158,11,0.2),_transparent_28%),linear-gradient(180deg,_#fff8ef_0%,_#f5ead9_50%,_#eadbc4_100%)] px-4 py-6 text-stone-950 sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-6xl flex-col rounded-[2rem] border border-stone-900/10 bg-white/70 p-6 shadow-[0_30px_80px_rgba(120,53,15,0.12)] backdrop-blur md:p-10">
        <header className="mb-10 flex flex-col gap-6 border-b border-stone-900/10 pb-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="mb-3 text-sm font-semibold uppercase tracking-[0.35em] text-amber-800">
              Phase 3 in progress
            </p>
            <h1 className="max-w-3xl font-serif text-5xl leading-none tracking-tight text-stone-950 sm:text-6xl">
              boring-ai
            </h1>
            <p className="mt-4 max-w-2xl text-lg leading-8 text-stone-700">
              Self-hosted AI back office for freelancers. The first real product
              flow now reads receipts: upload the file, store it locally, and
              surface the raw text so the next phase can turn it into structured
              expense data.
            </p>
          </div>

          <div className="rounded-[1.5rem] border border-emerald-900/10 bg-emerald-50/80 px-5 py-4 text-sm text-emerald-900 shadow-sm">
            <p className="font-semibold uppercase tracking-[0.25em]">
              V1 promise
            </p>
            <p className="mt-2 text-base font-medium">
              Upload receipts -&gt; extract data -&gt; organize expenses -&gt;
              export CSV
            </p>
          </div>
        </header>

        <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-[1.75rem] border border-stone-900/10 bg-white/75 p-6 shadow-sm">
            <p className="text-sm font-semibold uppercase tracking-[0.28em] text-amber-800">
              OCR checklist
            </p>
            <h2 className="mt-3 font-serif text-3xl tracking-tight text-stone-950">
              What Phase 3 locks down
            </h2>
            <ul className="mt-6 space-y-3">
              {phaseChecklist.map((item) => (
                <li
                  key={item}
                  className="flex items-start gap-3 rounded-2xl border border-stone-900/8 bg-stone-50/80 px-4 py-3"
                >
                  <span className="mt-1 h-2.5 w-2.5 rounded-full bg-amber-600" />
                  <span className="text-sm leading-7 text-stone-700 sm:text-base">
                    {item}
                  </span>
                </li>
              ))}
            </ul>

            <div className="mt-8 rounded-[1.5rem] bg-stone-950 px-5 py-4 text-stone-100">
              <p className="text-sm font-semibold uppercase tracking-[0.25em] text-amber-300">
                Next after this
              </p>
              <p className="mt-2 text-base leading-7 text-stone-300">
                Phase 4 will turn the raw OCR output into structured fields like
                vendor, amount, date, and category.
              </p>
            </div>
          </div>

          <HealthStatus
            apiBaseUrl={apiBaseUrl}
            initialState={initialHealthState}
          />
        </section>

        <section className="mt-6">
          <UploadForm apiBaseUrl={apiBaseUrl} />
        </section>
      </div>
    </main>
  );
}
