"use client";

import Link from "next/link";
import {
  ArrowRight as IconArrowRight,
  Smartphone as IconDeviceMobile,
} from "lucide-react";

export function MobileEntryBanner() {
  return (
    <Link
      href="/inventory"
      className="group flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2.5 text-sm font-medium text-primary transition hover:bg-primary/10 active:scale-[0.99] md:hidden"
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/15">
        <IconDeviceMobile className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">
          Giao diện kho tối ưu cho điện thoại
        </span>
        <span className="block text-xs font-normal text-muted-foreground">
          Nhập hàng, nhận điều chuyển nhanh hơn trên mobile.
        </span>
      </span>
      <IconArrowRight className="size-4 shrink-0 transition-transform group-active:translate-x-0.5" />
    </Link>
  );
}
