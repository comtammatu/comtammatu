"use client";

import { PwaToolbar, PwaToolbarEntryLink } from "@/components/pwa-toolbar";

type OperationalPwaSurface = "pos" | "kds" | "pickup";

function getDismissStorageKey(
  surface: OperationalPwaSurface,
  branchId: string,
) {
  return `operational-pwa-install-dismissed:${surface}:${branchId}`;
}

function buildCopy(surface: OperationalPwaSurface) {
  const appLabel =
    surface === "pos" ? "POS" : surface === "kds" ? "KDS" : "Gọi số";
  const jobLabel =
    surface === "pos"
      ? "đơn/thanh toán"
      : surface === "kds"
        ? "trạng thái bếp"
        : "trạng thái món";

  return {
    regionLabel: `${appLabel} - cài đặt và trạng thái kết nối`,
    entryLinkLabel: "Về Cổng vận hành",
    offline: `Mất kết nối - không thể cập nhật ${jobLabel}.`,
    iosInstallHint: `iOS: dùng Chia sẻ để thêm ${appLabel} vào Màn hình chính.`,
    iosInstallHintShort: "iOS: thêm vào Màn hình",
    installHint: `Cài đặt ${appLabel} để mở nhanh như ứng dụng.`,
    installHintShort: `Cài ${appLabel}`,
    installButton: `Cài đặt ${appLabel}`,
    installButtonShort: "Cài",
    dismissLabel: "Tạm ẩn lời nhắc",
    installButtonAria: `Cài đặt ${appLabel} lên thiết bị`,
    updateHint: "Có phiên bản mới của ứng dụng.",
    updateButton: "Tải lại",
    iosDialogTitle: `Cài đặt ${appLabel} trên iOS`,
    iosDialogDescription:
      "Safari và trình duyệt iOS không mở hộp thoại cài đặt trực tiếp.",
    iosSteps: [
      "Mở menu Chia sẻ của trình duyệt.",
      "Chọn Thêm vào Màn hình chính.",
      `Giữ tên ${appLabel} mặc định và bấm Thêm.`,
    ],
    browserDialogTitle: `Cài đặt ${appLabel} trên thiết bị này`,
    browserDialogDescription:
      "Nếu trình duyệt không mở hộp thoại cài đặt, dùng menu của trình duyệt.",
    browserSteps: [
      "Mở menu của trình duyệt.",
      "Chọn Cài đặt ứng dụng hoặc Thêm vào màn hình chính.",
      `Mở biểu tượng ${appLabel} khi bắt đầu ca.`,
    ],
    close: "Đóng",
  };
}

export function OperationalPwaToolbar({
  branchId,
  surface,
}: {
  branchId: string;
  surface: OperationalPwaSurface;
}) {
  const copy = buildCopy(surface);
  // Pickup is a guest-facing display: it never gets staff navigation.
  // POS/KDS keep the entry link in every toolbar state (including standalone,
  // where browser chrome is absent) so staff can always return to the entry.
  const entryLink =
    surface !== "pickup" ? (
      <PwaToolbarEntryLink
        href={`/br/${branchId}`}
        label={copy.entryLinkLabel}
      />
    ) : undefined;

  return (
    <PwaToolbar
      layout="full-bleed"
      copy={copy}
      dismissStorageKey={getDismissStorageKey(surface, branchId)}
      entryLink={entryLink}
    />
  );
}

export function PosPwaToolbar({ branchId }: { branchId: string }) {
  return <OperationalPwaToolbar branchId={branchId} surface="pos" />;
}

export function KdsPwaToolbar({ branchId }: { branchId: string }) {
  return <OperationalPwaToolbar branchId={branchId} surface="kds" />;
}

export function PickupPwaToolbar({ branchId }: { branchId: string }) {
  return <OperationalPwaToolbar branchId={branchId} surface="pickup" />;
}
