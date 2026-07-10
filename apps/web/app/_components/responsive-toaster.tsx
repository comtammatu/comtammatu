"use client";

import { usePathname } from "next/navigation";
import { Toaster } from "@comtammatu/ui/components/sonner";
import { useIsMobile } from "@comtammatu/ui/hooks/use-mobile";
import { selectToasterPreset } from "./responsive-toaster-presets";

/**
 * Toaster theo route/device. Guest `/q/*` dùng preset tối + chữ lớn; mobile
 * toàn app và POS/KDS mọi viewport dùng preset gọn (`top-center`, close
 * button, 1-toast stack); desktop ngoài các route đó giữ preset desktop
 * (`top-right`, expand khi hover).
 *
 * Preset selection thuần sống ở `responsive-toaster-presets.ts`.
 */
export function ResponsiveToaster() {
  const pathname = usePathname();
  const isMobile = useIsMobile();
  return <Toaster {...selectToasterPreset({ isMobile, pathname })} />;
}
