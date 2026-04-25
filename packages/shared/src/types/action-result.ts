/**
 * Standard Server Action response shape.
 * All actions return this — enforces consistent client-side handling.
 *
 * `errorCode` is OPTIONAL and stable across UI copy changes. Clients that
 * need to react to specific failure classes (e.g. retry-vs-give-up logic
 * in `submit-with-retry`) MUST branch on `errorCode` rather than parsing
 * `error` substring matches — Vietnamese UI strings drift, codes do not.
 * Action authors set the code; the `error` string remains for human
 * display. Codes are domain-defined (e.g. `pos/_utils/error-codes.ts`).
 */
export interface ActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  /** Stable machine-readable code for branching client logic. */
  errorCode?: string;
  meta?: Record<string, unknown>;
}
