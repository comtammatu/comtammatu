/**
 * Local fallback: build a schema_version=1 PrintDocument from a typed
 * payload when the SQL trigger failed to attach `document`
 * (attach_print_document_to_payload is fail-soft by design). Uses the same
 * materializer + default content as the admin editor preview.
 */

import type { PrintDocument } from "./print-document";
import type { PrintPayload } from "./payloads";
import { materializeDocument } from "./materialize";

export function buildFallbackDocument(payload: PrintPayload): PrintDocument {
  return materializeDocument(
    payload.kind,
    payload as Record<string, unknown>,
    null,
    { template_id: 0, template_version: 1, paper_width_mm: 80 },
  );
}
