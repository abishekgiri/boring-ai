"use client";

function formatFileSize(size) {
  if (!Number.isFinite(size)) {
    return "Unknown size";
  }

  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  return `${(size / (1024 * 1024)).toFixed(2)} MB`;
}

function buildPreviewUrl(apiBaseUrl, fileUrl) {
  if (!fileUrl) {
    return null;
  }

  return new URL(fileUrl, apiBaseUrl).toString();
}

export default function UploadPreview({
  apiBaseUrl,
  selectedFile,
  localPreviewUrl,
  uploadedFile,
  isUploading,
  errorMessage,
}) {
  const uploadedPreviewUrl = buildPreviewUrl(apiBaseUrl, uploadedFile?.file_url);
  const previewUrl = uploadedPreviewUrl ?? localPreviewUrl;
  const contentType = uploadedFile?.content_type ?? selectedFile?.type ?? "";
  const isImage = contentType.startsWith("image/");
  const isPdf = contentType === "application/pdf";

  return (
    <div className="rounded-[1.75rem] border border-stone-900/10 bg-white/80 p-5 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-amber-800">
            Preview
          </p>
          <h3 className="mt-2 font-serif text-2xl tracking-tight text-stone-950">
            {uploadedFile ? "Stored file" : selectedFile ? "Selected file" : "Waiting for upload"}
          </h3>
        </div>
        {isUploading ? (
          <span className="rounded-full border border-amber-900/10 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-amber-900">
            Uploading
          </span>
        ) : uploadedFile ? (
          <span className="rounded-full border border-emerald-900/10 bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-900">
            Stored locally
          </span>
        ) : null}
      </div>

      {errorMessage ? (
        <div className="mt-5 rounded-2xl border border-rose-900/10 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-900">
          {errorMessage}
        </div>
      ) : null}

      {!selectedFile && !uploadedFile ? (
        <div className="mt-5 flex min-h-72 items-center justify-center rounded-[1.5rem] border border-dashed border-stone-900/10 bg-stone-50/70 px-6 text-center text-sm leading-7 text-stone-600">
          Choose a receipt image or PDF to see the preview area come alive.
        </div>
      ) : (
        <div className="mt-5 space-y-4">
          <div className="rounded-[1.5rem] border border-stone-900/10 bg-stone-50/70 p-4">
            {isImage && previewUrl ? (
              <img
                alt={uploadedFile?.filename ?? selectedFile?.name ?? "Receipt preview"}
                className="h-72 w-full rounded-[1rem] object-contain bg-white"
                src={previewUrl}
              />
            ) : null}

            {isPdf && previewUrl ? (
              <iframe
                className="h-72 w-full rounded-[1rem] bg-white"
                src={previewUrl}
                title={uploadedFile?.filename ?? selectedFile?.name ?? "PDF preview"}
              />
            ) : null}

            {!isImage && !isPdf ? (
              <div className="flex h-72 items-center justify-center rounded-[1rem] border border-dashed border-stone-900/10 bg-white px-6 text-center text-sm leading-7 text-stone-600">
                Preview is available after a valid image or PDF is selected.
              </div>
            ) : null}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-stone-900/10 bg-white px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
                Filename
              </p>
              <p className="mt-2 break-all text-sm font-medium text-stone-900">
                {uploadedFile?.filename ?? selectedFile?.name ?? "Unknown"}
              </p>
            </div>

            <div className="rounded-2xl border border-stone-900/10 bg-white px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
                Size
              </p>
              <p className="mt-2 text-sm font-medium text-stone-900">
                {formatFileSize(uploadedFile?.size ?? selectedFile?.size ?? 0)}
              </p>
            </div>

            <div className="rounded-2xl border border-stone-900/10 bg-white px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
                Type
              </p>
              <p className="mt-2 text-sm font-medium text-stone-900">
                {uploadedFile?.content_type ?? selectedFile?.type ?? "Unknown"}
              </p>
            </div>

            <div className="rounded-2xl border border-stone-900/10 bg-white px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
                File URL
              </p>
              <p className="mt-2 break-all text-sm font-medium text-stone-900">
                {uploadedFile?.file_url ?? "Generated after upload"}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
