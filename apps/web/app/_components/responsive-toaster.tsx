"use client";

import { usePathname } from "next/navigation";
import { Toaster } from "@comtammatu/ui/components/sonner";
import { useIsMobile } from "@comtammatu/ui/hooks/use-mobile";

const OPERATIONAL_TOAST_ROUTE_PATTERN = /^\/br\/[^/]+\/(?:pos|kds)(?:\/|$)/;
const TOAST_CLASS_NAMES = {
  toast: "cn-toast",
};
const COMPACT_TOAST_OFFSET = {
  top: "calc(env(safe-area-inset-top) + 0.5rem)",
  left: "0.5rem",
  right: "0.5rem",
};

function isOperationalToastRoute(pathname: string | null): boolean {
  return pathname !== null && OPERATIONAL_TOAST_ROUTE_PATTERN.test(pathname);
}

/**
 * Toaster với config riêng cho thiết bị vận hành.
 *
 * Mobile toàn app và POS/KDS mọi viewport:
 * - `top-center` — tránh notch / Dynamic Island ở góc, không che FAB ở đáy,
 *   gần thumb-reach để tap action / swipe dismiss.
 * - `closeButton` — user tap ✕ dismiss nhanh, không cần swipe.
 * - `visibleToasts={3}` + `expand={false}` — toast stack gọn cho POS/KDS
 *   trên phone/tablet, không tối ưu theo giả định desktop PC.
 * - `offset` + `mobileOffset` — tablet không bị rơi về Sonner desktop offset.
 *
 * Desktop ngoài POS/KDS giữ `top-right`, `expand` khi hover, 5 toast cùng lúc.
 */
export function ResponsiveToaster() {
  const pathname = usePathname();
  const isMobile = useIsMobile();
  const compactOperationalToaster =
    isMobile || isOperationalToastRoute(pathname);

  if (compactOperationalToaster) {
    return (
      <Toaster
        richColors
        position="top-center"
        visibleToasts={3}
        closeButton
        expand={false}
        gap={8}
        offset={COMPACT_TOAST_OFFSET}
        mobileOffset={COMPACT_TOAST_OFFSET}
        containerAriaLabel="Thông báo thao tác"
        toastOptions={{
          classNames: TOAST_CLASS_NAMES,
        }}
      />
    );
  }

  return <Toaster richColors position="top-right" visibleToasts={5} expand />;
}
