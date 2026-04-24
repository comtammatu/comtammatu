"use client";

import { useRouter } from "next/navigation";
import { IconCalendarStats } from "@tabler/icons-react";
import {
  PeriodCloseCard,
  type PeriodRow,
} from "@/inventory/_components/period-close-card";

export type { PeriodRow };

interface Props {
  initial: PeriodRow[];
}

/**
 * Accounting periods admin (S12).
 * Shows last 13 months (current + 12 prior) with soft/hard close status.
 * Each card shows live state + actions (gated by accounting:period_reopen).
 */
export function PeriodAdminClient({ initial }: Props) {
  const router = useRouter();

  return (
    <div className="container mx-auto max-w-3xl space-y-4 py-6">
      <div className="flex items-center gap-2">
        <IconCalendarStats className="size-6 text-blue-600" />
        <div>
          <h1 className="text-2xl font-semibold">Kỳ kế toán</h1>
          <p className="text-sm text-muted-foreground">
            Soft close tự động ngày 5 tháng sau • hard close ngày 15 (cron).
            Reopen cần typed confirm + audit trail.
          </p>
        </div>
      </div>

      <ul className="space-y-3">
        {initial.map((p) => (
          <li key={`${p.year}-${p.month}`}>
            <PeriodCloseCard
              period={p}
              strictConfirm
              onChanged={() => router.refresh()}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
