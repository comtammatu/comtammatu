export type BlockedStateReasonCode =
  | "insufficient-permission"
  | "missing-auth-context"
  | "branch-scope-mismatch"
  | "headquarters-branch-restricted"
  | "warehouse-branch-restricted";

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
  "headquarters-branch-restricted": {
    title: "Khu vực này không mở trên kho tổng",
    description:
      "POS và KDS chỉ được mở trên chi nhánh vận hành, không dùng cho kho tổng hoặc bếp trung tâm.",
    nextStep:
      "Chuyển sang chi nhánh vận hành phù hợp hoặc quay lại phân hệ quản trị.",
    toastMessage: "POS/KDS không mở trên kho tổng/bếp trung tâm.",
    tone: "warning",
  },
  "warehouse-branch-restricted": {
    title: "Khu vực này không mở trên kho tổng",
    description:
      "POS và KDS chỉ được mở trên chi nhánh vận hành, không dùng cho kho tổng hoặc bếp trung tâm.",
    nextStep:
      "Chuyển sang chi nhánh vận hành phù hợp hoặc quay lại phân hệ quản trị.",
    toastMessage: "POS/KDS không mở trên kho tổng/bếp trung tâm.",
    tone: "warning",
  },
};

interface SearchParamsReader {
  get(name: string): string | null;
}

export function isBlockedStateReasonCode(
  value: string | null | undefined,
): value is BlockedStateReasonCode {
  return (
    value === "insufficient-permission" ||
    value === "missing-auth-context" ||
    value === "branch-scope-mismatch" ||
    value === "headquarters-branch-restricted" ||
    value === "warehouse-branch-restricted"
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

export function readBlockedStateFromSearchParams(
  searchParams: SearchParamsReader,
): ResolvedBlockedState | null {
  if (searchParams.get("forbidden") !== "1") {
    return null;
  }

  return resolveBlockedState(searchParams.get("reason"));
}

/**
 * Build the canonical access-denied URL. Proxy and server actions redirect
 * here when a request is blocked by ACL or branch-scope — it is the single
 * destination for "authenticated but not allowed".
 *
 * There is one `/access-denied` route; the beta surface shares it today. If
 * beta grows its own shell, introduce `/beta/access-denied` and branch here.
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
