"use client";

import Link from "next/link";
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
const DEMO_RECEIPT_ASSET = "/demo/east-repair-receipt.svg";
const DEMO_RECEIPT_FILENAME = "east-repair-demo-receipt.png";
const WORKFLOW_STEPS = [
  "Load the demo receipt or choose your own file.",
  "Store it locally, then run OCR to inspect the raw text.",
  "Extract editable fields, review them, and save the expense.",
];
const SIGNAL_THEMES = {
  strong: {
    container: "border-emerald-900/10 bg-emerald-50/80 text-emerald-950",
    badge: "border-emerald-900/10 bg-white text-emerald-900",
    accent: "bg-emerald-600",
    eyebrow: "text-emerald-700",
    icon: "border-emerald-900/10 bg-white text-emerald-700",
    label: "High",
  },
  caution: {
    container: "border-amber-900/10 bg-amber-50/80 text-amber-950",
    badge: "border-amber-900/10 bg-white text-amber-900",
    accent: "bg-amber-600",
    eyebrow: "text-amber-700",
    icon: "border-amber-900/10 bg-white text-amber-700",
    label: "Medium",
  },
  warning: {
    container: "border-rose-900/10 bg-rose-50/80 text-rose-950",
    badge: "border-rose-900/10 bg-white text-rose-900",
    accent: "bg-rose-600",
    eyebrow: "text-rose-700",
    icon: "border-rose-900/10 bg-white text-rose-700",
    label: "Low",
  },
};

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

function getReadyMessage(file, source) {
  if (source === "demo") {
    return `${file.name} is ready. This demo should lead to East Repair Inc., $154.06, and the transport category after review.`;
  }

  return `${file.name} is ready to upload. Max file size: ${formatFileSize(MAX_UPLOAD_SIZE_BYTES)}.`;
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

function validateExpenseFields(uploadedFile, fields) {
  if (!uploadedFile?.id) {
    return "Upload a receipt before saving an expense.";
  }

  if (!fields.vendor.trim()) {
    return "Vendor is required before saving.";
  }

  if (!fields.amount || Number.isNaN(Number(fields.amount)) || Number(fields.amount) <= 0) {
    return "Amount must be greater than 0 before saving.";
  }

  if (!fields.date) {
    return "Date is required before saving.";
  }

  if (!fields.category) {
    return "Category is required before saving.";
  }

  return null;
}

function buildReviewHints(fields) {
  const hints = [];

  if (!fields.vendor.trim()) {
    hints.push("Vendor could not be extracted confidently. Compare it against the merchant header before saving.");
  }

  if (!fields.amount) {
    hints.push("Final total is missing. Check the total line or subtotal plus tax on the receipt.");
  }

  if (!fields.date) {
    hints.push("Receipt date is missing. On weak OCR, leaving the date blank is safer than saving a guessed one.");
  }

  if (!fields.category) {
    hints.push("Category still needs a human decision. Choose the closest fit before saving.");
  }

  if (hints.length === 0) {
    hints.push("Draft looks complete. Still verify the merchant name, final total, and receipt date before saving.");
  }

  return hints;
}

function buildOcrAssessment(ocrText) {
  if (!ocrText) {
    return null;
  }

  const normalized = ocrText.toLowerCase();
  const nonEmptyLines = ocrText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const positives = [];
  const warnings = [];
  let score = 0;

  if (nonEmptyLines.length >= 6 || ocrText.length >= 160) {
    score += 1;
    positives.push("OCR captured enough text to compare the draft against the receipt.");
  } else {
    warnings.push("OCR output is short. The receipt may be cropped, faint, or hard to read.");
  }

  if (/(receipt total|total|amount due|subtotal|balance due)/i.test(normalized)) {
    score += 1;
    positives.push("A total-related line was detected in the OCR text.");
  } else {
    warnings.push("No strong total keyword was found. Double-check the final amount before saving.");
  }

  if (/(receipt date|invoice date|issued|date|due date)/i.test(normalized)) {
    score += 1;
    positives.push("A date-related line was detected in the OCR text.");
  } else {
    warnings.push("No clear date keyword was found. Expect the receipt date to need manual review.");
  }

  const unusualCharacterCount = (ocrText.match(/[{}[\]|~_^]/g) || []).length;
  if (unusualCharacterCount >= 4) {
    warnings.push("The OCR text contains several unusual characters, which usually means the scan quality is weak.");
  } else if (nonEmptyLines.length >= 6) {
    score += 1;
    positives.push("Character quality looks reasonably clean for a first pass.");
  }

  let level = "warning";
  if (score >= 3 && warnings.length === 0) {
    level = "strong";
  } else if (score >= 2) {
    level = "caution";
  }

  if (level === "strong") {
    return {
      level,
      badge: "High OCR confidence",
      reason:
        "Detected enough readable text plus clear total and date cues, so the extraction step has strong source material.",
      summary: "The raw text looks healthy enough for the extraction step to be trustworthy, but you should still spot-check the total and date.",
      positives,
      warnings,
    };
  }

  if (level === "caution") {
    return {
      level,
      badge: "Review OCR carefully",
      reason:
        "Detected usable OCR text, but one or more important cues look incomplete or slightly noisy.",
      summary: "The OCR result is usable, but there are some weak spots. Expect at least one field to need manual confirmation.",
      positives,
      warnings,
    };
  }

  return {
    level,
    badge: "Low OCR confidence",
    reason:
      "Detected short or noisy OCR text, missing amount or date cues, or too many unusual characters.",
    summary: "The raw text looks noisy. Treat the next extraction draft as a starting point, not a final answer.",
    positives,
    warnings,
  };
}

function buildExtractionAssessment(fields, ocrAssessment) {
  const populatedCount = Object.values(fields).filter(Boolean).length;

  if (!populatedCount) {
    return null;
  }

  const positives = [];
  const warnings = [];

  if (fields.vendor.trim()) {
    positives.push("Vendor is populated.");
  } else {
    warnings.push("Vendor is missing. Compare the merchant header before saving.");
  }

  if (fields.amount) {
    positives.push("A total amount is present.");
  } else {
    warnings.push("Amount is missing. Check the final total or subtotal plus tax.");
  }

  if (fields.date) {
    positives.push("Receipt date is populated.");
  } else {
    warnings.push("Date is missing. Add it manually if the receipt shows one.");
  }

  if (fields.category) {
    positives.push("Category is selected.");
  } else {
    warnings.push("Category still needs a human decision.");
  }

  if (ocrAssessment?.level === "warning") {
    warnings.push("The OCR step looked weak, so this draft needs a careful human review.");
  } else if (ocrAssessment?.level === "strong" && populatedCount === 4) {
    positives.push("The OCR looked clean and all key fields are filled in.");
  }

  let level = "warning";
  if (populatedCount === 4 && warnings.length === 0) {
    level = "strong";
  } else if (populatedCount >= 3 && warnings.length <= 2) {
    level = "caution";
  }

  if (!fields.amount || !fields.date) {
    level = "warning";
  }

  if (level === "strong") {
    return {
      level,
      badge: "High extraction confidence",
      reason:
        "All core fields are present and the OCR source looked healthy enough to support the draft.",
      summary: "The draft looks complete. You should still compare it with the receipt, but this is a good save candidate.",
      positives,
      warnings,
    };
  }

  if (level === "caution") {
    return {
      level,
      badge: "Review before save",
      reason:
        "Most fields are present, but one or two values still need a deliberate human review.",
      summary: "The draft is mostly there, but at least one field needs a deliberate human check before saving.",
      positives,
      warnings,
    };
  }

  return {
    level,
    badge: "Low extraction confidence",
    reason:
      "Important fields are still weak, missing, or backed by noisy OCR, so the draft should not be trusted without edits.",
    summary: "Important fields are still weak or missing. Fix the draft before you save this expense.",
    positives,
    warnings,
  };
}

function SignalIcon({ level }) {
  if (level === "strong") {
    return (
      <svg
        aria-hidden="true"
        className="h-4 w-4"
        fill="none"
        viewBox="0 0 16 16"
      >
        <path
          d="M3.5 8.5 6.5 11l6-6.5"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.8"
        />
      </svg>
    );
  }

  if (level === "caution") {
    return (
      <svg
        aria-hidden="true"
        className="h-4 w-4"
        fill="none"
        viewBox="0 0 16 16"
      >
        <path
          d="M8 2.5 14 13H2L8 2.5Z"
          stroke="currentColor"
          strokeLinejoin="round"
          strokeWidth="1.4"
        />
        <path
          d="M8 6v3.25"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="1.6"
        />
        <circle cx="8" cy="11.5" fill="currentColor" r=".8" />
      </svg>
    );
  }

  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 16 16"
    >
      <circle cx="8" cy="8" r="5.75" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M8 4.75v3.5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.6"
      />
      <circle cx="8" cy="11.25" fill="currentColor" r=".8" />
    </svg>
  );
}

function AssessmentPanel({ assessment, eyebrow }) {
  if (!assessment) {
    return null;
  }

  const theme = SIGNAL_THEMES[assessment.level];

  return (
    <div className={`mt-6 rounded-[1.5rem] border px-5 py-4 ${theme.container}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className={`text-xs font-semibold uppercase tracking-[0.22em] ${theme.eyebrow}`}>
            {eyebrow}
          </p>
          <div className="mt-2 flex items-center gap-3">
            <span
              className={`inline-flex h-9 w-9 items-center justify-center rounded-full border ${theme.icon}`}
            >
              <SignalIcon level={assessment.level} />
            </span>
            <p className="text-base font-semibold">{assessment.badge}</p>
          </div>
        </div>

        <span
          className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${theme.badge}`}
          title={assessment.reason}
        >
          <SignalIcon level={assessment.level} />
          {theme.label}
        </span>
      </div>

      <p className="mt-3 text-sm leading-7">{assessment.summary}</p>
      <p className="mt-3 text-sm leading-6 opacity-80">
        <span className="font-semibold">Why this signal:</span>{" "}
        {assessment.reason}
      </p>

      {assessment.positives.length > 0 ? (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] opacity-75">
            Looks good
          </p>
          <ul className="mt-2 space-y-2">
            {assessment.positives.map((item) => (
              <li className="flex items-start gap-3 text-sm leading-6" key={item}>
                <span className={`mt-2 h-2 w-2 rounded-full ${theme.accent}`} />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {assessment.warnings.length > 0 ? (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] opacity-75">
            Watch out
          </p>
          <ul className="mt-2 space-y-2">
            {assessment.warnings.map((item) => (
              <li className="flex items-start gap-3 text-sm leading-6" key={item}>
                <span className="mt-2 h-2 w-2 rounded-full bg-current opacity-70" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

async function svgToPngFile(svgText, fileName) {
  const svgBlob = new Blob([svgText], {
    type: "image/svg+xml;charset=utf-8",
  });
  const svgUrl = URL.createObjectURL(svgBlob);

  try {
    const image = await new Promise((resolve, reject) => {
      const nextImage = new window.Image();
      nextImage.onload = () => resolve(nextImage);
      nextImage.onerror = () =>
        reject(new Error("Unable to render the demo receipt image."));
      nextImage.src = svgUrl;
    });

    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth || 1200;
    canvas.height = image.naturalHeight || 1600;

    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Unable to prepare the demo receipt for upload.");
    }

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    const pngBlob = await new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error("Unable to convert the demo receipt into a PNG file."));
          return;
        }

        resolve(blob);
      }, "image/png");
    });

    return new File([pngBlob], fileName, {
      type: "image/png",
      lastModified: Date.now(),
    });
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}

async function loadDemoReceiptFile() {
  const response = await fetch(DEMO_RECEIPT_ASSET, {
    cache: "force-cache",
  });

  if (!response.ok) {
    throw new Error("The demo receipt could not be loaded.");
  }

  const svgText = await response.text();
  return svgToPngFile(svgText, DEMO_RECEIPT_FILENAME);
}

export default function UploadForm({ apiBaseUrl }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [selectedSource, setSelectedSource] = useState("manual");
  const [localPreviewUrl, setLocalPreviewUrl] = useState(null);
  const [uploadedFile, setUploadedFile] = useState(null);
  const [ocrText, setOcrText] = useState("");
  const [extractedFields, setExtractedFields] = useState(
    createEmptyExtractedFields()
  );
  const [uploadErrorMessage, setUploadErrorMessage] = useState("");
  const [ocrErrorMessage, setOcrErrorMessage] = useState("");
  const [extractionErrorMessage, setExtractionErrorMessage] = useState("");
  const [saveErrorMessage, setSaveErrorMessage] = useState("");
  const [statusMessage, setStatusMessage] = useState(
    "Choose a receipt image or PDF, or load the demo receipt, to get started."
  );
  const [savedExpense, setSavedExpense] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isRunningOcr, setIsRunningOcr] = useState(false);
  const [isExtractingFields, setIsExtractingFields] = useState(false);
  const [isSavingExpense, setIsSavingExpense] = useState(false);
  const [isPreparingDemo, setIsPreparingDemo] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);

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
    setSaveErrorMessage("");
    setSavedExpense(null);
  }

  function applySelectedFile(file, source = "manual") {
    setSelectedFile(file);
    setSelectedSource(file ? source : "manual");
    setUploadedFile(null);
    resetDerivedState();

    if (!file) {
      setUploadErrorMessage("");
      setStatusMessage("Choose a receipt image or PDF, or load the demo receipt, to get started.");
      return;
    }

    const validationError = validateFile(file);
    if (validationError) {
      setUploadErrorMessage(validationError);
      setStatusMessage("Pick a supported receipt file and try again.");
      return;
    }

    setUploadErrorMessage("");
    setStatusMessage(getReadyMessage(file, source));
  }

  function handleFileChange(event) {
    const file = event.target.files?.[0] ?? null;
    applySelectedFile(file, "manual");
  }

  function handleDragOver(event) {
    event.preventDefault();
    setIsDragActive(true);
  }

  function handleDragLeave(event) {
    event.preventDefault();
    if (event.currentTarget.contains(event.relatedTarget)) {
      return;
    }

    setIsDragActive(false);
  }

  function handleDrop(event) {
    event.preventDefault();
    setIsDragActive(false);
    const file = event.dataTransfer.files?.[0] ?? null;
    applySelectedFile(file, "manual");
  }

  async function handleLoadDemoReceipt() {
    setIsPreparingDemo(true);
    setUploadErrorMessage("");
    setStatusMessage("Loading the demo receipt...");

    try {
      const demoFile = await loadDemoReceiptFile();
      applySelectedFile(demoFile, "demo");
    } catch (error) {
      setUploadErrorMessage(
        error instanceof Error
          ? error.message
          : "The demo receipt could not be loaded."
      );
      setStatusMessage("Demo receipt did not load.");
    } finally {
      setIsPreparingDemo(false);
    }
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
      setStatusMessage("Upload complete. Run OCR to see exactly what the receipt text looks like.");
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
    setSaveErrorMessage("");
    setSavedExpense(null);
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
    setSaveErrorMessage("");
    setSavedExpense(null);
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
        "AI extraction complete. Review the fields below, then save the expense if everything looks right."
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
    setSaveErrorMessage("");
    setSavedExpense(null);
    setExtractedFields((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function handleSaveExpense() {
    const validationError = validateExpenseFields(uploadedFile, extractedFields);
    if (validationError) {
      setSaveErrorMessage(validationError);
      setStatusMessage("Fix the reviewed fields before saving.");
      return;
    }

    setIsSavingExpense(true);
    setSaveErrorMessage("");
    setStatusMessage("Saving reviewed expense into SQLite...");

    try {
      const response = await fetch(`${apiBaseUrl}/api/expenses`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          upload_id: uploadedFile.id,
          vendor: extractedFields.vendor.trim(),
          amount: Number(extractedFields.amount),
          date: extractedFields.date,
          category: extractedFields.category,
        }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.detail ?? "Expense save failed. Please try again.");
      }

      setSavedExpense(payload);
      setStatusMessage("Expense saved successfully.");
    } catch (error) {
      setSavedExpense(null);
      setSaveErrorMessage(
        error instanceof Error
          ? error.message
          : "Expense save failed. Please try again."
      );
      setStatusMessage("Expense save did not complete.");
    } finally {
      setIsSavingExpense(false);
    }
  }

  const hasExtractedFields = Object.values(extractedFields).some(Boolean);
  const reviewHints = buildReviewHints(extractedFields);
  const ocrAssessment = buildOcrAssessment(ocrText);
  const extractionAssessment = buildExtractionAssessment(
    extractedFields,
    ocrAssessment
  );
  const shouldWarnBeforeSave =
    extractionAssessment?.level === "warning" && !savedExpense;
  const canSaveExpense =
    Boolean(uploadedFile?.id) &&
    hasExtractedFields &&
    !isUploading &&
    !isRunningOcr &&
    !isExtractingFields &&
    !isSavingExpense &&
    !savedExpense;

  return (
    <section className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
        <div className="rounded-[1.75rem] border border-stone-900/10 bg-white/80 p-6 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-amber-800">
            Core workflow
          </p>
          <h2 className="mt-3 font-serif text-3xl tracking-tight text-stone-950">
            Receipt upload, OCR, review, and save
          </h2>
          <p className="mt-4 max-w-2xl text-base leading-7 text-stone-700">
            Start with a bundled demo receipt or bring your own file. The flow
            stays simple: upload, inspect the raw OCR, review the AI draft, and
            save only when the record looks trustworthy.
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {WORKFLOW_STEPS.map((step, index) => (
              <div
                className="rounded-[1.35rem] border border-stone-900/10 bg-stone-50/80 px-4 py-4"
                key={step}
              >
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-800">
                  Step {index + 1}
                </p>
                <p className="mt-3 text-sm leading-6 text-stone-700">{step}</p>
              </div>
            ))}
          </div>

          <div className="mt-6 rounded-[1.5rem] border border-sky-900/10 bg-sky-50/80 px-5 py-4 text-sm leading-7 text-sky-950">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-700">
              First run tip
            </p>
            <p className="mt-2">
              Use the demo receipt if you want a predictable walkthrough. It
              should lead to East Repair Inc., a total of $154.06, and the
              transport category after review.
            </p>
          </div>

          <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
            <label
              className={`flex cursor-pointer flex-col items-center justify-center rounded-[1.75rem] border border-dashed px-6 py-10 text-center transition ${
                isDragActive
                  ? "border-amber-700/50 bg-amber-50"
                  : "border-stone-900/15 bg-stone-50/80 hover:border-amber-700/30 hover:bg-amber-50/40"
              }`}
              htmlFor="receipt-upload"
              onDragLeave={handleDragLeave}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
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
              <span className="mt-2 max-w-md text-sm leading-7 text-stone-500">
                Best results come from flat, high-contrast receipts or clean
                PDFs with the total and receipt date visible.
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
              <div className="grid gap-3 sm:grid-cols-3">
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
                <div className="rounded-2xl border border-stone-900/10 bg-white px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
                    Source
                  </p>
                  <p className="mt-2 text-sm font-medium text-stone-900">
                    {selectedSource === "demo" ? "Bundled demo receipt" : "Your file"}
                  </p>
                </div>
              </div>
            ) : null}

            <div className="flex flex-col gap-3 lg:flex-row">
              <button
                className="inline-flex min-h-12 flex-1 items-center justify-center rounded-full bg-stone-950 px-5 py-3 text-sm font-semibold uppercase tracking-[0.2em] text-stone-50 transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-400"
                disabled={
                  isUploading ||
                  isPreparingDemo ||
                  !selectedFile ||
                  Boolean(uploadErrorMessage)
                }
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

              <button
                className="inline-flex min-h-12 flex-1 items-center justify-center rounded-full border border-sky-900/10 bg-sky-50 px-5 py-3 text-sm font-semibold uppercase tracking-[0.2em] text-sky-950 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:border-stone-300 disabled:bg-stone-100 disabled:text-stone-500"
                disabled={isUploading || isRunningOcr || isPreparingDemo}
                onClick={handleLoadDemoReceipt}
                type="button"
              >
                {isPreparingDemo ? "Loading demo..." : "Try demo receipt"}
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
          selectedSource={selectedSource}
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
              This stays intentionally raw. Messy OCR is expected. The next step
              turns it into editable fields, but the raw text stays visible so
              you can see what the model saw.
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

        <AssessmentPanel
          assessment={ocrAssessment}
          eyebrow="OCR confidence"
        />

        {ocrText ? (
          <div className="mt-6 rounded-2xl border border-amber-900/10 bg-amber-50/80 px-4 py-3 text-sm leading-6 text-amber-950">
            OCR output can be noisy, especially on screenshots, skewed photos,
            or dense layouts. That is normal. Use the next step to turn it into
            a clean draft, then review it before saving.
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
          The AI suggestion should always stay editable. Review the merchant,
          final total, receipt date, and category before saving a permanent
          expense record.
        </p>

        {extractionErrorMessage ? (
          <div className="mt-6 rounded-2xl border border-rose-900/10 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-900">
            {extractionErrorMessage}
          </div>
        ) : null}

        {saveErrorMessage ? (
          <div className="mt-6 rounded-2xl border border-rose-900/10 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-900">
            {saveErrorMessage}
          </div>
        ) : null}

        <AssessmentPanel
          assessment={extractionAssessment}
          eyebrow="Extraction confidence"
        />

        {(hasExtractedFields || isExtractingFields) ? (
          <div className="mt-6 rounded-[1.5rem] border border-amber-900/10 bg-amber-50/80 px-5 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-800">
              Review guidance
            </p>
            <ul className="mt-3 space-y-2">
              {reviewHints.map((hint) => (
                <li className="flex items-start gap-3 text-sm leading-6 text-stone-700" key={hint}>
                  <span className="mt-2 h-2 w-2 rounded-full bg-amber-600" />
                  <span>{hint}</span>
                </li>
              ))}
            </ul>
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

        <div className="mt-6 flex flex-col gap-4 border-t border-stone-900/10 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-xl space-y-3">
            <p className="text-sm leading-7 text-stone-600">
              Save the reviewed fields as a permanent expense record in SQLite.
            </p>

            {shouldWarnBeforeSave ? (
              <div className="rounded-2xl border border-amber-900/10 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">
                We recommend one more review before saving. The extraction still
                looks weak, so check the vendor, amount, and date against the
                receipt first.
              </div>
            ) : null}
          </div>

          <button
            className="inline-flex min-h-12 items-center justify-center rounded-full bg-emerald-700 px-6 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-stone-300"
            disabled={!canSaveExpense}
            onClick={handleSaveExpense}
            type="button"
          >
            {isSavingExpense ? "Saving..." : savedExpense ? "Saved" : "Save expense"}
          </button>
        </div>

        {savedExpense ? (
          <div className="mt-6 rounded-[1.5rem] border border-emerald-900/10 bg-emerald-50/80 p-5 text-emerald-950">
            <p className="text-sm font-semibold uppercase tracking-[0.2em]">
              Expense saved
            </p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl bg-white/80 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
                  Expense ID
                </p>
                <p className="mt-2 text-sm font-medium text-stone-900">
                  {savedExpense.id}
                </p>
              </div>
              <div className="rounded-2xl bg-white/80 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
                  Vendor
                </p>
                <p className="mt-2 text-sm font-medium text-stone-900">
                  {savedExpense.vendor}
                </p>
              </div>
              <div className="rounded-2xl bg-white/80 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
                  Amount
                </p>
                <p className="mt-2 text-sm font-medium text-stone-900">
                  {savedExpense.amount}
                </p>
              </div>
              <div className="rounded-2xl bg-white/80 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
                  Category
                </p>
                <p className="mt-2 text-sm font-medium capitalize text-stone-900">
                  {savedExpense.category}
                </p>
              </div>
            </div>

            <div className="mt-5">
              <Link
                className="inline-flex min-h-11 items-center justify-center rounded-full border border-emerald-900/10 bg-white px-5 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-emerald-950 transition hover:bg-emerald-100"
                href="/expenses"
              >
                Open expense workspace
              </Link>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
