"use client";

import Link from "next/link";
import { Button } from "@comtammatu/ui/components/button";
import { messages } from "@lib/messages";
import {
  ArrowRight as IconArrowRight,
  TriangleAlert as IconAlertTriangle,
} from "lucide-react";

interface UnassignedBannerProps {
  count: number;
  branchId: number;
  onFilter: () => void;
}

export function UnassignedBanner({
  count,
  branchId,
  onFilter,
}: UnassignedBannerProps) {
  if (count <= 0) return null;

  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-1.5 border-b border-warning/20 bg-warning/10 px-2 py-1 md:px-3"
    >
      <div className="flex min-w-0 items-center gap-1 text-xs font-semibold text-warning sm:text-sm">
        <IconAlertTriangle aria-hidden className="size-4 shrink-0" />
        <span>{messages.pos.kds.unassignedTitle(count)}</span>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <Button type="button" variant="ghost" size="touch" onClick={onFilter}>
          {messages.pos.kds.viewUnassigned}
        </Button>
        <Button asChild variant="outline" size="touch">
          <Link href={`/br/${branchId}/settings/kds`}>
            {messages.pos.kds.openStationConfig}
            <IconArrowRight data-icon="inline-end" aria-hidden />
          </Link>
        </Button>
      </div>
    </div>
  );
}
