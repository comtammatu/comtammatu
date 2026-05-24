"use client";

import Link from "next/link";
import { Button } from "@comtammatu/ui/components/button";
import { TriangleAlert as IconAlertTriangle, ArrowRight as IconArrowRight } from "lucide-react";

interface UnassignedBannerProps {
  count: number;
  onFilter: () => void;
}

export function UnassignedBanner({ count, onFilter }: UnassignedBannerProps) {
  if (count <= 0) return null;

  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-2 border-b border-warning/40 bg-warning/10 px-3 py-2 md:px-4"
    >
      <div className="flex min-w-0 items-center gap-2 text-sm font-semibold text-warning">
        <IconAlertTriangle aria-hidden className="size-4 shrink-0" />
        <span>{count} phiếu bếp chưa phân trạm</span>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onFilter}
          className="h-8 text-xs"
        >
          Xem
        </Button>
        <Button
          asChild
          variant="outline"
          size="sm"
          className="h-8 text-xs"
        >
          <Link href="/admin/settings/kds">
            Mở cấu hình
            <IconArrowRight data-icon="inline-end" aria-hidden />
          </Link>
        </Button>
      </div>
    </div>
  );
}
