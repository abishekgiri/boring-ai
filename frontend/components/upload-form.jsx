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
const CATEGORY_KEYWORDS = {
  meals: ["restaurant", "cafe", "coffee", "meal", "food", "lunch", "dinner"],
  travel: ["flight", "airline", "trip", "ticket", "boarding"],
  software: ["software", "subscription", "saas", "github", "vercel", "render", "openai", "aws"],
  office: ["office", "supplies", "printer", "paper", "staples"],
  shopping: ["walmart", "target", "amazon", "market", "store", "retail"],
  transport: ["uber", "lyft", "taxi", "parking", "toll", "fuel", "repair", "brake", "pedal", "auto", "vehicle"],
  lodging: ["hotel", "motel", "inn", "suite", "hostel", "airbnb", "resort", "stay"],
  utilities: ["internet", "phone", "wireless", "electric", "water", "utility"],
};
const CATEGORY_VENDOR_HINTS = {
  meals: ["starbucks", "dunkin", "mcdonald", "chipotle", "subway", "panera", "sweetgreen"],
  travel: ["delta", "united", "southwest", "american airlines", "jetblue", "expedia", "booking.com"],
  software: ["amazon web services", "aws", "openai", "github", "vercel", "render", "figma", "notion", "slack", "linear", "adobe"],
  office: ["staples", "office depot", "fedex office"],
  shopping: ["walmart", "target", "costco", "best buy", "amazon"],
  transport: ["uber", "lyft", "shell", "chevron", "exxon", "bp", "jiffy lube", "autozone"],
  lodging: ["hilton", "marriott", "hyatt", "holiday inn", "airbnb", "motel 6"],
  utilities: ["xfinity", "comcast", "verizon", "at&t", "att", "t-mobile", "tmobile"],
};
const GENERIC_VENDOR_HINTS = [
  "receipt",
  "invoice",
  "bill to",
  "ship to",
  "payment",
  "terms",
  "customer",
  "subtotal",
  "total",
  "amount due",
];

function createEmptyExtractedFields() {
  return {
    vendor: "",
    amount: "",
    date: "",
    category: "",
    subtotal: "",
    tax_amount: "",
    receipt_number: "",
    due_date: "",
    payment_method: "",
    line_items: [],
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
    subtotal:
      fields?.subtotal === null || fields?.subtotal === undefined
        ? ""
        : String(fields.subtotal),
    tax_amount:
      fields?.tax_amount === null || fields?.tax_amount === undefined
        ? ""
        : String(fields.tax_amount),
    receipt_number: fields?.receipt_number ?? "",
    due_date: fields?.due_date ?? "",
    payment_method: fields?.payment_method ?? "",
    line_items: Array.isArray(fields?.line_items)
      ? fields.line_items.map((item) => ({
          description: item?.description ?? "",
          quantity:
            item?.quantity === null || item?.quantity === undefined
              ? ""
              : String(item.quantity),
          unit_price:
            item?.unit_price === null || item?.unit_price === undefined
              ? ""
              : String(item.unit_price),
          line_total:
            item?.line_total === null || item?.line_total === undefined
              ? ""
              : String(item.line_total),
        }))
      : [],
  };
}

function countCoreFields(fields) {
  return [fields.vendor, fields.amount, fields.date, fields.category].filter(Boolean)
    .length;
}

function hasAnyExtractedField(fields) {
  return (
    Boolean(fields.vendor) ||
    Boolean(fields.amount) ||
    Boolean(fields.date) ||
    Boolean(fields.category) ||
    Boolean(fields.subtotal) ||
    Boolean(fields.tax_amount) ||
    Boolean(fields.receipt_number) ||
    Boolean(fields.due_date) ||
    Boolean(fields.payment_method) ||
    (Array.isArray(fields.line_items) && fields.line_items.length > 0)
  );
}

function formatPaymentMethod(value) {
  if (!value) {
    return "Not detected";
  }

  return String(value)
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatQuantityValue(value) {
  const quantity = Number(value);
  if (!Number.isFinite(quantity)) {
    return String(value ?? "");
  }

  return Number.isInteger(quantity) ? String(quantity) : String(quantity);
}

function buildLearningContext(snapshot, currentFields) {
  const observedVendor = snapshot?.vendor?.trim() || null;
  const observedCategory = snapshot?.category || null;
  const hasVendorChange =
    Boolean(observedVendor) && observedVendor !== currentFields.vendor.trim();
  const hasCategoryChange =
    Boolean(observedCategory) && observedCategory !== currentFields.category;

  if (!hasVendorChange && !hasCategoryChange) {
    return null;
  }

  return {
    observed_vendor: observedVendor,
    observed_category: observedCategory,
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

function validateExpenseFields(uploadedFile, ocrText, fields) {
  const validation = buildFieldValidation(uploadedFile, ocrText, fields);
  return validation.blocking[0] ?? null;
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

  if (fields.subtotal && fields.tax_amount) {
    hints.push("Subtotal and tax were detected separately. Compare them against the receipt to confirm the final total.");
  }

  if (fields.receipt_number) {
    hints.push("Receipt number was detected. Keep it in mind when checking for duplicates or sharing the record with an accountant.");
  }

  if (Array.isArray(fields.line_items) && fields.line_items.length > 0) {
    hints.push("Line items were detected. Use them to verify whether the category and subtotal make sense.");
  }

  if (hints.length === 0) {
    hints.push("Draft looks complete. Still verify the merchant name, final total, and receipt date before saving.");
  }

  return hints;
}

function normalizeComparableText(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeFieldValue(value) {
  return String(value ?? "").trim().toLowerCase();
}

function includesComparableText(haystack, needle) {
  const normalizedHaystack = normalizeComparableText(haystack);
  const normalizedNeedle = normalizeComparableText(needle);
  if (!normalizedNeedle) {
    return false;
  }

  return normalizedHaystack.includes(normalizedNeedle);
}

function buildAmountCandidates(amountValue) {
  const parsedAmount = Number(amountValue);
  if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
    return [];
  }

  const fixed = parsedAmount.toFixed(2);
  const noTrailingZeros = fixed.replace(/\.00$/, "");

  return Array.from(
    new Set([
      fixed,
      noTrailingZeros,
      `$${fixed}`,
      `$${noTrailingZeros}`,
    ])
  );
}

function buildDateCandidates(dateValue) {
  if (!dateValue) {
    return [];
  }

  const [year, month, day] = String(dateValue).split("-");
  if (!year || !month || !day) {
    return [String(dateValue)];
  }

  const monthNumber = String(Number(month));
  const dayNumber = String(Number(day));

  return Array.from(
    new Set([
      `${year}-${month}-${day}`,
      `${month}/${day}/${year}`,
      `${monthNumber}/${dayNumber}/${year}`,
      `${month}-${day}-${year}`,
      `${monthNumber}-${dayNumber}-${year}`,
    ])
  );
}

function extractLabeledAmount(ocrText, matcher) {
  const lines = String(ocrText ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    if (!matcher.test(line)) {
      continue;
    }

    const matches = line.match(/\d[\d,]*\.\d{2}/g);
    if (!matches?.length) {
      continue;
    }

    const amount = Number(matches[matches.length - 1].replace(/,/g, ""));
    if (Number.isFinite(amount)) {
      return amount;
    }
  }

  return null;
}

function parseIsoDateValue(value) {
  if (!value) {
    return null;
  }

  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

function formatCurrencyValue(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) {
    return String(value ?? "");
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

function formatShortDate(value) {
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function buildFieldValidation(uploadedFile, ocrText, fields) {
  const blocking = [];
  const warnings = [];
  const vendor = fields.vendor.trim();
  const amount = Number(fields.amount);
  const parsedDate = parseIsoDateValue(fields.date);
  const normalizedVendor = vendor.toLowerCase();

  if (!uploadedFile?.id) {
    blocking.push("Upload a receipt before saving an expense.");
  }

  if (!vendor) {
    blocking.push("Vendor is required before saving.");
  } else {
    if (vendor.length < 3) {
      warnings.push("Vendor looks unusually short. Double-check that it is the merchant name, not an OCR fragment.");
    }

    if (GENERIC_VENDOR_HINTS.some((hint) => normalizedVendor.includes(hint))) {
      warnings.push("Vendor looks generic or label-like. Compare it against the merchant header before saving.");
    }

    if (/@/.test(vendor) || /\d{3,}/.test(vendor)) {
      warnings.push("Vendor contains an email address or long number sequence, which usually means OCR picked up the wrong line.");
    }
  }

  if (!fields.amount || Number.isNaN(amount) || amount <= 0) {
    blocking.push("Amount must be greater than 0 before saving.");
  } else {
    const extractedSubtotal = Number(fields.subtotal);
    const extractedTaxAmount = Number(fields.tax_amount);
    const totalFromOcr = extractLabeledAmount(
      ocrText,
      /(receipt total|grand total|amount due|total due|balance due|total)/i
    );
    const subtotalFromOcr =
      Number.isFinite(extractedSubtotal) && extractedSubtotal > 0
        ? extractedSubtotal
        : extractLabeledAmount(ocrText, /subtotal/i);
    const taxFromOcr =
      Number.isFinite(extractedTaxAmount) && extractedTaxAmount >= 0
        ? extractedTaxAmount
        : extractLabeledAmount(ocrText, /(sales tax|tax)/i);

    if (amount > 100000) {
      warnings.push(`Amount looks unusually large at ${formatCurrencyValue(amount)}. Double-check that OCR did not over-read a number.`);
    }

    if (
      Number.isFinite(totalFromOcr) &&
      Math.abs(totalFromOcr - amount) > 0.01
    ) {
      warnings.push(
        `Saved amount ${formatCurrencyValue(amount)} does not match the OCR total line (${formatCurrencyValue(totalFromOcr)}).`
      );
    }

    if (
      Number.isFinite(subtotalFromOcr) &&
      amount + 0.01 < subtotalFromOcr
    ) {
      warnings.push(
        `Saved amount ${formatCurrencyValue(amount)} is lower than the OCR subtotal (${formatCurrencyValue(subtotalFromOcr)}).`
      );
    }

    if (
      Number.isFinite(subtotalFromOcr) &&
      Number.isFinite(taxFromOcr)
    ) {
      const expectedTotal = Number((subtotalFromOcr + taxFromOcr).toFixed(2));
      if (Math.abs(expectedTotal - amount) > 0.05) {
        warnings.push(
          `OCR suggests subtotal plus tax equals ${formatCurrencyValue(expectedTotal)}, which does not match the saved amount ${formatCurrencyValue(amount)}.`
        );
      }
    }
  }

  if (!fields.date) {
    blocking.push("Date is required before saving.");
  } else if (!parsedDate) {
    blocking.push("Date must be a valid calendar date before saving.");
  } else {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const maxFutureDate = new Date(today);
    maxFutureDate.setDate(maxFutureDate.getDate() + 1);

    if (parsedDate > maxFutureDate) {
      warnings.push("Date is in the future. Double-check that the receipt date was not confused with a due date.");
    }

    if (parsedDate.getFullYear() < 2000) {
      warnings.push("Date looks unusually old. Double-check the OCR year before saving.");
    }
  }

  if (!fields.category) {
    blocking.push("Category is required before saving.");
  }

  return {
    blocking,
    warnings,
  };
}

function buildFieldConfidence(ocrText, fields, ocrAssessment, snapshot) {
  if (!fields) {
    return null;
  }

  const nonEmptyLines = String(ocrText ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const topLines = nonEmptyLines.slice(0, 6);
  const normalizedOcr = normalizeComparableText(ocrText);

  function applyEditedOverride(fieldName, confidence) {
    const originalValue = snapshot?.[fieldName];
    const currentValue = fields?.[fieldName];

    if (!normalizeFieldValue(currentValue)) {
      return confidence;
    }

    if (
      normalizeFieldValue(originalValue) &&
      normalizeFieldValue(originalValue) !== normalizeFieldValue(currentValue)
    ) {
      return {
        level: "caution",
        badge: "Reviewed manually",
        reason:
          "You changed this field after extraction, so this value now depends on your review rather than the original model guess.",
      };
    }

    return confidence;
  }

  function maybeDowngradeFromWeakOcr(confidence) {
    if (!confidence) {
      return confidence;
    }

    if (ocrAssessment?.level === "warning" && confidence.level === "strong") {
      return {
        ...confidence,
        level: "caution",
        badge: "Medium confidence",
        reason: `${confidence.reason} OCR quality looked weak, so this field should still be reviewed carefully.`,
      };
    }

    return confidence;
  }

  function buildVendorConfidence() {
    if (!fields.vendor.trim()) {
      return {
        level: "warning",
        badge: "Low confidence",
        reason: "Vendor is missing, so there is nothing trustworthy to save yet.",
      };
    }

    if (topLines.some((line) => includesComparableText(line, fields.vendor))) {
      return {
        level: "strong",
        badge: "High confidence",
        reason: "Vendor matches the receipt header area, which is usually the strongest source for the merchant name.",
      };
    }

    if (nonEmptyLines.some((line) => includesComparableText(line, fields.vendor))) {
      return {
        level: "caution",
        badge: "Medium confidence",
        reason: "Vendor appears somewhere in the OCR text, but not clearly in the top header lines.",
      };
    }

    return {
      level: "warning",
      badge: "Low confidence",
      reason: "Vendor does not clearly match the OCR text, so it may have been inferred incorrectly.",
    };
  }

  function buildAmountConfidence() {
    if (!fields.amount) {
      return {
        level: "warning",
        badge: "Low confidence",
        reason: "Amount is missing, so the draft still needs a human to fill in the final total.",
      };
    }

    const candidates = buildAmountCandidates(fields.amount);
    const totalLine = nonEmptyLines.find((line) =>
      /(receipt total|grand total|amount due|total due|total)/i.test(line)
    );

    if (
      totalLine &&
      candidates.some((candidate) => totalLine.includes(candidate))
    ) {
      return {
        level: "strong",
        badge: "High confidence",
        reason: "Amount matches a total-like line in the OCR text, which is the strongest indicator for the final charge.",
      };
    }

    if (
      candidates.some((candidate) => normalizedOcr.includes(candidate.toLowerCase()))
    ) {
      return {
        level: "caution",
        badge: "Medium confidence",
        reason: "Amount appears in the OCR text, but not on a clearly labeled total line.",
      };
    }

    return {
      level: "warning",
      badge: "Low confidence",
      reason: "Amount is not clearly supported by the OCR text, so it may be incorrect.",
    };
  }

  function buildDateConfidence() {
    if (!fields.date) {
      return {
        level: "warning",
        badge: "Low confidence",
        reason: "Date is missing, so the receipt still needs a manual date review.",
      };
    }

    const candidates = buildDateCandidates(fields.date);
    const dateLine = nonEmptyLines.find((line) =>
      /(receipt date|invoice date|date|issued|due date)/i.test(line)
    );

    if (
      dateLine &&
      candidates.some((candidate) => dateLine.includes(candidate))
    ) {
      return {
        level: "strong",
        badge: "High confidence",
        reason: "Date matches a date-like line in the OCR output, which is a strong signal for the receipt date.",
      };
    }

    if (
      candidates.some((candidate) => normalizedOcr.includes(candidate.toLowerCase()))
    ) {
      return {
        level: "caution",
        badge: "Medium confidence",
        reason: "Date appears in the OCR text, but not on a clearly labeled date line.",
      };
    }

    return {
      level: "warning",
      badge: "Low confidence",
      reason: "Date is not clearly supported by the OCR text and may have been inferred loosely.",
    };
  }

  function buildCategoryConfidence() {
    if (!fields.category) {
      return {
        level: "warning",
        badge: "Low confidence",
        reason: "Category is still empty, so it needs a human decision before save.",
      };
    }

    const keywords = CATEGORY_KEYWORDS[fields.category] ?? [];
    const vendorHints = CATEGORY_VENDOR_HINTS[fields.category] ?? [];
    const lineItemText = Array.isArray(fields.line_items)
      ? fields.line_items
          .map((item) => String(item?.description ?? "").toLowerCase())
          .join(" ")
      : "";
    const ocrMatches = keywords.filter((keyword) => normalizedOcr.includes(keyword));
    const vendorMatches = vendorHints.filter(
      (hint) => fields.vendor && normalizeComparableText(fields.vendor).includes(hint)
    );
    const lineItemMatches = keywords.filter((keyword) => lineItemText.includes(keyword));

    if (vendorMatches.length > 0 || lineItemMatches.length >= 2 || ocrMatches.length >= 2) {
      const evidence = [
        ...vendorMatches.slice(0, 1),
        ...lineItemMatches.slice(0, 2),
        ...ocrMatches.slice(0, 2),
      ];
      return {
        level: "strong",
        badge: "High confidence",
        reason: `Category is strongly supported by merchant or receipt evidence (${Array.from(new Set(evidence)).slice(0, 3).join(", ")}).`,
      };
    }

    if (vendorMatches.length === 1 || lineItemMatches.length === 1 || ocrMatches.length === 1) {
      const evidence =
        vendorMatches[0] ?? lineItemMatches[0] ?? ocrMatches[0];
      return {
        level: "caution",
        badge: "Medium confidence",
        reason: `Category is supported by one clear clue (${evidence}), but still deserves a quick review.`,
      };
    }

    return {
      level: "warning",
      badge: "Low confidence",
      reason: "Category is not clearly supported by OCR keywords, so it may be a fuzzy guess.",
    };
  }

  return {
    vendor: applyEditedOverride(
      "vendor",
      maybeDowngradeFromWeakOcr(buildVendorConfidence())
    ),
    amount: applyEditedOverride(
      "amount",
      maybeDowngradeFromWeakOcr(buildAmountConfidence())
    ),
    date: applyEditedOverride(
      "date",
      maybeDowngradeFromWeakOcr(buildDateConfidence())
    ),
    category: applyEditedOverride(
      "category",
      maybeDowngradeFromWeakOcr(buildCategoryConfidence())
    ),
  };
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
  const populatedCount = countCoreFields(fields);

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

  if (fields.subtotal) {
    positives.push("Subtotal was detected separately.");
  }

  if (fields.tax_amount) {
    positives.push("Tax amount was detected separately.");
  }

  if (Array.isArray(fields.line_items) && fields.line_items.length > 0) {
    positives.push(`Detected ${fields.line_items.length} line item${fields.line_items.length === 1 ? "" : "s"} for deeper review.`);
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

function FieldConfidenceBadge({ confidence }) {
  if (!confidence) {
    return null;
  }

  const theme = SIGNAL_THEMES[confidence.level];

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${theme.badge}`}
      title={confidence.reason}
    >
      <SignalIcon level={confidence.level} />
      {confidence.badge}
    </span>
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

function ValidationPanel({ validation }) {
  if (!validation) {
    return null;
  }

  const hasBlocking = validation.blocking.length > 0;
  const hasWarnings = validation.warnings.length > 0;

  let containerClass =
    "mt-6 rounded-[1.5rem] border border-emerald-900/10 bg-emerald-50/80 px-5 py-4 text-emerald-950";
  let eyebrowClass = "text-emerald-700";
  let title = "Validation checks passed";
  let summary =
    "No blocking issues were detected. The draft still deserves a human review, but the basic sanity checks look healthy.";

  if (hasBlocking) {
    containerClass =
      "mt-6 rounded-[1.5rem] border border-rose-900/10 bg-rose-50/80 px-5 py-4 text-rose-950";
    eyebrowClass = "text-rose-700";
    title = "Fix these before save";
    summary =
      "At least one field is still invalid or incomplete, so this expense should not be saved yet.";
  } else if (hasWarnings) {
    containerClass =
      "mt-6 rounded-[1.5rem] border border-amber-900/10 bg-amber-50/80 px-5 py-4 text-amber-950";
    eyebrowClass = "text-amber-700";
    title = "Review these checks before save";
    summary =
      "The draft is saveable, but one or more values look unusual enough to deserve a deliberate human check first.";
  }

  return (
    <div className={containerClass}>
      <p className={`text-xs font-semibold uppercase tracking-[0.22em] ${eyebrowClass}`}>
        Field validation
      </p>
      <h3 className="mt-3 font-serif text-2xl tracking-tight">{title}</h3>
      <p className="mt-3 text-sm leading-7">{summary}</p>

      {hasBlocking ? (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] opacity-80">
            Must fix
          </p>
          <ul className="mt-2 space-y-2">
            {validation.blocking.map((item) => (
              <li className="flex items-start gap-3 text-sm leading-6" key={item}>
                <span className="mt-2 h-2 w-2 rounded-full bg-current opacity-80" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {hasWarnings ? (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] opacity-80">
            Review before save
          </p>
          <ul className="mt-2 space-y-2">
            {validation.warnings.map((item) => (
              <li className="flex items-start gap-3 text-sm leading-6" key={item}>
                <span className="mt-2 h-2 w-2 rounded-full bg-current opacity-80" />
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
  const [lastExtractedSnapshot, setLastExtractedSnapshot] = useState(
    createEmptyExtractedFields()
  );
  const [uploadErrorMessage, setUploadErrorMessage] = useState("");
  const [ocrErrorMessage, setOcrErrorMessage] = useState("");
  const [extractionErrorMessage, setExtractionErrorMessage] = useState("");
  const [saveErrorMessage, setSaveErrorMessage] = useState("");
  const [duplicateErrorMessage, setDuplicateErrorMessage] = useState("");
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
  const [isCheckingDuplicates, setIsCheckingDuplicates] = useState(false);
  const [duplicateMatches, setDuplicateMatches] = useState([]);

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
    setLastExtractedSnapshot(createEmptyExtractedFields());
    setOcrErrorMessage("");
    setExtractionErrorMessage("");
    setSaveErrorMessage("");
    setDuplicateErrorMessage("");
    setDuplicateMatches([]);
    setIsCheckingDuplicates(false);
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
      setLastExtractedSnapshot(mapExtractedFields(payload.extracted_fields));
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
    setLastExtractedSnapshot(createEmptyExtractedFields());
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
      const nextFields = mapExtractedFields(payload?.extracted_fields);
      setExtractedFields(nextFields);
      setLastExtractedSnapshot(nextFields);
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

  useEffect(() => {
    const vendor = extractedFields.vendor.trim();
    const amount = Number(extractedFields.amount);
    const date = extractedFields.date;

    if (
      !uploadedFile?.id ||
      !vendor ||
      !date ||
      !extractedFields.amount ||
      Number.isNaN(amount) ||
      amount <= 0 ||
      savedExpense
    ) {
      setIsCheckingDuplicates(false);
      setDuplicateErrorMessage("");
      setDuplicateMatches([]);
      return undefined;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      setIsCheckingDuplicates(true);
      setDuplicateErrorMessage("");

      try {
        const response = await fetch(`${apiBaseUrl}/api/expenses/check-duplicates`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            upload_id: uploadedFile.id,
            vendor,
            amount,
            date,
          }),
          signal: controller.signal,
        });

        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(
            payload?.detail ?? "Duplicate check failed. Please try again."
          );
        }

        if (controller.signal.aborted) {
          return;
        }

        setDuplicateMatches(Array.isArray(payload?.items) ? payload.items : []);
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }

        setDuplicateMatches([]);
        setDuplicateErrorMessage(
          error instanceof Error
            ? error.message
            : "Duplicate check failed. Please try again."
        );
      } finally {
        if (!controller.signal.aborted) {
          setIsCheckingDuplicates(false);
        }
      }
    }, 350);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [
    apiBaseUrl,
    extractedFields.amount,
    extractedFields.date,
    extractedFields.vendor,
    savedExpense,
    uploadedFile?.id,
  ]);

  async function handleSaveExpense() {
    const validationError = validateExpenseFields(
      uploadedFile,
      ocrText,
      extractedFields
    );
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
          learning_context: buildLearningContext(
            lastExtractedSnapshot,
            extractedFields
          ),
        }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.detail ?? "Expense save failed. Please try again.");
      }

      setSavedExpense(payload);
      setDuplicateMatches([]);
      setDuplicateErrorMessage("");
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

  const hasExtractedFields = hasAnyExtractedField(extractedFields);
  const reviewHints = buildReviewHints(extractedFields);
  const ocrAssessment = buildOcrAssessment(ocrText);
  const extractionAssessment = buildExtractionAssessment(
    extractedFields,
    ocrAssessment
  );
  const fieldValidation = buildFieldValidation(
    uploadedFile,
    ocrText,
    extractedFields
  );
  const fieldConfidence = buildFieldConfidence(
    ocrText,
    extractedFields,
    ocrAssessment,
    lastExtractedSnapshot
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
    fieldValidation.blocking.length === 0 &&
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
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="block text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
                  Vendor
                </span>
                <FieldConfidenceBadge confidence={fieldConfidence?.vendor} />
              </div>
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
              {fieldConfidence?.vendor ? (
                <p className="mt-2 text-xs leading-5 text-stone-500">
                  {fieldConfidence.vendor.reason}
                </p>
              ) : null}
            </label>

            <label className="block">
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="block text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
                  Amount
                </span>
                <FieldConfidenceBadge confidence={fieldConfidence?.amount} />
              </div>
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
              {fieldConfidence?.amount ? (
                <p className="mt-2 text-xs leading-5 text-stone-500">
                  {fieldConfidence.amount.reason}
                </p>
              ) : null}
            </label>

            <label className="block">
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="block text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
                  Date
                </span>
                <FieldConfidenceBadge confidence={fieldConfidence?.date} />
              </div>
              <input
                className="w-full rounded-2xl border border-stone-900/10 bg-white px-4 py-3 text-sm text-stone-900 outline-none transition focus:border-amber-700/30 focus:ring-2 focus:ring-amber-200"
                disabled={isExtractingFields}
                onChange={(event) =>
                  handleExtractedFieldChange("date", event.target.value)
                }
                type="date"
                value={extractedFields.date}
              />
              {fieldConfidence?.date ? (
                <p className="mt-2 text-xs leading-5 text-stone-500">
                  {fieldConfidence.date.reason}
                </p>
              ) : null}
            </label>

            <label className="block">
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="block text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
                  Category
                </span>
                <FieldConfidenceBadge confidence={fieldConfidence?.category} />
              </div>
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
              {fieldConfidence?.category ? (
                <p className="mt-2 text-xs leading-5 text-stone-500">
                  {fieldConfidence.category.reason}
                </p>
              ) : null}
            </label>
          </div>
        ) : null}

        {hasExtractedFields &&
        (
          extractedFields.subtotal ||
          extractedFields.tax_amount ||
          extractedFields.receipt_number ||
          extractedFields.due_date ||
          extractedFields.payment_method
        ) ? (
          <div className="mt-6 rounded-[1.5rem] border border-stone-900/10 bg-stone-50/80 p-5">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-800">
                Receipt details
              </p>
              <h3 className="mt-3 font-serif text-2xl tracking-tight text-stone-950">
                Structured details beyond the core save fields
              </h3>
              <p className="mt-3 text-sm leading-7 text-stone-600">
                These fields are extracted to make the document easier to trust
                and review. They do not change the save flow, but they help you
                verify the draft before you commit it.
              </p>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <div className="rounded-2xl border border-stone-900/10 bg-white px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">
                  Subtotal
                </p>
                <p className="mt-2 text-sm font-medium text-stone-900">
                  {extractedFields.subtotal
                    ? formatCurrencyValue(extractedFields.subtotal)
                    : "Not detected"}
                </p>
              </div>
              <div className="rounded-2xl border border-stone-900/10 bg-white px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">
                  Tax amount
                </p>
                <p className="mt-2 text-sm font-medium text-stone-900">
                  {extractedFields.tax_amount
                    ? formatCurrencyValue(extractedFields.tax_amount)
                    : "Not detected"}
                </p>
              </div>
              <div className="rounded-2xl border border-stone-900/10 bg-white px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">
                  Receipt number
                </p>
                <p className="mt-2 text-sm font-medium text-stone-900">
                  {extractedFields.receipt_number || "Not detected"}
                </p>
              </div>
              <div className="rounded-2xl border border-stone-900/10 bg-white px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">
                  Due date
                </p>
                <p className="mt-2 text-sm font-medium text-stone-900">
                  {extractedFields.due_date
                    ? formatShortDate(extractedFields.due_date)
                    : "Not detected"}
                </p>
              </div>
              <div className="rounded-2xl border border-stone-900/10 bg-white px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">
                  Payment method
                </p>
                <p className="mt-2 text-sm font-medium text-stone-900">
                  {formatPaymentMethod(extractedFields.payment_method)}
                </p>
              </div>
            </div>
          </div>
        ) : null}

        {hasExtractedFields &&
        Array.isArray(extractedFields.line_items) &&
        extractedFields.line_items.length > 0 ? (
          <div className="mt-6 rounded-[1.5rem] border border-stone-900/10 bg-white/70 p-5">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-800">
                Line items
              </p>
              <h3 className="mt-3 font-serif text-2xl tracking-tight text-stone-950">
                Detected receipt lines
              </h3>
              <p className="mt-3 text-sm leading-7 text-stone-600">
                These rows can help verify the subtotal, category, and whether
                the document really matches the expense you are about to save.
              </p>
            </div>

            <div className="mt-5 overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-0 overflow-hidden rounded-[1.25rem] border border-stone-900/10">
                <thead className="bg-stone-950 text-left text-stone-50">
                  <tr>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em]">
                      Description
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em]">
                      Qty
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em]">
                      Unit price
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em]">
                      Line total
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white">
                  {extractedFields.line_items.map((item, index) => (
                    <tr className="border-t border-stone-900/8" key={`${item.description}-${index}`}>
                      <td className="px-4 py-4 text-sm font-medium text-stone-900">
                        {item.description || "Unlabeled item"}
                      </td>
                      <td className="px-4 py-4 text-sm text-stone-700">
                        {item.quantity ? formatQuantityValue(item.quantity) : "—"}
                      </td>
                      <td className="px-4 py-4 text-sm text-stone-700">
                        {item.unit_price
                          ? formatCurrencyValue(item.unit_price)
                          : "—"}
                      </td>
                      <td className="px-4 py-4 text-sm text-stone-700">
                        {item.line_total
                          ? formatCurrencyValue(item.line_total)
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {hasExtractedFields ? (
          <ValidationPanel validation={fieldValidation} />
        ) : null}

        {hasExtractedFields && (
          isCheckingDuplicates ||
          duplicateErrorMessage ||
          duplicateMatches.length > 0
        ) ? (
          <div className="mt-6 rounded-[1.5rem] border border-amber-900/10 bg-amber-50/80 px-5 py-4 text-amber-950">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-700">
              Duplicate check
            </p>
            <h3 className="mt-3 font-serif text-2xl tracking-tight">
              {isCheckingDuplicates
                ? "Checking existing expenses"
                : duplicateMatches.length > 0
                  ? "Possible duplicates found"
                  : "Duplicate check unavailable"}
            </h3>

            {isCheckingDuplicates ? (
              <p className="mt-3 text-sm leading-7">
                Comparing this draft against existing expenses with the same
                vendor, amount, and nearby date.
              </p>
            ) : null}

            {duplicateErrorMessage ? (
              <p className="mt-3 text-sm leading-7">
                {duplicateErrorMessage}
              </p>
            ) : null}

            {duplicateMatches.length > 0 ? (
              <>
                <p className="mt-3 text-sm leading-7">
                  Similar expenses already exist. You can still save this one,
                  but it is worth checking whether the record is a true new
                  expense or a duplicate.
                </p>

                <div className="mt-4 space-y-3">
                  {duplicateMatches.map((match) => (
                    <div
                      className="rounded-2xl border border-amber-900/10 bg-white/80 px-4 py-4"
                      key={match.id}
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="text-sm font-semibold text-stone-900">
                            {match.vendor}
                          </p>
                          <p className="mt-1 text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">
                            {match.match_reason}
                          </p>
                        </div>

                        <Link
                          className="inline-flex min-h-10 items-center justify-center rounded-full border border-amber-900/10 bg-amber-100 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-amber-950 transition hover:bg-amber-200"
                          href={`/expenses/${match.id}`}
                        >
                          Open record
                        </Link>
                      </div>

                      <div className="mt-4 grid gap-3 sm:grid-cols-3">
                        <div className="rounded-2xl border border-stone-900/10 bg-white px-4 py-3">
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">
                            Amount
                          </p>
                          <p className="mt-2 text-sm font-medium text-stone-900">
                            {formatCurrencyValue(match.amount)}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-stone-900/10 bg-white px-4 py-3">
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">
                            Date
                          </p>
                          <p className="mt-2 text-sm font-medium text-stone-900">
                            {formatShortDate(match.date)}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-stone-900/10 bg-white px-4 py-3">
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">
                            Date gap
                          </p>
                          <p className="mt-2 text-sm font-medium text-stone-900">
                            {match.date_distance_days === 0
                              ? "Same day"
                              : `${match.date_distance_days} day${match.date_distance_days === 1 ? "" : "s"}`}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : null}
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
