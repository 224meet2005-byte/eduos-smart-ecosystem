// ---------------------------------------------------------------------------
// PII Helpers
// ---------------------------------------------------------------------------

/**
 * Mask an Aadhaar number, showing only the last 4 digits.
 * Accepts raw 12-digit strings or already-formatted values.
 *
 * @example maskAadhaar('123456789012') // 'XXXX-XXXX-9012'
 */
// Aadhaar masking removed — identity PII handling is not collected in admission flow.

// ---------------------------------------------------------------------------
// Date / Time
// ---------------------------------------------------------------------------

/**
 * Format an ISO date string into a human-readable Indian locale date.
 *
 * @example formatDate('2024-01-15T10:30:00Z') // '15 Jan 2024'
 */
export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-IN", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * Format an ISO date string as a short date-time in the Indian locale.
 *
 * @example formatDateTime('2024-01-15T10:30:00Z') // '15 Jan 2024, 10:30 am'
 */
export function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString("en-IN", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ---------------------------------------------------------------------------
// String / Text
// ---------------------------------------------------------------------------

/**
 * Extract up to 2 uppercase initials from a display name.
 * Used for avatar fallbacks.
 *
 * @example getInitials('Ravi Kumar')  // 'RK'
 * @example getInitials('Ananya')      // 'AN'  ← only 1 word → first 2 chars
 */
export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    // Single word: take the first two characters
    return parts[0].slice(0, 2).toUpperCase();
  }
  return parts
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

/**
 * Truncate a string to `length` characters, appending '…' if needed.
 *
 * @example truncate('Hello World', 5) // 'Hello...'
 */
export function truncate(str: string, length: number): string {
  if (str.length <= length) return str;
  return `${str.slice(0, length)}...`;
}

// ---------------------------------------------------------------------------
// Async / Timing
// ---------------------------------------------------------------------------

/**
 * Promise-based sleep. Useful in dev for simulating latency.
 *
 * @example await sleep(500); // pauses for 500 ms
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Test whether a string is a valid UUID v4.
 *
 * @example isUUID('550e8400-e29b-41d4-a716-446655440000') // true
 */
export function isUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

// ---------------------------------------------------------------------------
// URL / Query Strings
// ---------------------------------------------------------------------------

/**
 * Build a URL query string from a plain object, omitting `undefined` / empty values.
 *
 * @example
 * buildQueryString({ page: 1, search: 'foo', filter: undefined })
 * // '?page=1&search=foo'
 */
export function buildQueryString(
  params: Record<string, string | number | boolean | undefined>,
): string {
  const qs = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join("&");
  return qs ? `?${qs}` : "";
}

// ---------------------------------------------------------------------------
// Class / Style
// ---------------------------------------------------------------------------

/**
 * Conditionally join class names — thin wrapper kept here so components
 * that don't need the full `cn` util can import from helpers instead.
 */
export function classNames(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

/**
 * Copy text to the clipboard with a browser fallback.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall back to the legacy path below.
    }
  }

  if (typeof document === "undefined") {
    return false;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  }

  document.body.removeChild(textarea);
  return copied;
}

/**
 * Normalize unknown errors into a displayable message.
 */
export function getErrorMessage(error: unknown, fallback = "Something went wrong"): string {
  if (typeof error === "string") {
    return error;
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (error && typeof error === "object") {
    const maybeMessage = (error as { message?: unknown }).message;
    if (typeof maybeMessage === "string" && maybeMessage.trim()) {
      return maybeMessage;
    }

    const maybeError = (error as { error?: unknown }).error;
    if (maybeError && typeof maybeError === "object") {
      const nestedMessage = (maybeError as { message?: unknown }).message;
      if (typeof nestedMessage === "string" && nestedMessage.trim()) {
        return nestedMessage;
      }
    }
  }

  return fallback;
}

/**
 * Detect aborted fetches and other cancellation errors.
 */
export function isAbortError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  if (error instanceof DOMException) {
    return error.name === "AbortError";
  }

  const maybeError = error as { name?: unknown; code?: unknown };
  return maybeError.name === "AbortError" || maybeError.code === 20;
}
