import assert from "node:assert/strict";
import { test } from "node:test";
import type { InvoiceArchive } from "../../providers/invoice";
import {
  ARCHIVE_BUCKET,
  ARCHIVE_MAX_BYTES,
  ARCHIVE_MIN_BYTES,
  buildArchivePath,
  sha256Hex,
  validateArchivePayload,
} from "../archive-state";

const goodPdf = (size: number): Uint8Array => {
  const a = new Uint8Array(size);
  a[0] = 0x25; // %
  a[1] = 0x50; // P
  a[2] = 0x44; // D
  a[3] = 0x46; // F
  return a;
};

const goodXml = (size: number): Uint8Array => {
  const a = new Uint8Array(size);
  const head = "<?xml ";
  for (let i = 0; i < head.length; i++) a[i] = head.charCodeAt(i);
  return a;
};

const goodArchive = (
  pdfSize = 1024,
  xmlSize = 1024,
): InvoiceArchive => ({
  pdf: {
    bytes: goodPdf(pdfSize),
    contentType: "application/pdf",
    filename: "test.pdf",
  },
  xml: {
    bytes: goodXml(xmlSize),
    contentType: "application/xml",
    filename: "test.xml",
  },
  error: null,
});

test("buildArchivePath: standard format", () => {
  assert.equal(
    buildArchivePath({
      tenantId: 1,
      invoiceId: 12345,
      invoiceNumber: "C25TLL/00000123",
      issuedAt: "2026-05-13T10:30:00Z",
      ext: "pdf",
    }),
    "1/2026/05/12345-C25TLL_00000123.pdf",
  );
});

test("buildArchivePath: sanitizes non-alphanumeric (slash, hyphen, special chars)", () => {
  assert.equal(
    buildArchivePath({
      tenantId: 1,
      invoiceId: 999,
      invoiceNumber: "AB/20-E#$%0001",
      issuedAt: "2026-01-01T00:00:00Z",
      ext: "xml",
    }),
    "1/2026/01/999-AB_20_E_0001.xml",
  );
});

test("buildArchivePath: handles December (zero-padded month)", () => {
  assert.equal(
    buildArchivePath({
      tenantId: 7,
      invoiceId: 42,
      invoiceNumber: "X123",
      issuedAt: "2026-12-31T23:59:59Z",
      ext: "pdf",
    }),
    "7/2026/12/42-X123.pdf",
  );
});

test("buildArchivePath: tenant prefix is first segment (RLS requirement)", () => {
  const path = buildArchivePath({
    tenantId: 99,
    invoiceId: 1,
    invoiceNumber: "A",
    issuedAt: "2026-05-13T00:00:00Z",
    ext: "pdf",
  });
  assert.equal(path.split("/")[0], "99");
});

test("validateArchivePayload: happy path returns ok", () => {
  const result = validateArchivePayload(goodArchive());
  assert.equal(result.ok, true);
});

test("validateArchivePayload: provider error short-circuits", () => {
  const result = validateArchivePayload({
    pdf: null,
    xml: null,
    error: "network_timeout",
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.reason, /provider_error:network_timeout/);
});

test("validateArchivePayload: missing PDF rejected", () => {
  const result = validateArchivePayload({
    pdf: null,
    xml: goodArchive().xml,
    error: null,
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "missing_artifact");
});

test("validateArchivePayload: missing XML rejected", () => {
  const result = validateArchivePayload({
    pdf: goodArchive().pdf,
    xml: null,
    error: null,
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "missing_artifact");
});

test("validateArchivePayload: PDF too small rejected (placeholder defense)", () => {
  const result = validateArchivePayload(
    goodArchive(ARCHIVE_MIN_BYTES - 1, 1024),
  );
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.reason, /pdf_too_small/);
});

test("validateArchivePayload: XML too small rejected", () => {
  const result = validateArchivePayload(
    goodArchive(1024, ARCHIVE_MIN_BYTES - 1),
  );
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.reason, /xml_too_small/);
});

test("validateArchivePayload: PDF too large rejected (HTML-error-page defense)", () => {
  const result = validateArchivePayload({
    pdf: {
      bytes: goodPdf(ARCHIVE_MAX_BYTES + 1),
      contentType: "application/pdf",
      filename: "huge.pdf",
    },
    xml: goodArchive().xml,
    error: null,
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.reason, /pdf_too_large/);
});

test("sha256Hex: matches known hash for 'hello world'", async () => {
  const bytes = new TextEncoder().encode("hello world");
  const hash = sha256Hex(bytes);
  // Known SHA-256 of "hello world"
  assert.equal(
    hash,
    "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9",
  );
});

test("sha256Hex: deterministic — same bytes → same hash", async () => {
  const a = await sha256Hex(new Uint8Array([1, 2, 3]));
  const b = await sha256Hex(new Uint8Array([1, 2, 3]));
  assert.equal(a, b);
});

test("sha256Hex: differs for different bytes", async () => {
  const a = await sha256Hex(new Uint8Array([1, 2, 3]));
  const b = await sha256Hex(new Uint8Array([1, 2, 4]));
  assert.notEqual(a, b);
});

test("sha256Hex: returns 64 hex chars (256 bits)", async () => {
  const hash = sha256Hex(new Uint8Array(100));
  assert.equal(hash.length, 64);
  assert.match(hash, /^[0-9a-f]{64}$/);
});

test("ARCHIVE_BUCKET constant matches migration", () => {
  // Tied to migration 20260517010000_hddt_archive_schema.sql
  assert.equal(ARCHIVE_BUCKET, "hddt-archive");
});
