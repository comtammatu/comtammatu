/**
 * HĐĐT PDF/XML archive — pure helpers (path layout, magic-byte
 * validation, decision matrix).
 *
 * Shared between cron route, admin manual action, and backfill action.
 * No Supabase, no fetch — kept pure for unit-testability.
 */
import { createHash } from "node:crypto";
import type { InvoiceArchive } from "../providers/invoice";

export const ARCHIVE_BUCKET = "hddt-archive";
export const ARCHIVE_MIN_BYTES = 256;
export const ARCHIVE_MAX_BYTES = 10 * 1024 * 1024; // 10 MB
export const ARCHIVE_MAX_ATTEMPTS = 5;
export const ARCHIVE_BATCH_LIMIT_PER_BRANCH = 25;
export const ARCHIVE_CRON_BUDGET_MS = 240_000;
export const ARCHIVE_SIGNED_URL_TTL_SECONDS = 300;

export type ArchiveTriggerSource = "cron" | "manual" | "backfill";

export type ArchiveOutcome =
  | "archived"
  | "no_change"
  | "provider_error"
  | "storage_error"
  | "invalid_payload"
  | "hash_mismatch"
  | "giveup";

/**
 * Storage path layout: {tenant_id}/{yyyy}/{mm}/{invoiceId}-{slug}.{ext}
 *
 * Tenant-first prefix enforces RLS via Storage policy
 * `(storage.foldername(name))[1] = auth_tenant_id()::text`.
 *
 * Slug is invoice_number with non-alphanumeric chars replaced by `_`
 * so paths stay filesystem-safe (Viettel invoice numbers like
 * "C25TLL/00000123" contain `/` which would break the path layout).
 */
export function buildArchivePath(input: {
  tenantId: number;
  invoiceId: number;
  invoiceNumber: string;
  issuedAt: string;
  ext: "pdf" | "xml";
}): string {
  const issued = new Date(input.issuedAt);
  const yyyy = issued.getUTCFullYear();
  const mm = String(issued.getUTCMonth() + 1).padStart(2, "0");
  const slug = input.invoiceNumber.replace(/[^a-zA-Z0-9]+/g, "_");
  return `${input.tenantId}/${yyyy}/${mm}/${input.invoiceId}-${slug}.${input.ext}`;
}

/**
 * Validate provider download response before Storage upload.
 *
 * Defends against:
 *   - Provider returned HTML error page instead of file (size check + magic bytes — but magic is validated in provider impl already)
 *   - File too small (< 256 bytes = likely placeholder/error)
 *   - File too large (> 10 MB = Storage bucket file_size_limit, also data anomaly worth manual review)
 *   - Either PDF or XML missing (partial archive forbidden — both must succeed)
 */
export function validateArchivePayload(
  archive: InvoiceArchive,
): { ok: true } | { ok: false; reason: string } {
  if (archive.error) {
    return { ok: false, reason: `provider_error:${archive.error}` };
  }
  if (!archive.pdf || !archive.xml) {
    return { ok: false, reason: "missing_artifact" };
  }
  if (archive.pdf.bytes.length < ARCHIVE_MIN_BYTES) {
    return { ok: false, reason: `pdf_too_small:${archive.pdf.bytes.length}` };
  }
  if (archive.pdf.bytes.length > ARCHIVE_MAX_BYTES) {
    return { ok: false, reason: `pdf_too_large:${archive.pdf.bytes.length}` };
  }
  if (archive.xml.bytes.length < ARCHIVE_MIN_BYTES) {
    return { ok: false, reason: `xml_too_small:${archive.xml.bytes.length}` };
  }
  if (archive.xml.bytes.length > ARCHIVE_MAX_BYTES) {
    return { ok: false, reason: `xml_too_large:${archive.xml.bytes.length}` };
  }
  return { ok: true };
}

/**
 * Compute SHA-256 hex digest using node:crypto (cron runs on Node
 * runtime). Caller MUST pass raw bytes verbatim — never transform,
 * never re-encode (provider signature applies to the exact bytes).
 */
export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
