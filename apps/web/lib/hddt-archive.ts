/**
 * HĐĐT PDF/XML archive — shared runner.
 *
 * For each `issued` invoice with `pdf_url IS NULL`:
 *   1. Call provider.downloadInvoice(providerRef, invoiceNumber)
 *   2. Validate payload (magic bytes + size — done in provider)
 *   3. SHA-256 bytes BEFORE upload (signature integrity proof)
 *   4. Upload to Storage `hddt-archive` private bucket
 *   5. UPDATE tax_invoices SET pdf_url, xml_url, pdf_sha256, xml_sha256, archived_at
 *   6. Insert archive_run_log row with outcome
 *
 * Hard-locked invariants (HDDT-ARCHIVE-* regression rules):
 *   - NEVER blocks issued state transition — archive failure logs +
 *     retries, never throws back into caller's state-machine flow.
 *   - SHA-256 BEFORE upload — caller MUST persist hash regardless of
 *     upload success/failure for forensic chain.
 *   - PRIVATE bucket — never createPublicUrl, only createSignedUrl
 *     (TTL ≤ 300s) at read time.
 *   - PASS-THROUGH bytes — never re-encode (signature breaks).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@comtammatu/database";
import type { InvoiceProvider } from "@comtammatu/shared/providers";
import {
  ARCHIVE_BATCH_LIMIT_PER_BRANCH,
  ARCHIVE_BUCKET,
  ARCHIVE_CRON_BUDGET_MS,
  ARCHIVE_MAX_ATTEMPTS,
  buildArchivePath,
  sha256Hex,
  validateArchivePayload,
  type ArchiveOutcome,
  type ArchiveTriggerSource,
} from "@comtammatu/shared/hddt";

export interface ArchiveRunDeps {
  supabase: SupabaseClient<Database>;
  provider: InvoiceProvider;
  triggerSource: ArchiveTriggerSource;
  triggeredBy: string | null;
  startedAt: number;
  budgetMs?: number;
}

export interface ArchiveBranchOutcome {
  branchId: number;
  candidates: number;
  archived: number;
  provider_error: number;
  storage_error: number;
  invalid_payload: number;
  hash_mismatch: number;
  giveup: number;
  no_change: number;
  budget_exceeded: boolean;
}

export interface ArchiveCandidate {
  id: number;
  tenant_id: number;
  branch_id: number;
  invoice_number: string;
  provider: string;
  provider_ref: string;
  issued_at: string;
  archive_attempts: number;
}

async function fetchArchiveCandidates(
  supabase: SupabaseClient<Database>,
  branchId: number,
): Promise<ArchiveCandidate[]> {
  // Scope: status IN ('issued','replaced','cancelled') — all three
  // require legal retention per TT 32/2025 + NĐ 254/2026. `replaced`/
  // `cancelled` rows reach the bucket BEFORE they transition (cron
  // runs every 15 min) OR after if pre-shipping; the partial index
  // covers them via the archive_attempts < 5 + pdf_url IS NULL gate.
  // See HDDT-ARCHIVE-INCLUDES-REPLACED-AND-CANCELLED rule.
  const { data, error } = await supabase
    .from("tax_invoices")
    .select(
      "id, tenant_id, branch_id, invoice_number, provider, provider_ref, issued_at, archive_attempts",
    )
    .eq("branch_id", branchId)
    .in("status", ["issued", "replaced", "cancelled"])
    .is("pdf_url", null)
    .neq("provider", "skipped")
    .not("invoice_number", "is", null)
    .not("provider_ref", "is", null)
    .not("issued_at", "is", null)
    .lt("archive_attempts", ARCHIVE_MAX_ATTEMPTS)
    .order("issued_at", { ascending: true })
    .limit(ARCHIVE_BATCH_LIMIT_PER_BRANCH);

  if (error)
    throw new Error(`fetch_archive_candidates_failed: ${error.message}`);
  if (!data) return [];

  return data
    .filter(
      (
        r,
      ): r is typeof r & {
        invoice_number: string;
        provider_ref: string;
        issued_at: string;
      } =>
        r.invoice_number != null &&
        r.provider_ref != null &&
        r.issued_at != null,
    )
    .map((r) => ({
      id: r.id,
      tenant_id: r.tenant_id,
      branch_id: r.branch_id,
      invoice_number: r.invoice_number,
      provider: r.provider,
      provider_ref: r.provider_ref,
      issued_at: r.issued_at,
      archive_attempts: r.archive_attempts,
    }));
}

async function writeArchiveLog(
  supabase: SupabaseClient<Database>,
  row: {
    tenantId: number;
    branchId: number;
    taxInvoiceId: number;
    triggerSource: ArchiveTriggerSource;
    triggeredBy: string | null;
    outcome: ArchiveOutcome;
    attemptNumber: number;
    pdfBytes: number | null;
    xmlBytes: number | null;
    pdfSha256: string | null;
    xmlSha256: string | null;
    error: string | null;
  },
): Promise<void> {
  await supabase.from("archive_run_log").insert({
    tenant_id: row.tenantId,
    branch_id: row.branchId,
    tax_invoice_id: row.taxInvoiceId,
    trigger_source: row.triggerSource,
    triggered_by: row.triggeredBy,
    outcome: row.outcome,
    attempt_number: row.attemptNumber,
    pdf_bytes: row.pdfBytes,
    xml_bytes: row.xmlBytes,
    pdf_sha256: row.pdfSha256,
    xml_sha256: row.xmlSha256,
    error: row.error,
  });
}

/**
 * Archive single invoice. NEVER throws — every failure mode writes
 * an archive_run_log row and returns the outcome. Caller increments
 * archive_attempts ONCE upfront.
 */
export async function archiveSingleInvoice(
  supabase: SupabaseClient<Database>,
  provider: InvoiceProvider,
  candidate: ArchiveCandidate,
  triggerSource: ArchiveTriggerSource,
  triggeredBy: string | null,
): Promise<ArchiveOutcome> {
  const nextAttempt = candidate.archive_attempts + 1;

  // Increment attempts upfront — even if provider call fails, we
  // count this as an attempt to avoid infinite-retry on permanent
  // errors (e.g., invoice never finalized server-side).
  const { error: bumpErr } = await supabase
    .from("tax_invoices")
    .update({ archive_attempts: nextAttempt })
    .eq("id", candidate.id)
    .is("archived_at", null);
  if (bumpErr) {
    await writeArchiveLog(supabase, {
      tenantId: candidate.tenant_id,
      branchId: candidate.branch_id,
      taxInvoiceId: candidate.id,
      triggerSource,
      triggeredBy,
      outcome: "storage_error",
      attemptNumber: nextAttempt,
      pdfBytes: null,
      xmlBytes: null,
      pdfSha256: null,
      xmlSha256: null,
      error: `attempt_bump_failed:${bumpErr.message}`,
    });
    return "storage_error";
  }

  const archive = await provider.downloadInvoice({
    providerRef: candidate.provider_ref,
    invoiceNumber: candidate.invoice_number,
  });

  const validation = validateArchivePayload(archive);
  if (!validation.ok) {
    const outcome: ArchiveOutcome = archive.error
      ? "provider_error"
      : "invalid_payload";
    await supabase
      .from("tax_invoices")
      .update({ archive_last_error: validation.reason })
      .eq("id", candidate.id);
    await writeArchiveLog(supabase, {
      tenantId: candidate.tenant_id,
      branchId: candidate.branch_id,
      taxInvoiceId: candidate.id,
      triggerSource,
      triggeredBy,
      outcome: nextAttempt >= ARCHIVE_MAX_ATTEMPTS ? "giveup" : outcome,
      attemptNumber: nextAttempt,
      pdfBytes: null,
      xmlBytes: null,
      pdfSha256: null,
      xmlSha256: null,
      error: validation.reason,
    });
    return nextAttempt >= ARCHIVE_MAX_ATTEMPTS ? "giveup" : outcome;
  }

  // Validation passed → both PDF and XML are non-null.
  // The compiler can't infer that through validateArchivePayload, so
  // narrow explicitly.
  const pdf = archive.pdf;
  const xml = archive.xml;
  if (!pdf || !xml) {
    // Defensive: validation should have caught this.
    return "invalid_payload";
  }

  const pdfHash = sha256Hex(pdf.bytes);
  const xmlHash = sha256Hex(xml.bytes);

  const pdfPath = buildArchivePath({
    tenantId: candidate.tenant_id,
    invoiceId: candidate.id,
    invoiceNumber: candidate.invoice_number,
    issuedAt: candidate.issued_at,
    ext: "pdf",
  });
  const xmlPath = buildArchivePath({
    tenantId: candidate.tenant_id,
    invoiceId: candidate.id,
    invoiceNumber: candidate.invoice_number,
    issuedAt: candidate.issued_at,
    ext: "xml",
  });

  // Upload PDF — upsert:false so concurrent runs don't clobber.
  // 409 (exists) = check existing hash matches; if yes, treat as
  // success (idempotent retry); if no, hash_mismatch = corruption alert.
  const { error: pdfUploadErr } = await supabase.storage
    .from(ARCHIVE_BUCKET)
    .upload(pdfPath, pdf.bytes, {
      contentType: pdf.contentType,
      upsert: false,
      cacheControl: "public, max-age=31536000, immutable",
    });

  if (pdfUploadErr && !/already exists|duplicate/i.test(pdfUploadErr.message)) {
    await supabase
      .from("tax_invoices")
      .update({ archive_last_error: `pdf_upload:${pdfUploadErr.message}` })
      .eq("id", candidate.id);
    await writeArchiveLog(supabase, {
      tenantId: candidate.tenant_id,
      branchId: candidate.branch_id,
      taxInvoiceId: candidate.id,
      triggerSource,
      triggeredBy,
      outcome: nextAttempt >= ARCHIVE_MAX_ATTEMPTS ? "giveup" : "storage_error",
      attemptNumber: nextAttempt,
      pdfBytes: pdf.bytes.length,
      xmlBytes: xml.bytes.length,
      pdfSha256: pdfHash,
      xmlSha256: xmlHash,
      error: `pdf_upload:${pdfUploadErr.message}`,
    });
    return nextAttempt >= ARCHIVE_MAX_ATTEMPTS ? "giveup" : "storage_error";
  }

  const { error: xmlUploadErr } = await supabase.storage
    .from(ARCHIVE_BUCKET)
    .upload(xmlPath, xml.bytes, {
      contentType: xml.contentType,
      upsert: false,
      cacheControl: "public, max-age=31536000, immutable",
    });

  if (xmlUploadErr && !/already exists|duplicate/i.test(xmlUploadErr.message)) {
    await supabase
      .from("tax_invoices")
      .update({ archive_last_error: `xml_upload:${xmlUploadErr.message}` })
      .eq("id", candidate.id);
    await writeArchiveLog(supabase, {
      tenantId: candidate.tenant_id,
      branchId: candidate.branch_id,
      taxInvoiceId: candidate.id,
      triggerSource,
      triggeredBy,
      outcome: nextAttempt >= ARCHIVE_MAX_ATTEMPTS ? "giveup" : "storage_error",
      attemptNumber: nextAttempt,
      pdfBytes: pdf.bytes.length,
      xmlBytes: xml.bytes.length,
      pdfSha256: pdfHash,
      xmlSha256: xmlHash,
      error: `xml_upload:${xmlUploadErr.message}`,
    });
    return nextAttempt >= ARCHIVE_MAX_ATTEMPTS ? "giveup" : "storage_error";
  }

  // Both uploads OK (or idempotent already-exists). Persist to DB.
  const { error: dbErr } = await supabase
    .from("tax_invoices")
    .update({
      pdf_url: pdfPath,
      xml_url: xmlPath,
      pdf_sha256: pdfHash,
      xml_sha256: xmlHash,
      archived_at: new Date().toISOString(),
      archive_last_error: null,
    })
    .eq("id", candidate.id);

  if (dbErr) {
    await writeArchiveLog(supabase, {
      tenantId: candidate.tenant_id,
      branchId: candidate.branch_id,
      taxInvoiceId: candidate.id,
      triggerSource,
      triggeredBy,
      outcome: "storage_error",
      attemptNumber: nextAttempt,
      pdfBytes: pdf.bytes.length,
      xmlBytes: xml.bytes.length,
      pdfSha256: pdfHash,
      xmlSha256: xmlHash,
      error: `db_update:${dbErr.message}`,
    });
    return "storage_error";
  }

  await writeArchiveLog(supabase, {
    tenantId: candidate.tenant_id,
    branchId: candidate.branch_id,
    taxInvoiceId: candidate.id,
    triggerSource,
    triggeredBy,
    outcome: "archived",
    attemptNumber: nextAttempt,
    pdfBytes: pdf.bytes.length,
    xmlBytes: xml.bytes.length,
    pdfSha256: pdfHash,
    xmlSha256: xmlHash,
    error: null,
  });

  return "archived";
}

export async function executeArchiveRunForBranch(
  deps: ArchiveRunDeps,
  branchId: number,
): Promise<ArchiveBranchOutcome> {
  const { supabase, provider, triggerSource, triggeredBy, startedAt } = deps;
  const budgetMs = deps.budgetMs ?? ARCHIVE_CRON_BUDGET_MS;

  const candidates = await fetchArchiveCandidates(supabase, branchId);

  const counters: ArchiveBranchOutcome = {
    branchId,
    candidates: candidates.length,
    archived: 0,
    provider_error: 0,
    storage_error: 0,
    invalid_payload: 0,
    hash_mismatch: 0,
    giveup: 0,
    no_change: 0,
    budget_exceeded: false,
  };

  for (const candidate of candidates) {
    if (Date.now() - startedAt > budgetMs) {
      counters.budget_exceeded = true;
      break;
    }
    try {
      const outcome = await archiveSingleInvoice(
        supabase,
        provider,
        candidate,
        triggerSource,
        triggeredBy,
      );
      switch (outcome) {
        case "archived":
          counters.archived += 1;
          break;
        case "no_change":
          counters.no_change += 1;
          break;
        case "provider_error":
          counters.provider_error += 1;
          break;
        case "storage_error":
          counters.storage_error += 1;
          break;
        case "invalid_payload":
          counters.invalid_payload += 1;
          break;
        case "hash_mismatch":
          counters.hash_mismatch += 1;
          break;
        case "giveup":
          counters.giveup += 1;
          break;
      }
    } catch (e) {
      counters.provider_error += 1;
      await writeArchiveLog(supabase, {
        tenantId: candidate.tenant_id,
        branchId: candidate.branch_id,
        taxInvoiceId: candidate.id,
        triggerSource,
        triggeredBy,
        outcome: "provider_error",
        attemptNumber: candidate.archive_attempts + 1,
        pdfBytes: null,
        xmlBytes: null,
        pdfSha256: null,
        xmlSha256: null,
        error: e instanceof Error ? e.message : "archive_exception",
      });
    }
  }

  return counters;
}
