"use client";

import { useRouter } from "next/navigation";
import { CalendarCheck as IconCalendarStats } from "lucide-react";
import {
  PeriodCloseCard,
  type PeriodRow,
} from "@/inventory/_components/period-close-card";
import { messages } from "@lib/messages";

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
  const copy = messages.finance.periodsAdmin;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <IconCalendarStats className="size-6 text-info" />
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
            {copy.title}
          </h1>
          <p className="text-sm text-muted-foreground">
            {copy.description}
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
