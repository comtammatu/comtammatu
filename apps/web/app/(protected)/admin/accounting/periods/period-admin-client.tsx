"use client";

import { useRouter } from "next/navigation";
import { AppPage, AppPageHeader } from "@/components/surface";
import {
  PeriodCloseCard,
  type PeriodRow,
} from "@/components/period-close-card";
import { messages } from "@lib/messages";

export type { PeriodRow };

interface Props {
  initial: PeriodRow[];
  /** Whether the current user has accounting:period_reopen permission. */
  canCloseOrReopen: boolean;
}

/**
 * Accounting periods admin (S12).
 * Shows last 13 months (current + 12 prior) with soft/hard close status.
 * Each card shows live state + actions (gated by accounting:period_reopen).
 * Destructive actions (close/reopen) are wrapped in AlertDialog inside PeriodCloseCard.
 */
export function PeriodAdminClient({ initial, canCloseOrReopen }: Props) {
  const router = useRouter();
  const copy = messages.finance.periodsAdmin;

  return (
    <AppPage>
      <AppPageHeader
        title={copy.title}
        description={copy.description}
      />

      <ul className="space-y-3">
        {initial.map((p) => (
          <li key={`${p.year}-${p.month}`}>
            <PeriodCloseCard
              period={p}
              strictConfirm={canCloseOrReopen}
              onChanged={() => router.refresh()}
            />
          </li>
        ))}
      </ul>
    </AppPage>
  );
}
