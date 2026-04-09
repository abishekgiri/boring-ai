"use client";

import Link from "next/link";
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

function buildExpensesUrl(search, category, dateFrom, dateTo) {
  const params = new URLSearchParams();

  if (search) {
    params.set("search", search);
  }

  if (category) {
    params.set("category", category);
  }

  if (dateFrom) {
    params.set("date_from", dateFrom);
  }

  if (dateTo) {
    params.set("date_to", dateTo);
  }

  const queryString = params.toString();
  return queryString
    ? `${apiBaseUrl}/api/expenses?${queryString}`
    : `${apiBaseUrl}/api/expenses`;
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
    </tr>
  ));
}

export default function ExpensesPage() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const deferredSearch = useDeferredValue(search.trim());
  const hasActiveFilters = Boolean(
    deferredSearch || category || dateFrom || dateTo
  );

  useEffect(() => {
    const controller = new AbortController();

    async function loadExpenses() {
      setIsLoading(true);
      setErrorMessage("");

      try {
        const response = await fetch(
          buildExpensesUrl(deferredSearch, category, dateFrom, dateTo),
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
  }, [deferredSearch, category, dateFrom, dateTo]);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(245,158,11,0.18),_transparent_28%),linear-gradient(180deg,_#fff8ef_0%,_#f5ead9_50%,_#eadbc4_100%)] px-4 py-6 text-stone-950 sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-7xl flex-col rounded-[2rem] border border-stone-900/10 bg-white/70 p-6 shadow-[0_30px_80px_rgba(120,53,15,0.12)] backdrop-blur md:p-10">
        <header className="mb-8 flex flex-col gap-5 border-b border-stone-900/10 pb-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="mb-3 text-sm font-semibold uppercase tracking-[0.35em] text-amber-800">
              Phase 6 in progress
            </p>
            <h1 className="font-serif text-5xl leading-none tracking-tight text-stone-950 sm:text-6xl">
              Expense workspace
            </h1>
            <p className="mt-4 max-w-2xl text-lg leading-8 text-stone-700">
              Browse saved expenses, search vendors, filter by category or date,
              and find what matters quickly.
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

        <section className="rounded-[1.75rem] border border-stone-900/10 bg-white/80 p-6 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.28em] text-amber-800">
                Filters
              </p>
              <h2 className="mt-3 font-serif text-3xl tracking-tight text-stone-950">
                Search the workspace
              </h2>
              <p className="mt-4 max-w-2xl text-base leading-7 text-stone-700">
                Search vendors and narrow the list by category or receipt date.
              </p>
            </div>

            {hasActiveFilters ? (
              <button
                className="inline-flex min-h-11 items-center justify-center rounded-full border border-stone-900/10 bg-stone-950 px-5 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-stone-50 transition hover:bg-stone-800"
                onClick={() => {
                  setSearch("");
                  setCategory("");
                  setDateFrom("");
                  setDateTo("");
                }}
                type="button"
              >
                Clear filters
              </button>
            ) : null}
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <label className="block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
                Search vendor
              </span>
              <input
                className="w-full rounded-2xl border border-stone-900/10 bg-white px-4 py-3 text-sm text-stone-900 outline-none transition focus:border-amber-700/30 focus:ring-2 focus:ring-amber-200"
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by vendor"
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

          {errorMessage ? (
            <div className="mt-6 rounded-2xl border border-rose-900/10 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-900">
              {errorMessage}
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
                  ? "Try adjusting vendor, category, or date range to widen the results."
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
                  </tr>
                </thead>
                <tbody className="bg-white">
                  {isLoading ? (
                    <LoadingRows />
                  ) : (
                    items.map((expense) => (
                      <tr
                        className="border-t border-stone-900/8 align-top transition hover:bg-amber-50/40"
                        key={expense.id}
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
