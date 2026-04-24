import { toast } from "@comtammatu/ui/components/sonner";
import type { AutoWasteResult } from "../waste-actions";

/**
 * Cashier/chef toast for `createWasteFromOrder` outcomes (S11-ext).
 *
 * Non-fatal semantics: the parent void/cancel always succeeds, so the
 * toast is purely informational. Success → "Đã tạo phiếu waste #X";
 * softFailed → warning "admin sẽ xử lý" with the underlying cause for
 * the support ticket.
 */
export function showAutoWasteToast(result: AutoWasteResult | null | undefined) {
  if (!result) {
    toast.warning("Không có dữ liệu waste auto — admin sẽ xử lý");
    return;
  }
  if (result.softFailed) {
    toast.warning(
      `Không tạo được waste auto (${result.softError ?? "unknown"}) — admin sẽ xử lý`,
    );
    return;
  }
  if (!result.issueId) {
    toast.warning("Waste auto đã gửi nhưng chưa có ID — admin sẽ xử lý");
    return;
  }
  toast.success(
    `Đã tạo phiếu waste #${result.issueId} (${result.lineCount} dòng)`,
  );
}
