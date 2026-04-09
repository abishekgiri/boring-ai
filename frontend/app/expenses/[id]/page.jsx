"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

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

function mapExpenseToForm(expense) {
  return {
    vendor: expense?.vendor ?? "",
    amount:
      expense?.amount === null || expense?.amount === undefined
        ? ""
        : String(expense.amount),
    date: expense?.date ?? "",
    category: expense?.category ?? "",
  };
}

function formatCurrency(amount) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

function formatDate(value) {
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(value) {
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function buildPreviewUrl(apiBaseUrlValue, fileUrl) {
  if (!fileUrl) {
    return null;
  }

  return new URL(fileUrl, apiBaseUrlValue).toString();
}

function deriveReceiptFileUrl(filePath) {
  if (!filePath) {
    return null;
  }

  const storedFilename = filePath.split("/").pop();
  return storedFilename ? `/uploads/${storedFilename}` : null;
}

function inferContentType(filenameOrPath) {
  if (!filenameOrPath) {
    return "";
  }

  const normalizedValue = filenameOrPath.toLowerCase();
  if (normalizedValue.endsWith(".pdf")) {
    return "application/pdf";
  }

  if (
    normalizedValue.endsWith(".png") ||
    normalizedValue.endsWith(".jpg") ||
    normalizedValue.endsWith(".jpeg") ||
    normalizedValue.endsWith(".webp")
  ) {
    return "image/*";
  }

  return "";
}

function validateExpenseForm(formState) {
  if (!formState.vendor.trim()) {
    return "Vendor is required before saving.";
  }

  if (
    !formState.amount ||
    Number.isNaN(Number(formState.amount)) ||
    Number(formState.amount) <= 0
  ) {
    return "Amount must be greater than 0 before saving.";
  }

  if (!formState.date) {
    return "Date is required before saving.";
  }

  if (!formState.category) {
    return "Category is required before saving.";
  }

  return null;
}

function buildLearningContext(expense, formState) {
  if (!expense) {
    return null;
  }

  const observedVendor = expense.vendor?.trim() || null;
  const observedCategory = expense.category || null;
  const nextVendor = formState.vendor.trim();
  const nextCategory = formState.category;
  const hasVendorChange = Boolean(observedVendor) && observedVendor !== nextVendor;
  const hasCategoryChange =
    Boolean(observedCategory) && observedCategory !== nextCategory;

  if (!hasVendorChange && !hasCategoryChange) {
    return null;
  }

  return {
    observed_vendor: observedVendor,
    observed_category: observedCategory,
  };
}

function normalizeFieldValueForComparison(value, fieldName) {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  if (fieldName === "amount") {
    const parsedAmount = Number(value);
    return Number.isFinite(parsedAmount) ? parsedAmount.toFixed(2) : "";
  }

  return String(value).trim().toLowerCase();
}

function didSavedValueChange(savedValue, extractedValue, fieldName) {
  return (
    normalizeFieldValueForComparison(savedValue, fieldName) !==
    normalizeFieldValueForComparison(extractedValue, fieldName)
  );
}

function FieldOriginHint({ provenance, changedSinceExtraction = false }) {
  if (!provenance?.label) {
    if (!changedSinceExtraction) {
      return null;
    }

    return (
      <p className="mt-2 text-xs leading-5 text-stone-500">
        <span className="font-semibold text-stone-700">
          Saved value changed after extraction.
        </span>{" "}
        The original source hint is not available for this field.
      </p>
    );
  }

  return (
    <p className="mt-2 text-xs leading-5 text-stone-500">
      {changedSinceExtraction ? (
        <>
          <span className="font-semibold text-stone-700">
            Saved value changed after extraction.
          </span>{" "}
          Original source: {provenance.label}. {provenance.details}
        </>
      ) : (
        <>
          <span className="font-semibold text-stone-700">Original source:</span>{" "}
          {provenance.label}. {provenance.details}
        </>
      )}
    </p>
  );
}

export default function ExpenseDetailPage() {
  const params = useParams();
  const expenseId = params?.id;

  const [expense, setExpense] = useState(null);
  const [uploadRecord, setUploadRecord] = useState(null);
  const [formState, setFormState] = useState({
    vendor: "",
    amount: "",
    date: "",
    category: "",
  });
  const [pageErrorMessage, setPageErrorMessage] = useState("");
  const [saveErrorMessage, setSaveErrorMessage] = useState("");
  const [saveSuccessMessage, setSaveSuccessMessage] = useState("");
  const [uploadWarningMessage, setUploadWarningMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!expenseId) {
      return undefined;
    }

    const controller = new AbortController();

    async function loadExpense() {
      setIsLoading(true);
      setPageErrorMessage("");
      setUploadWarningMessage("");
      setSaveErrorMessage("");
      setSaveSuccessMessage("");

      try {
        const expenseResponse = await fetch(`${apiBaseUrl}/api/expenses/${expenseId}`, {
          signal: controller.signal,
        });
        const expensePayload = await expenseResponse.json().catch(() => null);

        if (!expenseResponse.ok) {
          throw new Error(
            expensePayload?.detail ?? "Unable to load the expense record."
          );
        }

        if (controller.signal.aborted) {
          return;
        }

        setExpense(expensePayload);
        setFormState(mapExpenseToForm(expensePayload));

        if (expensePayload?.upload_id) {
          try {
            const uploadResponse = await fetch(
              `${apiBaseUrl}/api/uploads/${expensePayload.upload_id}`,
              {
                signal: controller.signal,
              }
            );
            const uploadPayload = await uploadResponse.json().catch(() => null);

            if (!uploadResponse.ok) {
              throw new Error(
                uploadPayload?.detail ??
                  "Upload metadata could not be loaded for this expense."
              );
            }

            if (!controller.signal.aborted) {
              setUploadRecord(uploadPayload);
            }
          } catch (error) {
            if (
              error instanceof Error &&
              error.name === "AbortError"
            ) {
              return;
            }

            setUploadRecord(null);
            setUploadWarningMessage(
              error instanceof Error
                ? error.message
                : "Upload metadata could not be loaded for this expense."
            );
          }
        } else {
          setUploadRecord(null);
        }
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }

        setExpense(null);
        setUploadRecord(null);
        setPageErrorMessage(
          error instanceof Error
            ? error.message
            : "Unable to load the expense record."
        );
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    loadExpense();

    return () => {
      controller.abort();
    };
  }, [expenseId]);

  const receiptFileUrl =
    uploadRecord?.file_url ?? deriveReceiptFileUrl(expense?.file_path);
  const receiptPreviewUrl = buildPreviewUrl(apiBaseUrl, receiptFileUrl);
  const receiptContentType =
    uploadRecord?.content_type ??
    inferContentType(uploadRecord?.filename ?? expense?.file_path);
  const isReceiptImage = receiptContentType.startsWith("image/");
  const isReceiptPdf = receiptContentType === "application/pdf";
  const extractionProvenance = uploadRecord?.extraction_provenance ?? null;
  const extractedSnapshot = uploadRecord?.extracted_fields ?? null;

  const originHints = useMemo(
    () => ({
      vendor: {
        provenance: extractionProvenance?.vendor ?? null,
        changedSinceExtraction: didSavedValueChange(
          expense?.vendor,
          extractedSnapshot?.vendor,
          "vendor"
        ),
      },
      amount: {
        provenance: extractionProvenance?.amount ?? null,
        changedSinceExtraction: didSavedValueChange(
          expense?.amount,
          extractedSnapshot?.amount,
          "amount"
        ),
      },
      date: {
        provenance: extractionProvenance?.date ?? null,
        changedSinceExtraction: didSavedValueChange(
          expense?.date,
          extractedSnapshot?.date,
          "date"
        ),
      },
      category: {
        provenance: extractionProvenance?.category ?? null,
        changedSinceExtraction: didSavedValueChange(
          expense?.category,
          extractedSnapshot?.category,
          "category"
        ),
      },
    }),
    [expense, extractedSnapshot, extractionProvenance]
  );

  const hasChanges = Boolean(
    expense &&
      (formState.vendor.trim() !== expense.vendor ||
        Number(formState.amount) !== expense.amount ||
        formState.date !== expense.date ||
        formState.category !== expense.category)
  );

  function handleFieldChange(field, value) {
    setSaveErrorMessage("");
    setSaveSuccessMessage("");
    setFormState((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function handleStartEditing() {
    setIsEditing(true);
    setSaveErrorMessage("");
    setSaveSuccessMessage("");
    setFormState(mapExpenseToForm(expense));
  }

  function handleCancelEditing() {
    setIsEditing(false);
    setSaveErrorMessage("");
    setSaveSuccessMessage("");
    setFormState(mapExpenseToForm(expense));
  }

  async function handleSaveChanges() {
    const validationError = validateExpenseForm(formState);
    if (validationError) {
      setSaveErrorMessage(validationError);
      return;
    }

    setIsSaving(true);
    setSaveErrorMessage("");
    setSaveSuccessMessage("");

    try {
      const response = await fetch(`${apiBaseUrl}/api/expenses/${expenseId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          vendor: formState.vendor.trim(),
          amount: Number(formState.amount),
          date: formState.date,
          category: formState.category,
          learning_context: buildLearningContext(expense, formState),
        }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.detail ?? "Expense update failed.");
      }

      setExpense(payload);
      setFormState(mapExpenseToForm(payload));
      setIsEditing(false);
      setSaveSuccessMessage("Saved successfully.");
    } catch (error) {
      setSaveErrorMessage(
        error instanceof Error ? error.message : "Expense update failed."
      );
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return (
      <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(245,158,11,0.18),_transparent_28%),linear-gradient(180deg,_#fff8ef_0%,_#f5ead9_50%,_#eadbc4_100%)] px-4 py-6 text-stone-950 sm:px-6 lg:px-8">
        <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-6xl flex-col rounded-[2rem] border border-stone-900/10 bg-white/70 p-6 shadow-[0_30px_80px_rgba(120,53,15,0.12)] backdrop-blur md:p-10">
          <div className="h-10 w-56 animate-pulse rounded-full bg-stone-200" />
          <div className="mt-8 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-[1.75rem] border border-stone-900/10 bg-white/80 p-6 shadow-sm">
              <div className="h-8 w-40 animate-pulse rounded-full bg-stone-200" />
              <div className="mt-6 h-32 animate-pulse rounded-[1.5rem] bg-stone-100" />
            </div>
            <div className="rounded-[1.75rem] border border-stone-900/10 bg-white/80 p-6 shadow-sm">
              <div className="h-8 w-48 animate-pulse rounded-full bg-stone-200" />
              <div className="mt-6 h-72 animate-pulse rounded-[1.5rem] bg-stone-100" />
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (!expense || pageErrorMessage) {
    return (
      <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(245,158,11,0.18),_transparent_28%),linear-gradient(180deg,_#fff8ef_0%,_#f5ead9_50%,_#eadbc4_100%)] px-4 py-6 text-stone-950 sm:px-6 lg:px-8">
        <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-4xl flex-col rounded-[2rem] border border-stone-900/10 bg-white/70 p-6 shadow-[0_30px_80px_rgba(120,53,15,0.12)] backdrop-blur md:p-10">
          <Link
            className="inline-flex min-h-11 w-fit items-center justify-center rounded-full border border-stone-900/10 bg-white px-5 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-stone-900 transition hover:bg-stone-100"
            href="/expenses"
          >
            Back to workspace
          </Link>

          <div className="mt-8 rounded-[1.75rem] border border-rose-900/10 bg-rose-50 p-6 text-rose-950 shadow-sm">
            <p className="text-sm font-semibold uppercase tracking-[0.24em]">
              Expense detail
            </p>
            <h1 className="mt-3 font-serif text-4xl tracking-tight">
              Needs attention
            </h1>
            <p className="mt-4 text-base leading-7">
              {pageErrorMessage || "Expense not found."}
            </p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(245,158,11,0.18),_transparent_28%),linear-gradient(180deg,_#fff8ef_0%,_#f5ead9_50%,_#eadbc4_100%)] px-4 py-6 text-stone-950 sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-6xl flex-col rounded-[2rem] border border-stone-900/10 bg-white/70 p-6 shadow-[0_30px_80px_rgba(120,53,15,0.12)] backdrop-blur md:p-10">
        <header className="mb-8 flex flex-col gap-5 border-b border-stone-900/10 pb-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="mb-3 text-sm font-semibold uppercase tracking-[0.35em] text-amber-800">
              Phase 8 complete
            </p>
            <h1 className="font-serif text-5xl leading-none tracking-tight text-stone-950 sm:text-6xl">
              Expense detail + edit
            </h1>
            <p className="mt-4 max-w-2xl text-lg leading-8 text-stone-700">
              Inspect the saved record, trace it back to OCR and the original
              receipt, then update the fields when AI or manual entry needs a
              correction.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              className="inline-flex min-h-11 items-center justify-center rounded-full border border-stone-900/10 bg-white px-5 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-stone-900 transition hover:bg-stone-100"
              href="/expenses"
            >
              Back to workspace
            </Link>
            {isEditing ? (
              <button
                className="inline-flex min-h-11 items-center justify-center rounded-full border border-stone-900/10 bg-stone-950 px-5 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-stone-50 transition hover:bg-stone-800"
                onClick={handleCancelEditing}
                type="button"
              >
                Cancel edit
              </button>
            ) : (
              <button
                className="inline-flex min-h-11 items-center justify-center rounded-full bg-emerald-700 px-5 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-white transition hover:bg-emerald-800"
                onClick={handleStartEditing}
                type="button"
              >
                Edit expense
              </button>
            )}
          </div>
        </header>

        <section className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="rounded-[1.75rem] border border-stone-900/10 bg-white/80 p-6 shadow-sm">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.28em] text-amber-800">
                  Saved record
                </p>
                <h2 className="mt-3 font-serif text-3xl tracking-tight text-stone-950">
                  Review before trust
                </h2>
              </div>

              <div className="rounded-[1.4rem] border border-emerald-900/10 bg-emerald-50/80 px-4 py-3 text-sm text-emerald-900 shadow-sm">
                <p className="font-semibold uppercase tracking-[0.18em]">
                  Expense #{expense.id}
                </p>
                <p className="mt-2 text-base font-medium">
                  {formatCurrency(expense.amount)}
                </p>
              </div>
            </div>

            {saveErrorMessage ? (
              <div className="mt-6 rounded-2xl border border-rose-900/10 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-900">
                {saveErrorMessage}
              </div>
            ) : null}

            {saveSuccessMessage ? (
              <div className="mt-6 rounded-2xl border border-emerald-900/10 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-950">
                {saveSuccessMessage}
              </div>
            ) : null}

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
                  Vendor
                </span>
                <input
                  className="w-full rounded-2xl border border-stone-900/10 bg-white px-4 py-3 text-sm text-stone-900 outline-none transition focus:border-amber-700/30 focus:ring-2 focus:ring-amber-200 disabled:bg-stone-50 disabled:text-stone-600"
                  disabled={!isEditing || isSaving}
                  onChange={(event) =>
                    handleFieldChange("vendor", event.target.value)
                  }
                  type="text"
                  value={formState.vendor}
                />
                <FieldOriginHint
                  changedSinceExtraction={originHints.vendor.changedSinceExtraction}
                  provenance={originHints.vendor.provenance}
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
                  Amount
                </span>
                <input
                  className="w-full rounded-2xl border border-stone-900/10 bg-white px-4 py-3 text-sm text-stone-900 outline-none transition focus:border-amber-700/30 focus:ring-2 focus:ring-amber-200 disabled:bg-stone-50 disabled:text-stone-600"
                  disabled={!isEditing || isSaving}
                  onChange={(event) =>
                    handleFieldChange("amount", event.target.value)
                  }
                  step="0.01"
                  type="number"
                  value={formState.amount}
                />
                <FieldOriginHint
                  changedSinceExtraction={originHints.amount.changedSinceExtraction}
                  provenance={originHints.amount.provenance}
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
                  Date
                </span>
                <input
                  className="w-full rounded-2xl border border-stone-900/10 bg-white px-4 py-3 text-sm text-stone-900 outline-none transition focus:border-amber-700/30 focus:ring-2 focus:ring-amber-200 disabled:bg-stone-50 disabled:text-stone-600"
                  disabled={!isEditing || isSaving}
                  onChange={(event) =>
                    handleFieldChange("date", event.target.value)
                  }
                  type="date"
                  value={formState.date}
                />
                <FieldOriginHint
                  changedSinceExtraction={originHints.date.changedSinceExtraction}
                  provenance={originHints.date.provenance}
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
                  Category
                </span>
                <select
                  className="w-full rounded-2xl border border-stone-900/10 bg-white px-4 py-3 text-sm text-stone-900 outline-none transition focus:border-amber-700/30 focus:ring-2 focus:ring-amber-200 disabled:bg-stone-50 disabled:text-stone-600"
                  disabled={!isEditing || isSaving}
                  onChange={(event) =>
                    handleFieldChange("category", event.target.value)
                  }
                  value={formState.category}
                >
                  <option value="">Select a category</option>
                  {CATEGORY_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                <FieldOriginHint
                  changedSinceExtraction={originHints.category.changedSinceExtraction}
                  provenance={originHints.category.provenance}
                />
              </label>
            </div>

            {uploadRecord?.document_classification ? (
              <div className="mt-6 rounded-[1.5rem] border border-stone-900/10 bg-stone-50/80 px-5 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-800">
                  Original document check
                </p>
                <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-base font-semibold text-stone-950">
                      {uploadRecord.document_classification.badge}
                    </p>
                    <p className="mt-2 text-sm leading-7 text-stone-600">
                      {uploadRecord.document_classification.summary}
                    </p>
                  </div>
                  <span className="inline-flex rounded-full border border-stone-900/10 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-stone-900">
                    {uploadRecord.document_classification.document_type}
                  </span>
                </div>
              </div>
            ) : null}

            <div className="mt-6 grid gap-3 md:grid-cols-3">
              <div className="rounded-2xl border border-stone-900/10 bg-stone-50/80 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
                  Saved on
                </p>
                <p className="mt-2 text-sm font-medium text-stone-900">
                  {formatDateTime(expense.created_at)}
                </p>
              </div>
              <div className="rounded-2xl border border-stone-900/10 bg-stone-50/80 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
                  Receipt date
                </p>
                <p className="mt-2 text-sm font-medium text-stone-900">
                  {formatDate(expense.date)}
                </p>
              </div>
              <div className="rounded-2xl border border-stone-900/10 bg-stone-50/80 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
                  Upload ID
                </p>
                <p className="mt-2 break-all text-sm font-medium text-stone-900">
                  {expense.upload_id}
                </p>
              </div>
            </div>

            <div className="mt-6 flex flex-col gap-4 border-t border-stone-900/10 pt-6 sm:flex-row sm:items-center sm:justify-between">
              <p className="max-w-xl text-sm leading-7 text-stone-600">
                Edit only when the saved record needs correction. The receipt
                and OCR text stay available below for traceability.
              </p>

              <button
                className="inline-flex min-h-12 items-center justify-center rounded-full bg-emerald-700 px-6 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-stone-300"
                disabled={!isEditing || !hasChanges || isSaving}
                onClick={handleSaveChanges}
                type="button"
              >
                {isSaving ? "Saving..." : "Save changes"}
              </button>
            </div>
          </div>

          <div className="space-y-6">
            <section className="rounded-[1.75rem] border border-stone-900/10 bg-white/80 p-6 shadow-sm">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.28em] text-amber-800">
                    Receipt source
                  </p>
                  <h2 className="mt-3 font-serif text-3xl tracking-tight text-stone-950">
                    Original file
                  </h2>
                </div>

                {receiptPreviewUrl ? (
                  <a
                    className="inline-flex min-h-11 items-center justify-center rounded-full border border-stone-900/10 bg-white px-5 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-stone-900 transition hover:bg-stone-100"
                    href={receiptPreviewUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Open receipt
                  </a>
                ) : null}
              </div>

              {uploadWarningMessage ? (
                <div className="mt-6 rounded-2xl border border-amber-900/10 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">
                  {uploadWarningMessage}
                </div>
              ) : null}

              <div className="mt-6 rounded-[1.5rem] border border-stone-900/10 bg-stone-50/70 p-4">
                {receiptPreviewUrl && isReceiptImage ? (
                  <img
                    alt={uploadRecord?.filename ?? expense.vendor}
                    className="h-80 w-full rounded-[1rem] object-contain bg-white"
                    src={receiptPreviewUrl}
                  />
                ) : null}

                {receiptPreviewUrl && isReceiptPdf ? (
                  <iframe
                    className="h-80 w-full rounded-[1rem] bg-white"
                    src={receiptPreviewUrl}
                    title={uploadRecord?.filename ?? `${expense.vendor} receipt`}
                  />
                ) : null}

                {!receiptPreviewUrl ? (
                  <div className="flex min-h-72 items-center justify-center rounded-[1rem] border border-dashed border-stone-900/10 bg-white px-6 text-center text-sm leading-7 text-stone-600">
                    Receipt preview is not available for this expense yet.
                  </div>
                ) : null}
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-stone-900/10 bg-white px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
                    Filename
                  </p>
                  <p className="mt-2 break-all text-sm font-medium text-stone-900">
                    {uploadRecord?.filename ?? "Stored receipt"}
                  </p>
                </div>
                <div className="rounded-2xl border border-stone-900/10 bg-white px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
                    Type
                  </p>
                  <p className="mt-2 text-sm font-medium text-stone-900">
                    {uploadRecord?.content_type ?? "Unknown"}
                  </p>
                </div>
              </div>
            </section>

            <section className="rounded-[1.75rem] border border-stone-900/10 bg-white/80 p-6 shadow-sm">
              <p className="text-sm font-semibold uppercase tracking-[0.28em] text-amber-800">
                Traceability
              </p>
              <h2 className="mt-3 font-serif text-3xl tracking-tight text-stone-950">
                Raw OCR text
              </h2>
              <p className="mt-4 text-base leading-7 text-stone-700">
                Keep the source text visible so users can understand what the AI
                saw before it suggested structured fields.
              </p>

              <details className="mt-6 rounded-[1.5rem] border border-stone-900/10 bg-stone-950 p-4 text-stone-100" open>
                <summary className="cursor-pointer text-sm font-semibold uppercase tracking-[0.18em] text-amber-300">
                  Show raw OCR text
                </summary>
                <div className="mt-4 max-h-80 overflow-y-auto rounded-[1rem] border border-white/10 bg-black/20 p-4">
                  <pre className="whitespace-pre-wrap break-words font-mono text-sm leading-6 text-stone-100">
                    {expense.raw_ocr_text}
                  </pre>
                </div>
              </details>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}
