export type BlockedStateReasonCode =
  | "insufficient-permission"
  | "missing-auth-context"
  | "branch-scope-mismatch"
  | "branch-surface-restricted"
  | "untrusted-network";

export interface BlockedStateCopy {
  title: string;
  description: string;
  nextStep: string;
  toastMessage: string;
  tone: "neutral" | "warning" | "danger";
}

export interface ResolvedBlockedState {
  reason: BlockedStateReasonCode | null;
  copy: BlockedStateCopy;
}

const DEFAULT_BLOCKED_STATE_COPY: BlockedStateCopy = {
  title: "Không thể mở trang này",
  description:
    "Trang bạn vừa mở đang bị chặn theo cấu hình quyền hiện tại của tài khoản.",
  nextStep:
    "Quay lại phân hệ mặc định hoặc liên hệ quản lý nếu bạn cần thêm quyền.",
  toastMessage: "Bạn không có quyền truy cập trang đó",
  tone: "warning",
};

const BLOCKED_STATE_REASON_COPY: Record<
  BlockedStateReasonCode,
  BlockedStateCopy
> = {
  "insufficient-permission": DEFAULT_BLOCKED_STATE_COPY,
  "missing-auth-context": {
    title: "Không xác định được quyền truy cập",
    description:
      "Phiên hiện tại không cung cấp đủ ngữ cảnh quyền để mở trang yêu cầu.",
    nextStep:
      "Đăng nhập lại để làm mới phiên. Nếu vẫn lặp lại, liên hệ quản lý hệ thống.",
    toastMessage: "Không thể xác định quyền truy cập. Vui lòng đăng nhập lại.",
    tone: "danger",
  },
  "branch-scope-mismatch": {
    title: "Không thuộc chi nhánh này",
    description:
      "Tài khoản của bạn không được phân công cho chi nhánh trong đường dẫn. POS và KDS chỉ mở trên chi nhánh đã được gán.",
    nextStep:
      "Quay lại phân hệ mặc định hoặc liên hệ quản lý để đổi chi nhánh phân công.",
    toastMessage: "Bạn không có quyền trên chi nhánh này.",
    tone: "warning",
  },
  "branch-surface-restricted": {
    title: "Khu vực này chỉ mở trên chi nhánh",
    description: "POS và KDS chỉ được mở trên chi nhánh vận hành.",
    nextStep:
      "Chuyển sang chi nhánh phù hợp hoặc quay lại phân hệ quản trị.",
    toastMessage: "POS/KDS chỉ mở trên chi nhánh vận hành.",
    tone: "warning",
  },
  "untrusted-network": {
    title: "Không thuộc mạng cửa hàng",
    description:
      "POS và KDS chỉ hoạt động khi thiết bị nối vào wifi của chi nhánh. Bạn đang ở mạng khác — vui lòng kết nối wifi cửa hàng và thử lại.",
    nextStep:
      "Kết nối wifi cửa hàng, hoặc báo chủ sở hữu mở bypass khẩn cấp tại Cổng mạng POS/KDS của chi nhánh (1 giờ / 2 giờ / 4 giờ / Ca POS / Ngày).",
    toastMessage: "Thiết bị không nằm trong mạng cửa hàng.",
    tone: "warning",
  },
};

function isBlockedStateReasonCode(
  value: string | null | undefined,
): value is BlockedStateReasonCode {
  return (
    value === "insufficient-permission" ||
    value === "missing-auth-context" ||
    value === "branch-scope-mismatch" ||
    value === "branch-surface-restricted" ||
    value === "untrusted-network"
  );
}

export function resolveBlockedState(
  reason: string | null | undefined,
): ResolvedBlockedState {
  const resolvedReason = isBlockedStateReasonCode(reason) ? reason : null;

  return {
    reason: resolvedReason,
    copy: resolvedReason
      ? BLOCKED_STATE_REASON_COPY[resolvedReason]
      : DEFAULT_BLOCKED_STATE_COPY,
  };
}

/**
 * Build the canonical access-denied URL. Proxy and server actions redirect
 * here when a request is blocked by ACL or branch-scope — it is the single
 * destination for "authenticated but not allowed".
 */
export function buildAccessDeniedPath(
  reason: BlockedStateReasonCode,
  options?: {
    from?: string | null;
  },
): string {
  const params = new URLSearchParams({ reason });
  if (options?.from) {
    params.set("from", options.from);
  }
  return `/access-denied?${params.toString()}`;
}
