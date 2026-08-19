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

export function ExpenseListKpis({
  isEquipmentList,
  operatingTotal,
  operatingCount,
  startupTotal,
  startupCount,
}: {
  isEquipmentList: boolean;
  operatingTotal: string;
  operatingCount: number;
  startupTotal: string;
  startupCount: number;
}) {
  return (
    <KpiRow
      density="compact"
      className="grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-2"
    >
      {isEquipmentList ? (
        <KpiCard
          density="compact"
          label={messages.finance.basic.kpis.equipment}
          value={formatAccountingVND(startupTotal)}
          shortValue={formatCompactVND(startupTotal)}
          hint={equipmentCopy.totalHint(formatCount(startupCount))}
        />
      ) : (
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
      )}
    </KpiRow>
  );
}
