"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDeferredValue, useEffect, useState } from "react";

const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";

const CATEGORY_OPTIONS = [
  "meals",
  "travel",
  "software",
  "office",
  "shopping",
  "transport",
  "lodging",
  "utilities",
  "other",
];
const DOCUMENT_TYPE_OPTIONS = [
  { value: "", label: "All document types" },
  { value: "receipt", label: "Receipts" },
  { value: "invoice", label: "Invoices" },
  { value: "unknown", label: "Unknown" },
];
const REVIEW_FILTER_OPTIONS = [
  { value: "", label: "All records" },
  { value: "needs_review", label: "Needs review" },
  { value: "warning", label: "Low confidence" },
  { value: "caution", label: "Medium confidence" },
  { value: "strong", label: "Looks strong" },
];

function formatCurrency(amount) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

function formatDate(date) {
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function buildExpensesUrl(
  endpoint,
  search,
  category,
  documentType,
  reviewStatus,
  dateFrom,
  dateTo,
  sortBy,
  sortDir,
  duplicatesOnly
) {
  const params = new URLSearchParams();

  if (search) {
    params.set("search", search);
  }

  if (category) {
    params.set("category", category);
  }

  if (documentType) {
    params.set("document_type", documentType);
  }

  if (reviewStatus) {
    params.set("review_status", reviewStatus);
  }

  if (dateFrom) {
    params.set("date_from", dateFrom);
  }

  if (dateTo) {
    params.set("date_to", dateTo);
  }

  if (sortBy) {
    params.set("sort_by", sortBy);
  }

  if (sortDir) {
    params.set("sort_dir", sortDir);
  }

  if (duplicatesOnly) {
    params.set("duplicates_only", "true");
  }

  const queryString = params.toString();
  const normalizedEndpoint = endpoint ? `/${endpoint}` : "";
  const basePath = `${apiBaseUrl}/api/expenses${normalizedEndpoint}`;
  return queryString
    ? `${basePath}?${queryString}`
    : basePath;
}

function LoadingRows() {
  return Array.from({ length: 4 }, (_, index) => (
    <tr className="border-t border-stone-900/8" key={index}>
      <td className="px-4 py-4">
        <div className="h-4 w-36 animate-pulse rounded-full bg-stone-200" />
      </td>
      <td className="px-4 py-4">
        <div className="h-4 w-20 animate-pulse rounded-full bg-stone-200" />
      </td>
      <td className="px-4 py-4">
        <div className="h-4 w-24 animate-pulse rounded-full bg-stone-200" />
      </td>
      <td className="px-4 py-4">
        <div className="h-4 w-24 animate-pulse rounded-full bg-stone-200" />
      </td>
      <td className="px-4 py-4">
        <div className="h-6 w-28 animate-pulse rounded-full bg-stone-200" />
      </td>
      <td className="px-4 py-4">
        <div className="h-9 w-20 animate-pulse rounded-full bg-stone-200" />
      </td>
    </tr>
  ));
}

export default function ExpensesPage() {
  const router = useRouter();
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");
  const [deleteErrorMessage, setDeleteErrorMessage] = useState("");
  const [deleteSuccessMessage, setDeleteSuccessMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isDeletingExpenseId, setIsDeletingExpenseId] = useState(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [documentType, setDocumentType] = useState("");
  const [reviewStatus, setReviewStatus] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortOption, setSortOption] = useState("date-desc");
  const [duplicatesOnly, setDuplicatesOnly] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const deferredSearch = useDeferredValue(search.trim());
  const [sortBy, sortDir] = sortOption.split("-");
  const hasActiveFilters = Boolean(
    deferredSearch ||
      category ||
      documentType ||
      reviewStatus ||
      dateFrom ||
      dateTo ||
      sortOption !== "date-desc" ||
      duplicatesOnly
  );
  const duplicateVisibleCount = items.filter(
    (expense) => expense.has_possible_duplicate
  ).length;
  const warningVisibleCount = items.filter(
    (expense) => expense.review_level === "warning"
  ).length;
  const cautionVisibleCount = items.filter(
    (expense) => expense.review_level === "caution"
  ).length;
  const strongVisibleCount = items.filter(
    (expense) => expense.review_level === "strong"
  ).length;
  const reviewVisibleCount = items.filter(
    (expense) =>
      expense.review_level === "warning" || expense.review_level === "caution"
  ).length;
  const canExport = !isLoading && total > 0;
  const exportUrl = buildExpensesUrl(
    "export",
    deferredSearch,
    category,
    documentType,
    reviewStatus,
    dateFrom,
    dateTo,
    sortBy,
    sortDir,
    duplicatesOnly
  );

  useEffect(() => {
    const controller = new AbortController();

    async function loadExpenses() {
      setIsLoading(true);
      setErrorMessage("");

      try {
        const response = await fetch(
          buildExpensesUrl(
            "",
            deferredSearch,
            category,
            documentType,
            reviewStatus,
            dateFrom,
            dateTo,
            sortBy,
            sortDir,
            duplicatesOnly
          ),
          {
            signal: controller.signal,
          }
        );

        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(
            payload?.detail ?? "Unable to load expenses. Please try again."
          );
        }

        setItems(payload?.items ?? []);
        setTotal(payload?.total ?? 0);
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }

        setItems([]);
        setTotal(0);
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Unable to load expenses. Please try again."
        );
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    loadExpenses();

    return () => {
      controller.abort();
    };
  }, [
    deferredSearch,
    category,
    documentType,
    reviewStatus,
    dateFrom,
    dateTo,
    duplicatesOnly,
    reloadKey,
    sortBy,
    sortDir,
  ]);

  async function handleDeleteExpense(expense) {
    const confirmed = window.confirm(
      `Delete expense "${expense.vendor}" from the workspace?`
    );
    if (!confirmed) {
      return;
    }

    setIsDeletingExpenseId(expense.id);
    setDeleteErrorMessage("");
    setDeleteSuccessMessage("");

    try {
      const response = await fetch(`${apiBaseUrl}/api/expenses/${expense.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(
          payload?.detail ?? "Unable to delete the expense. Please try again."
        );
      }

      setDeleteSuccessMessage(`Deleted expense #${expense.id}.`);
      setReloadKey((current) => current + 1);
    } catch (error) {
      setDeleteErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to delete the expense. Please try again."
      );
    } finally {
      setIsDeletingExpenseId(null);
    }
  }

  function openExpenseDetail(expenseId) {
    router.push(`/expenses/${expenseId}`);
  }

  function applyWorkspacePreset(preset) {
    setDeleteErrorMessage("");
    setDeleteSuccessMessage("");

    if (preset === "warning") {
      setReviewStatus("warning");
      setDuplicatesOnly(false);
      setSortOption("review-desc");
      return;
    }

    if (preset === "caution") {
      setReviewStatus("caution");
      setDuplicatesOnly(false);
      setSortOption("review-desc");
      return;
    }

    if (preset === "strong") {
      setReviewStatus("strong");
      setDuplicatesOnly(false);
      setSortOption("review-asc");
      return;
    }

    if (preset === "duplicates") {
      setReviewStatus("");
      setDuplicatesOnly(true);
      setSortOption("date-desc");
      return;
    }

    if (preset === "all") {
      setReviewStatus("");
      setDuplicatesOnly(false);
      setSortOption("date-desc");
    }
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(245,158,11,0.18),_transparent_28%),linear-gradient(180deg,_#fff8ef_0%,_#f5ead9_50%,_#eadbc4_100%)] px-4 py-6 text-stone-950 sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-7xl flex-col rounded-[2rem] border border-stone-900/10 bg-white/70 p-6 shadow-[0_30px_80px_rgba(120,53,15,0.12)] backdrop-blur md:p-10">
        <header className="mb-8 flex flex-col gap-5 border-b border-stone-900/10 pb-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="mb-3 text-sm font-semibold uppercase tracking-[0.35em] text-amber-800">
              Saved expenses
            </p>
            <h1 className="font-serif text-5xl leading-none tracking-tight text-stone-950 sm:text-6xl">
              Expense workspace
            </h1>
            <p className="mt-4 max-w-2xl text-lg leading-8 text-stone-700">
              Browse saved expenses, jump into a detail record, fix mistakes,
              and keep the receipt plus OCR trail visible whenever you need to
              trust the data.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              className="inline-flex min-h-11 items-center justify-center rounded-full border border-stone-900/10 bg-white px-5 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-stone-900 transition hover:bg-stone-100"
              href="/"
            >
              Back to upload flow
            </Link>
            <div className="rounded-[1.4rem] border border-emerald-900/10 bg-emerald-50/80 px-5 py-4 text-sm text-emerald-900 shadow-sm">
              <p className="font-semibold uppercase tracking-[0.2em]">Saved</p>
              <p className="mt-2 text-base font-medium">{total} expenses</p>
            </div>
          </div>
        </header>

        <section className="mb-6 rounded-[1.75rem] border border-stone-900/10 bg-white/80 p-6 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.28em] text-amber-800">
                Review summary
              </p>
              <h2 className="mt-3 font-serif text-3xl tracking-tight text-stone-950">
                Triage the workspace faster
              </h2>
              <p className="mt-4 max-w-2xl text-base leading-7 text-stone-700">
                Use the live counts below to jump straight into low-confidence
                records, medium-confidence follow-up, clean records, or likely
                duplicates inside the current result set.
              </p>
            </div>

            <p className="text-sm leading-7 text-stone-600">
              {isLoading
                ? "Preparing review summary..."
                : "Counts reflect the expenses visible under your current filters."}
            </p>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <button
              className={`rounded-[1.5rem] border px-5 py-5 text-left shadow-sm transition ${
                reviewStatus === "warning"
                  ? "border-rose-300 bg-rose-50"
                  : "border-stone-900/10 bg-white hover:bg-rose-50/70"
              }`}
              onClick={() => applyWorkspacePreset("warning")}
              type="button"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-rose-700">
                Needs review
              </p>
              <p className="mt-3 text-3xl font-semibold tracking-tight text-stone-950">
                {isLoading ? "—" : warningVisibleCount}
              </p>
              <p className="mt-3 text-sm leading-6 text-stone-600">
                Lowest-confidence records. Sort these to the top and fix them first.
              </p>
            </button>

            <button
              className={`rounded-[1.5rem] border px-5 py-5 text-left shadow-sm transition ${
                reviewStatus === "caution"
                  ? "border-amber-300 bg-amber-50"
                  : "border-stone-900/10 bg-white hover:bg-amber-50/70"
              }`}
              onClick={() => applyWorkspacePreset("caution")}
              type="button"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">
                Review suggested
              </p>
              <p className="mt-3 text-3xl font-semibold tracking-tight text-stone-950">
                {isLoading ? "—" : cautionVisibleCount}
              </p>
              <p className="mt-3 text-sm leading-6 text-stone-600">
                Medium-confidence records that deserve a quick second look.
              </p>
            </button>

            <button
              className={`rounded-[1.5rem] border px-5 py-5 text-left shadow-sm transition ${
                reviewStatus === "strong"
                  ? "border-emerald-300 bg-emerald-50"
                  : "border-stone-900/10 bg-white hover:bg-emerald-50/70"
              }`}
              onClick={() => applyWorkspacePreset("strong")}
              type="button"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
                Looks strong
              </p>
              <p className="mt-3 text-3xl font-semibold tracking-tight text-stone-950">
                {isLoading ? "—" : strongVisibleCount}
              </p>
              <p className="mt-3 text-sm leading-6 text-stone-600">
                Strong records that can stay in the background while you clean up the rest.
              </p>
            </button>

            <button
              className={`rounded-[1.5rem] border px-5 py-5 text-left shadow-sm transition ${
                duplicatesOnly
                  ? "border-fuchsia-300 bg-fuchsia-50"
                  : "border-stone-900/10 bg-white hover:bg-fuchsia-50/70"
              }`}
              onClick={() => applyWorkspacePreset("duplicates")}
              type="button"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-fuchsia-700">
                Possible duplicates
              </p>
              <p className="mt-3 text-3xl font-semibold tracking-tight text-stone-950">
                {isLoading ? "—" : duplicateVisibleCount}
              </p>
              <p className="mt-3 text-sm leading-6 text-stone-600">
                Compare matching records before export or deletion.
              </p>
            </button>

            <button
              className={`rounded-[1.5rem] border px-5 py-5 text-left shadow-sm transition ${
                !reviewStatus && !duplicatesOnly && sortOption === "date-desc"
                  ? "border-stone-900/15 bg-stone-100"
                  : "border-stone-900/10 bg-white hover:bg-stone-100"
              }`}
              onClick={() => applyWorkspacePreset("all")}
              type="button"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-600">
                Reset view
              </p>
              <p className="mt-3 text-3xl font-semibold tracking-tight text-stone-950">
                {isLoading ? "—" : total}
              </p>
              <p className="mt-3 text-sm leading-6 text-stone-600">
                Return to all visible records with the default newest-first workspace view.
              </p>
            </button>
          </div>
        </section>

        <section className="rounded-[1.75rem] border border-stone-900/10 bg-white/80 p-6 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.28em] text-amber-800">
                Filters + actions
              </p>
              <h2 className="mt-3 font-serif text-3xl tracking-tight text-stone-950">
                Find the record you want to inspect
              </h2>
              <p className="mt-4 max-w-2xl text-base leading-7 text-stone-700">
                Search vendors or OCR text, narrow by category or receipt date,
                then sort the results or focus on likely duplicates before you
                open a saved expense to review, edit, export, or remove it.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                className="inline-flex min-h-11 items-center justify-center rounded-full bg-emerald-700 px-5 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-emerald-300"
                disabled={!canExport}
                onClick={() => {
                  window.location.href = exportUrl;
                }}
                type="button"
              >
                Export CSV
              </button>

              {hasActiveFilters ? (
                <button
                  className="inline-flex min-h-11 items-center justify-center rounded-full border border-stone-900/10 bg-stone-950 px-5 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-stone-50 transition hover:bg-stone-800"
                  onClick={() => {
                    setSearch("");
                    setCategory("");
                    setDocumentType("");
                    setReviewStatus("");
                    setDateFrom("");
                    setDateTo("");
                    setDuplicatesOnly(false);
                    setSortOption("date-desc");
                    setDeleteErrorMessage("");
                    setDeleteSuccessMessage("");
                  }}
                  type="button"
                >
                  Clear filters
                </button>
              ) : null}
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-8">
            <label className="block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
                Search vendor or OCR
              </span>
              <input
                className="w-full rounded-2xl border border-stone-900/10 bg-white px-4 py-3 text-sm text-stone-900 outline-none transition focus:border-amber-700/30 focus:ring-2 focus:ring-amber-200"
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search vendor or receipt text"
                type="text"
                value={search}
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
                Category
              </span>
              <select
                className="w-full rounded-2xl border border-stone-900/10 bg-white px-4 py-3 text-sm text-stone-900 outline-none transition focus:border-amber-700/30 focus:ring-2 focus:ring-amber-200"
                onChange={(event) => setCategory(event.target.value)}
                value={category}
              >
                <option value="">All categories</option>
                {CATEGORY_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
                Document type
              </span>
              <select
                className="w-full rounded-2xl border border-stone-900/10 bg-white px-4 py-3 text-sm text-stone-900 outline-none transition focus:border-amber-700/30 focus:ring-2 focus:ring-amber-200"
                onChange={(event) => setDocumentType(event.target.value)}
                value={documentType}
              >
                {DOCUMENT_TYPE_OPTIONS.map((option) => (
                  <option key={option.value || "all"} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
                Date from
              </span>
              <input
                className="w-full rounded-2xl border border-stone-900/10 bg-white px-4 py-3 text-sm text-stone-900 outline-none transition focus:border-amber-700/30 focus:ring-2 focus:ring-amber-200"
                onChange={(event) => setDateFrom(event.target.value)}
                type="date"
                value={dateFrom}
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
                Date to
              </span>
              <input
                className="w-full rounded-2xl border border-stone-900/10 bg-white px-4 py-3 text-sm text-stone-900 outline-none transition focus:border-amber-700/30 focus:ring-2 focus:ring-amber-200"
                onChange={(event) => setDateTo(event.target.value)}
                type="date"
                value={dateTo}
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
                Review status
              </span>
              <select
                className="w-full rounded-2xl border border-stone-900/10 bg-white px-4 py-3 text-sm text-stone-900 outline-none transition focus:border-amber-700/30 focus:ring-2 focus:ring-amber-200"
                onChange={(event) => setReviewStatus(event.target.value)}
                value={reviewStatus}
              >
                {REVIEW_FILTER_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
                Duplicate view
              </span>
              <select
                className="w-full rounded-2xl border border-stone-900/10 bg-white px-4 py-3 text-sm text-stone-900 outline-none transition focus:border-amber-700/30 focus:ring-2 focus:ring-amber-200"
                onChange={(event) =>
                  setDuplicatesOnly(event.target.value === "duplicates")
                }
                value={duplicatesOnly ? "duplicates" : "all"}
              >
                <option value="all">All records</option>
                <option value="duplicates">Possible duplicates only</option>
              </select>
            </label>

            <label className="block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
                Sort
              </span>
              <select
                className="w-full rounded-2xl border border-stone-900/10 bg-white px-4 py-3 text-sm text-stone-900 outline-none transition focus:border-amber-700/30 focus:ring-2 focus:ring-amber-200"
                onChange={(event) => setSortOption(event.target.value)}
                value={sortOption}
              >
                <option value="date-desc">Newest first</option>
                <option value="date-asc">Oldest first</option>
                <option value="review-desc">Needs review first</option>
                <option value="review-asc">Strongest first</option>
                <option value="amount-desc">Highest amount</option>
                <option value="amount-asc">Lowest amount</option>
              </select>
            </label>
          </div>
        </section>

        <section className="mt-6 rounded-[1.75rem] border border-stone-900/10 bg-white/80 p-6 shadow-sm">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.28em] text-amber-800">
                Saved expenses
              </p>
              <h2 className="mt-3 font-serif text-3xl tracking-tight text-stone-950">
                Workspace results
              </h2>
            </div>

            <p className="text-sm leading-7 text-stone-600">
              {isLoading
                ? "Loading expenses..."
                : `${total} expense${total === 1 ? "" : "s"} found`}
            </p>
          </div>

          {!isLoading && duplicateVisibleCount > 0 ? (
            <div className="mt-6 rounded-2xl border border-amber-900/10 bg-amber-50/80 px-4 py-3 text-sm leading-7 text-amber-950">
              {duplicateVisibleCount} visible expense
              {duplicateVisibleCount === 1 ? "" : "s"} {duplicateVisibleCount === 1 ? "looks" : "look"} like
              possible duplicates. Open them to compare the receipt, OCR text, and saved fields before deleting anything.
            </div>
          ) : null}

          {!isLoading && reviewVisibleCount > 0 ? (
            <div className="mt-4 rounded-2xl border border-rose-900/10 bg-rose-50/80 px-4 py-3 text-sm leading-7 text-rose-950">
              {reviewVisibleCount} visible expense
              {reviewVisibleCount === 1 ? "" : "s"} still {reviewVisibleCount === 1 ? "needs" : "need"} review based on the original extraction confidence.
            </div>
          ) : null}

          {errorMessage ? (
            <div className="mt-6 rounded-2xl border border-rose-900/10 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-900">
              {errorMessage}
            </div>
          ) : null}

          {deleteErrorMessage ? (
            <div className="mt-6 rounded-2xl border border-rose-900/10 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-900">
              {deleteErrorMessage}
            </div>
          ) : null}

          {deleteSuccessMessage ? (
            <div className="mt-6 rounded-2xl border border-emerald-900/10 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-950">
              {deleteSuccessMessage}
            </div>
          ) : null}

          {!errorMessage && !isLoading && total === 0 ? (
            <div className="mt-6 rounded-[1.5rem] border border-dashed border-stone-900/10 bg-stone-50/80 px-6 py-10 text-center">
              <h3 className="font-serif text-2xl tracking-tight text-stone-950">
                {hasActiveFilters
                  ? "No expenses match your filters"
                  : "No expenses saved yet"}
              </h3>
              <p className="mt-3 text-sm leading-7 text-stone-600">
                {hasActiveFilters
                  ? "Try adjusting vendor, category, document type, review status, or date range to widen the results."
                  : "Upload and save a receipt to start building your workspace."}
              </p>
              {!hasActiveFilters ? (
                <div className="mt-5">
                  <Link
                    className="inline-flex min-h-11 items-center justify-center rounded-full bg-stone-950 px-5 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-stone-50 transition hover:bg-stone-800"
                    href="/"
                  >
                    Go save a receipt
                  </Link>
                </div>
              ) : null}
            </div>
          ) : null}

          {isLoading || total > 0 ? (
            <div className="mt-6 overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-0 overflow-hidden rounded-[1.5rem] border border-stone-900/10">
                <thead className="bg-stone-950 text-left text-stone-50">
                  <tr>
                    <th className="px-4 py-4 text-xs font-semibold uppercase tracking-[0.18em]">
                      Vendor
                    </th>
                    <th className="px-4 py-4 text-xs font-semibold uppercase tracking-[0.18em]">
                      Amount
                    </th>
                    <th className="px-4 py-4 text-xs font-semibold uppercase tracking-[0.18em]">
                      Date
                    </th>
                    <th className="px-4 py-4 text-xs font-semibold uppercase tracking-[0.18em]">
                      Category
                    </th>
                    <th className="px-4 py-4 text-xs font-semibold uppercase tracking-[0.18em]">
                      Signals
                    </th>
                    <th className="px-4 py-4 text-xs font-semibold uppercase tracking-[0.18em]">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white">
                  {isLoading ? (
                    <LoadingRows />
                  ) : (
                    items.map((expense) => (
                      <tr
                        className="cursor-pointer border-t border-stone-900/8 align-top transition hover:bg-amber-50/40 focus-within:bg-amber-50/40"
                        key={expense.id}
                        onClick={() => openExpenseDetail(expense.id)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            openExpenseDetail(expense.id);
                          }
                        }}
                        tabIndex={0}
                      >
                        <td className="px-4 py-4">
                          <p className="text-sm font-semibold text-stone-950">
                            {expense.vendor}
                          </p>
                          <p className="mt-1 text-xs uppercase tracking-[0.16em] text-stone-500">
                            Expense #{expense.id}
                          </p>
                        </td>
                        <td className="px-4 py-4 text-sm font-medium text-stone-900">
                          {formatCurrency(expense.amount)}
                        </td>
                        <td className="px-4 py-4 text-sm text-stone-700">
                          {formatDate(expense.date)}
                        </td>
                        <td className="px-4 py-4">
                          <span className="inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-amber-950">
                            {expense.category}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          {expense.has_possible_duplicate ||
                          expense.document_type ||
                          expense.review_badge ? (
                            <div className="space-y-2">
                              {expense.document_type ? (
                                <div>
                                  <span className="inline-flex rounded-full border border-sky-900/10 bg-sky-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-sky-900">
                                    {expense.document_type}
                                  </span>
                                  {expense.document_badge ? (
                                    <p className="mt-1 text-xs leading-5 text-stone-500">
                                      {expense.document_badge}
                                    </p>
                                  ) : null}
                                </div>
                              ) : null}
                              {expense.review_badge ? (
                                <div>
                                  <span
                                    className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${
                                      expense.review_level === "warning"
                                        ? "border-rose-900/10 bg-rose-50 text-rose-900"
                                        : expense.review_level === "caution"
                                          ? "border-amber-900/10 bg-amber-50 text-amber-900"
                                          : "border-emerald-900/10 bg-emerald-50 text-emerald-900"
                                    }`}
                                  >
                                    {expense.review_badge}
                                  </span>
                                  {expense.review_reason ? (
                                    <p className="mt-1 text-xs leading-5 text-stone-500">
                                      {expense.review_reason}
                                    </p>
                                  ) : null}
                                </div>
                              ) : null}
                              {expense.has_possible_duplicate ? (
                                <div>
                                  <span className="inline-flex rounded-full border border-rose-900/10 bg-rose-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-rose-900">
                                    Possible duplicate
                                  </span>
                                  <p className="mt-1 text-xs leading-5 text-stone-500">
                                    {expense.duplicate_count} nearby match
                                    {expense.duplicate_count === 1 ? "" : "es"} in
                                    this view
                                  </p>
                                </div>
                              ) : null}
                            </div>
                          ) : (
                            <span className="text-sm text-stone-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex flex-wrap gap-2">
                            <Link
                              className="inline-flex min-h-10 items-center justify-center rounded-full border border-stone-900/10 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-stone-900 transition hover:bg-stone-100"
                              href={`/expenses/${expense.id}`}
                              onClick={(event) => event.stopPropagation()}
                            >
                              Open
                            </Link>
                            <button
                              className="inline-flex min-h-10 items-center justify-center rounded-full border border-rose-900/10 bg-rose-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-rose-900 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:border-stone-300 disabled:bg-stone-100 disabled:text-stone-400"
                              disabled={isDeletingExpenseId === expense.id}
                              onClick={(event) => {
                                event.stopPropagation();
                                handleDeleteExpense(expense);
                              }}
                              type="button"
                            >
                              {isDeletingExpenseId === expense.id
                                ? "Deleting..."
                                : "Delete"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
