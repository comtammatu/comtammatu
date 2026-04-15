export type BlockedStateReasonCode =
  | "insufficient-permission"
  | "missing-auth-context"
  | "headquarters-branch-restricted";

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
  "headquarters-branch-restricted": {
    title: "Khu vực này không mở trên trụ sở",
    description:
      "POS và KDS chỉ được mở trên chi nhánh vận hành, không dùng cho chi nhánh trụ sở.",
    nextStep:
      "Chuyển sang chi nhánh vận hành phù hợp hoặc quay lại phân hệ quản trị.",
    toastMessage: "POS/KDS không mở trên chi nhánh trụ sở.",
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
    value === "headquarters-branch-restricted"
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

export function buildLoginBlockedStatePath(
  reason: BlockedStateReasonCode = "missing-auth-context",
  options?: {
    surface?: "legacy" | "beta";
  },
): string {
  const pathname = options?.surface === "beta" ? "/beta/login" : "/login";
  return `${pathname}?forbidden=1&reason=${reason}`;
}
