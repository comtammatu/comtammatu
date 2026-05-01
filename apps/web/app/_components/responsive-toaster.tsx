"use client";

import { Toaster } from "@comtammatu/ui/components/sonner";
import { useIsMobile } from "@comtammatu/ui/hooks/use-mobile";

/**
 * Toaster với config khác cho mobile vs desktop.
 *
 * Mobile (<768px):
 * - `top-center` — tránh notch / Dynamic Island ở góc, không che FAB ở đáy,
 *   gần thumb-reach để tap action / swipe dismiss.
 * - `closeButton` — user tap ✕ dismiss nhanh, không cần swipe.
 * - `visibleToasts={3}` — tránh xếp chồng tràn viewport hẹp.
 * - `expand={false}` — toast collapse mặc định để khỏi che màn hình.
 * - `mobileOffset` — bám sát mép cho rộng tối đa.
 *
 * Desktop (≥768px): giữ `top-right` quen thuộc, `expand` khi hover, 5 toast
 * cùng lúc cho cashier máy bàn theo dõi nhiều job.
 *
 * SSR trả về null trong lần render đầu (useIsMobile chưa biết viewport) →
 * Toaster gắn sau hydration. Toast trigger trước hydration sẽ rơi vào batch
 * Sonner internal queue và hiển thị khi component mount.
 */
export function ResponsiveToaster() {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <Toaster
        richColors
        position="top-center"
        visibleToasts={3}
        closeButton
        expand={false}
        mobileOffset={{ top: 8, left: 8, right: 8 }}
        toastOptions={{
          classNames: {
            toast: "cn-toast",
          },
        }}
      />
    );
  }

  return (
    <Toaster
      richColors
      position="top-right"
      visibleToasts={5}
      expand
    />
  );
}
