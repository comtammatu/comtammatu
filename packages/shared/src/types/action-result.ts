/**
 * Standard Server Action response shape.
 * All actions return this — enforces consistent client-side handling.
 */
export interface ActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  meta?: Record<string, unknown>;
}
