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

function formatFileSize(size) {
  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  return `${(size / (1024 * 1024)).toFixed(2)} MB`;
}

function getErrorMessage(responseStatus, fallbackMessage) {
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
  const [errorMessage, setErrorMessage] = useState("");
  const [statusMessage, setStatusMessage] = useState(
    "Upload a receipt image or PDF to store it locally."
  );
  const [isUploading, setIsUploading] = useState(false);

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

  function handleFileChange(event) {
    const file = event.target.files?.[0] ?? null;
    setSelectedFile(file);
    setUploadedFile(null);

    if (!file) {
      setErrorMessage("");
      setStatusMessage("Upload a receipt image or PDF to store it locally.");
      return;
    }

    const validationError = validateFile(file);
    if (validationError) {
      setErrorMessage(validationError);
      setStatusMessage("Pick a supported receipt file and try again.");
      return;
    }

    setErrorMessage("");
    setStatusMessage(
      `${file.name} is ready to upload. Max file size: ${formatFileSize(MAX_UPLOAD_SIZE_BYTES)}.`
    );
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const validationError = validateFile(selectedFile);
    if (validationError) {
      setErrorMessage(validationError);
      setStatusMessage("Fix the file issue before uploading.");
      return;
    }

    const formData = new FormData();
    formData.append("file", selectedFile);

    setIsUploading(true);
    setErrorMessage("");
    setStatusMessage("Uploading receipt and storing it locally...");

    try {
      const response = await fetch(`${apiBaseUrl}/api/uploads`, {
        method: "POST",
        body: formData,
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          getErrorMessage(response.status, payload?.detail ?? response.statusText)
        );
      }

      setUploadedFile(payload);
      setStatusMessage(
        "Upload complete. The stored file preview is now available below."
      );
    } catch (error) {
      setUploadedFile(null);
      setErrorMessage(
        error instanceof Error ? error.message : "Upload failed. Please try again."
      );
      setStatusMessage("Upload did not complete.");
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <section className="grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
      <div className="rounded-[1.75rem] border border-stone-900/10 bg-white/80 p-6 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.28em] text-amber-800">
          Phase 2
        </p>
        <h2 className="mt-3 font-serif text-3xl tracking-tight text-stone-950">
          Receipt upload
        </h2>
        <p className="mt-4 max-w-2xl text-base leading-7 text-stone-700">
          Upload a receipt image or PDF, validate it on the backend, store it
          locally, and preview the saved file before we move into OCR.
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

          <button
            className="inline-flex min-h-12 w-full items-center justify-center rounded-full bg-stone-950 px-5 py-3 text-sm font-semibold uppercase tracking-[0.2em] text-stone-50 transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-400"
            disabled={isUploading}
            type="submit"
          >
            {isUploading ? "Uploading..." : "Store receipt locally"}
          </button>
        </form>
      </div>

      <UploadPreview
        apiBaseUrl={apiBaseUrl}
        errorMessage={errorMessage}
        isUploading={isUploading}
        localPreviewUrl={localPreviewUrl}
        selectedFile={selectedFile}
        uploadedFile={uploadedFile}
      />
    </section>
  );
}
