"use client";

import { useEffect, useState } from "react";

import UploadPreview from "./upload-preview";

const MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/pdf",
];
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

function createEmptyExtractedFields() {
  return {
    vendor: "",
    amount: "",
    date: "",
    category: "",
  };
}

function mapExtractedFields(fields) {
  return {
    vendor: fields?.vendor ?? "",
    amount:
      fields?.amount === null || fields?.amount === undefined
        ? ""
        : String(fields.amount),
    date: fields?.date ?? "",
    category: fields?.category ?? "",
  };
}

function formatFileSize(size) {
  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  return `${(size / (1024 * 1024)).toFixed(2)} MB`;
}

function getUploadErrorMessage(responseStatus, fallbackMessage) {
  if (responseStatus === 413) {
    return "File too large. Upload a receipt smaller than 10 MB.";
  }

  return fallbackMessage || "Upload failed. Please try again.";
}

function validateFile(file) {
  if (!file) {
    return "Choose a receipt image or PDF before uploading.";
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return "Unsupported file type. Upload PNG, JPG, JPEG, WEBP, or PDF.";
  }

  if (file.size === 0) {
    return "The selected file is empty.";
  }

  if (file.size > MAX_UPLOAD_SIZE_BYTES) {
    return "File too large. Upload a receipt smaller than 10 MB.";
  }

  return null;
}

export default function UploadForm({ apiBaseUrl }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [localPreviewUrl, setLocalPreviewUrl] = useState(null);
  const [uploadedFile, setUploadedFile] = useState(null);
  const [ocrText, setOcrText] = useState("");
  const [extractedFields, setExtractedFields] = useState(
    createEmptyExtractedFields()
  );
  const [uploadErrorMessage, setUploadErrorMessage] = useState("");
  const [ocrErrorMessage, setOcrErrorMessage] = useState("");
  const [extractionErrorMessage, setExtractionErrorMessage] = useState("");
  const [statusMessage, setStatusMessage] = useState(
    "Upload a receipt image or PDF to store it locally."
  );
  const [isUploading, setIsUploading] = useState(false);
  const [isRunningOcr, setIsRunningOcr] = useState(false);
  const [isExtractingFields, setIsExtractingFields] = useState(false);

  useEffect(() => {
    if (!selectedFile) {
      setLocalPreviewUrl(null);
      return undefined;
    }

    const objectUrl = URL.createObjectURL(selectedFile);
    setLocalPreviewUrl(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [selectedFile]);

  function resetDerivedState() {
    setOcrText("");
    setExtractedFields(createEmptyExtractedFields());
    setOcrErrorMessage("");
    setExtractionErrorMessage("");
  }

  function handleFileChange(event) {
    const file = event.target.files?.[0] ?? null;
    setSelectedFile(file);
    setUploadedFile(null);
    resetDerivedState();

    if (!file) {
      setUploadErrorMessage("");
      setStatusMessage("Upload a receipt image or PDF to store it locally.");
      return;
    }

    const validationError = validateFile(file);
    if (validationError) {
      setUploadErrorMessage(validationError);
      setStatusMessage("Pick a supported receipt file and try again.");
      return;
    }

    setUploadErrorMessage("");
    setStatusMessage(
      `${file.name} is ready to upload. Max file size: ${formatFileSize(MAX_UPLOAD_SIZE_BYTES)}.`
    );
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const validationError = validateFile(selectedFile);
    if (validationError) {
      setUploadErrorMessage(validationError);
      setStatusMessage("Fix the file issue before uploading.");
      return;
    }

    const formData = new FormData();
    formData.append("file", selectedFile);

    setIsUploading(true);
    setUploadErrorMessage("");
    resetDerivedState();
    setStatusMessage("Uploading receipt and storing it locally...");

    try {
      const response = await fetch(`${apiBaseUrl}/api/uploads`, {
        method: "POST",
        body: formData,
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          getUploadErrorMessage(
            response.status,
            payload?.detail ?? response.statusText
          )
        );
      }

      setUploadedFile(payload);
      setOcrText(payload.ocr_text ?? "");
      setExtractedFields(mapExtractedFields(payload.extracted_fields));
      setStatusMessage(
        "Upload complete. The stored file preview is ready, and you can run OCR next."
      );
    } catch (error) {
      setUploadedFile(null);
      setUploadErrorMessage(
        error instanceof Error ? error.message : "Upload failed. Please try again."
      );
      setStatusMessage("Upload did not complete.");
    } finally {
      setIsUploading(false);
    }
  }

  async function handleRunOcr() {
    if (!uploadedFile?.id) {
      setOcrErrorMessage("Upload a receipt before trying OCR.");
      return;
    }

    setIsRunningOcr(true);
    setOcrErrorMessage("");
    setExtractionErrorMessage("");
    setExtractedFields(createEmptyExtractedFields());
    setStatusMessage("Extracting raw text from the stored receipt...");

    try {
      const response = await fetch(`${apiBaseUrl}/api/uploads/${uploadedFile.id}/ocr`, {
        method: "POST",
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.detail ?? "OCR failed. Please try again.");
      }

      setOcrText(payload?.text ?? "");
      setUploadedFile((current) =>
        current
          ? {
              ...current,
              ocr_text: payload?.text ?? "",
              extracted_fields: null,
            }
          : current
      );
      setStatusMessage("OCR complete. Review the raw text, then extract fields.");
    } catch (error) {
      setOcrText("");
      setOcrErrorMessage(
        error instanceof Error ? error.message : "OCR failed. Please try again."
      );
      setStatusMessage("OCR did not complete.");
    } finally {
      setIsRunningOcr(false);
    }
  }

  async function handleExtractFields() {
    if (!uploadedFile?.id) {
      setExtractionErrorMessage("Upload a receipt before extracting fields.");
      return;
    }

    if (!ocrText) {
      setExtractionErrorMessage("Run OCR before extracting structured fields.");
      return;
    }

    setIsExtractingFields(true);
    setExtractionErrorMessage("");
    setStatusMessage("Sending OCR text to the AI extraction service...");

    try {
      const response = await fetch(
        `${apiBaseUrl}/api/uploads/${uploadedFile.id}/extract`,
        {
          method: "POST",
        }
      );

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          payload?.detail ?? "Field extraction failed. Please try again."
        );
      }

      setUploadedFile((current) =>
        current
          ? {
              ...current,
              ocr_text: payload?.ocr_text ?? current.ocr_text,
              extracted_fields: payload?.extracted_fields ?? null,
            }
          : current
      );
      setOcrText(payload?.ocr_text ?? ocrText);
      setExtractedFields(mapExtractedFields(payload?.extracted_fields));
      setStatusMessage(
        "AI extraction complete. Review the fields below before saving in the next phase."
      );
    } catch (error) {
      setExtractionErrorMessage(
        error instanceof Error
          ? error.message
          : "Field extraction failed. Please try again."
      );
      setStatusMessage("Field extraction did not complete.");
    } finally {
      setIsExtractingFields(false);
    }
  }

  function handleExtractedFieldChange(field, value) {
    setExtractedFields((current) => ({
      ...current,
      [field]: value,
    }));
  }

  const hasExtractedFields = Object.values(extractedFields).some(Boolean);

  return (
    <section className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
        <div className="rounded-[1.75rem] border border-stone-900/10 bg-white/80 p-6 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-amber-800">
            Phase 4
          </p>
          <h2 className="mt-3 font-serif text-3xl tracking-tight text-stone-950">
            Receipt upload + OCR + AI extraction
          </h2>
          <p className="mt-4 max-w-2xl text-base leading-7 text-stone-700">
            Upload a receipt, extract the raw OCR text, then turn that messy
            text into editable expense fields the user can review before save.
          </p>

          <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
            <label
              className="flex cursor-pointer flex-col items-center justify-center rounded-[1.75rem] border border-dashed border-stone-900/15 bg-stone-50/80 px-6 py-10 text-center transition hover:border-amber-700/30 hover:bg-amber-50/40"
              htmlFor="receipt-upload"
            >
              <span className="text-sm font-semibold uppercase tracking-[0.24em] text-amber-800">
                Upload receipt
              </span>
              <span className="mt-4 font-serif text-2xl tracking-tight text-stone-950">
                Drop a file here or choose one
              </span>
              <span className="mt-3 max-w-md text-sm leading-7 text-stone-600">
                Supported formats: PNG, JPG, JPEG, WEBP, PDF. Maximum file size:{" "}
                {formatFileSize(MAX_UPLOAD_SIZE_BYTES)}.
              </span>
              <input
                accept=".png,.jpg,.jpeg,.webp,.pdf,image/png,image/jpeg,image/webp,application/pdf"
                className="sr-only"
                id="receipt-upload"
                name="file"
                onChange={handleFileChange}
                type="file"
              />
            </label>

            <div className="rounded-2xl border border-stone-900/10 bg-stone-50/80 px-4 py-3 text-sm leading-7 text-stone-700">
              {statusMessage}
            </div>

            {selectedFile ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-stone-900/10 bg-white px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
                    Selected file
                  </p>
                  <p className="mt-2 break-all text-sm font-medium text-stone-900">
                    {selectedFile.name}
                  </p>
                </div>
                <div className="rounded-2xl border border-stone-900/10 bg-white px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
                    Selected size
                  </p>
                  <p className="mt-2 text-sm font-medium text-stone-900">
                    {formatFileSize(selectedFile.size)}
                  </p>
                </div>
              </div>
            ) : null}

            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                className="inline-flex min-h-12 flex-1 items-center justify-center rounded-full bg-stone-950 px-5 py-3 text-sm font-semibold uppercase tracking-[0.2em] text-stone-50 transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-400"
                disabled={isUploading}
                type="submit"
              >
                {isUploading ? "Uploading..." : "Store receipt locally"}
              </button>

              <button
                className="inline-flex min-h-12 flex-1 items-center justify-center rounded-full border border-amber-900/15 bg-amber-50 px-5 py-3 text-sm font-semibold uppercase tracking-[0.2em] text-amber-950 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:border-stone-300 disabled:bg-stone-100 disabled:text-stone-500"
                disabled={!uploadedFile || isUploading || isRunningOcr}
                onClick={handleRunOcr}
                type="button"
              >
                {isRunningOcr
                  ? "Extracting text..."
                  : ocrText
                    ? "Re-run OCR"
                    : "Extract text"}
              </button>
            </div>
          </form>
        </div>

        <UploadPreview
          apiBaseUrl={apiBaseUrl}
          errorMessage={uploadErrorMessage}
          isUploading={isUploading}
          localPreviewUrl={localPreviewUrl}
          selectedFile={selectedFile}
          uploadedFile={uploadedFile}
        />
      </div>

      <div className="rounded-[1.75rem] border border-stone-900/10 bg-white/80 p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.28em] text-amber-800">
              OCR result
            </p>
            <h2 className="mt-3 font-serif text-3xl tracking-tight text-stone-950">
              Raw extracted text
            </h2>
            <p className="mt-4 max-w-2xl text-base leading-7 text-stone-700">
              This stays intentionally raw. The AI extraction step comes next,
              after the receipt text is visible and reviewable.
            </p>
          </div>

          <button
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-stone-900/10 bg-stone-950 px-5 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-stone-50 transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:border-stone-300 disabled:bg-stone-200 disabled:text-stone-500"
            disabled={
              !uploadedFile || !ocrText || isRunningOcr || isExtractingFields
            }
            onClick={handleExtractFields}
            type="button"
          >
            {isExtractingFields ? "Extracting fields..." : "Extract fields"}
          </button>
        </div>

        {ocrErrorMessage ? (
          <div className="mt-6 rounded-2xl border border-rose-900/10 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-900">
            {ocrErrorMessage}
          </div>
        ) : null}

        <div className="mt-6 rounded-[1.5rem] border border-stone-900/10 bg-stone-950 p-4 text-stone-100">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-300">
              Extracted output
            </p>
            {isRunningOcr ? (
              <span className="rounded-full border border-amber-300/20 bg-amber-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-amber-200">
                Extracting text...
              </span>
            ) : null}
          </div>

          <div className="max-h-80 overflow-y-auto rounded-[1rem] border border-white/10 bg-black/20 p-4">
            {ocrText ? (
              <pre className="whitespace-pre-wrap break-words font-mono text-sm leading-6 text-stone-100">
                {ocrText}
              </pre>
            ) : (
              <p className="text-sm leading-7 text-stone-400">
                Upload a receipt, then click "Extract text" to see the raw OCR
                output here.
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-[1.75rem] border border-stone-900/10 bg-white/80 p-6 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.28em] text-amber-800">
          Extracted fields
        </p>
        <h2 className="mt-3 font-serif text-3xl tracking-tight text-stone-950">
          Review before save
        </h2>
        <p className="mt-4 max-w-2xl text-base leading-7 text-stone-700">
          The AI suggestion should always stay editable. This is the review step
          we will hand off to SQLite persistence in Phase 5.
        </p>

        {extractionErrorMessage ? (
          <div className="mt-6 rounded-2xl border border-rose-900/10 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-900">
            {extractionErrorMessage}
          </div>
        ) : null}

        {!hasExtractedFields && !isExtractingFields ? (
          <div className="mt-6 rounded-[1.5rem] border border-dashed border-stone-900/10 bg-stone-50/70 px-6 py-8 text-sm leading-7 text-stone-600">
            Run OCR, then click "Extract fields" to populate the editable
            expense form.
          </div>
        ) : null}

        {hasExtractedFields || isExtractingFields ? (
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
                Vendor
              </span>
              <input
                className="w-full rounded-2xl border border-stone-900/10 bg-white px-4 py-3 text-sm text-stone-900 outline-none transition focus:border-amber-700/30 focus:ring-2 focus:ring-amber-200"
                disabled={isExtractingFields}
                onChange={(event) =>
                  handleExtractedFieldChange("vendor", event.target.value)
                }
                placeholder="Vendor name"
                type="text"
                value={extractedFields.vendor}
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
                Amount
              </span>
              <input
                className="w-full rounded-2xl border border-stone-900/10 bg-white px-4 py-3 text-sm text-stone-900 outline-none transition focus:border-amber-700/30 focus:ring-2 focus:ring-amber-200"
                disabled={isExtractingFields}
                onChange={(event) =>
                  handleExtractedFieldChange("amount", event.target.value)
                }
                placeholder="0.00"
                step="0.01"
                type="number"
                value={extractedFields.amount}
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
                Date
              </span>
              <input
                className="w-full rounded-2xl border border-stone-900/10 bg-white px-4 py-3 text-sm text-stone-900 outline-none transition focus:border-amber-700/30 focus:ring-2 focus:ring-amber-200"
                disabled={isExtractingFields}
                onChange={(event) =>
                  handleExtractedFieldChange("date", event.target.value)
                }
                type="date"
                value={extractedFields.date}
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
                Category
              </span>
              <select
                className="w-full rounded-2xl border border-stone-900/10 bg-white px-4 py-3 text-sm text-stone-900 outline-none transition focus:border-amber-700/30 focus:ring-2 focus:ring-amber-200"
                disabled={isExtractingFields}
                onChange={(event) =>
                  handleExtractedFieldChange("category", event.target.value)
                }
                value={extractedFields.category}
              >
                <option value="">Select a category</option>
                {CATEGORY_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : null}
      </div>
    </section>
  );
}
