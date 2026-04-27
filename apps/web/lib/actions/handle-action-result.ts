import type { ActionResult } from "@comtammatu/shared/types"
import { notify } from "@comtammatu/ui/lib/notify"

export interface HandleOptions<T> {
  /** Toast hiển thị khi thành công. Bỏ qua nếu không set. */
  successMsg?: string
  /** Fallback khi `result.error` trống. Mặc định fallback VN trong notify. */
  errorFallback?: string
  onSuccess?: (data: T | undefined) => void
  onError?: (err: string) => void
  /** Skip toast (form inline error / bulk flows). */
  silent?: boolean
}

/**
 * Chuẩn hóa xử lý ActionResult từ Server Action:
 * - success=true  → gọi `onSuccess`, toast success nếu có `successMsg`
 * - success=false → gọi `onError`, toast error với `result.error` hoặc fallback
 *
 * Trả về `result.success` để caller có thể branch tiếp nếu cần.
 */
export function handleActionResult<T>(
  result: ActionResult<T>,
  opts: HandleOptions<T> = {},
): boolean {
  if (result.success) {
    if (!opts.silent && opts.successMsg) {
      notify.success(opts.successMsg)
    }
    opts.onSuccess?.(result.data)
    return true
  }

  const errMsg = result.error ?? opts.errorFallback
  if (!opts.silent) {
    notify.error(errMsg)
  }
  opts.onError?.(result.error ?? "")
  return false
}
