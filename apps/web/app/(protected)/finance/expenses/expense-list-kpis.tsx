import {
  formatAccountingVND,
  formatCompactVND,
  formatCount,
} from "@comtammatu/shared/format";
import { KpiCard } from "@/components/kpi/kpi-card";
import { KpiRow } from "@/components/surface";
import { messages } from "@lib/messages";
import { copy } from "./expense-form-schema";

const equipmentCopy = messages.finance.equipment;
const constructionCopy = messages.finance.construction;

export function ExpenseListKpis({
  listMode,
  operatingTotal,
  operatingCount,
  startupTotal,
  startupCount,
}: {
  listMode: "ledger" | "equipment" | "construction";
  operatingTotal: string;
  operatingCount: number;
  startupTotal: string;
  startupCount: number;
  needsActionTotal?: string;
  needsActionCount?: number;
  isNeedsActionActive?: boolean;
  onToggleNeedsAction?: () => void;
}) {
  const lockedCopy =
    listMode === "construction" ? constructionCopy : equipmentCopy;
  const lockedLabel =
    listMode === "construction"
      ? messages.finance.basic.kpis.construction
      : messages.finance.basic.kpis.equipment;

  return (
    <KpiRow
      density="compact"
      className="grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-2"
    >
      {listMode === "ledger" ? (
        <>
          <KpiCard
            density="compact"
            label={copy.monthLabel}
            value={formatAccountingVND(operatingTotal)}
            shortValue={formatCompactVND(operatingTotal)}
            hint={copy.monthHint(formatCount(operatingCount))}
          />
          <KpiCard
            density="compact"
            label={copy.startupLabel}
            value={formatAccountingVND(startupTotal)}
            shortValue={formatCompactVND(startupTotal)}
            hint={copy.startupHint(formatCount(startupCount))}
          />
        </>
      ) : (
        <KpiCard
          density="compact"
          label={lockedLabel}
          value={formatAccountingVND(startupTotal)}
          shortValue={formatCompactVND(startupTotal)}
          hint={lockedCopy.totalHint(formatCount(startupCount))}
        />
      )}
    </KpiRow>
  );
}
