"use client";

import { usePathname } from "next/navigation";
import { Toaster } from "@comtammatu/ui/components/sonner";
import { useIsMobile } from "@comtammatu/ui/hooks/use-mobile";
import { selectToasterPreset } from "./responsive-toaster-presets";

/**
 * Toaster với config riêng cho thiết bị vận hành. Mobile toàn app và POS/KDS
 * mọi viewport dùng preset gọn (`top-center`, close button, 1-toast stack,
 * không expand); desktop ngoài POS/KDS giữ preset desktop (`top-right`,
 * expand khi hover, 5 toast cùng lúc).
 *
 * Preset selection thuần (không phụ thuộc render) sống ở
 * `responsive-toaster-presets.ts` — unit test theo hành vi ở đó.
 */
export function ResponsiveToaster() {
  const pathname = usePathname();
  const isMobile = useIsMobile();
  return <Toaster {...selectToasterPreset({ isMobile, pathname })} />;
}
