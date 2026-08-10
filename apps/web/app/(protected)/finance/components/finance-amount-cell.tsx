import { cn } from "@comtammatu/ui";
import { formatAccountingVND } from "@comtammatu/shared/format";
import { messages } from "@lib/messages";

const moneyLabels = messages.finance.moneyLabels;

export type FinanceAmountBasis = "exVat" | "inclVat";

const BASIS_TITLE: Record<FinanceAmountBasis, string> = {
  exVat: moneyLabels.subtotalExVat,
  inclVat: moneyLabels.totalInclVat,
};

/** Table/sheet money cell: accounting VND + tabular nums + optional basis title. */
export function FinanceAmountCell({
  amount,
  basis,
  className,
  prefix,
  signed = false,
}: {
  amount: string | number;
  basis?: FinanceAmountBasis;
  className?: string;
  prefix?: string;
  /** When true, prefix a minus for positive outflows already passed as absolute. */
  signed?: boolean;
}) {
  const formatted = formatAccountingVND(amount);
  const display =
    prefix != null
      ? `${prefix}${formatted}`
      : signed && Number(amount) !== 0
        ? `-${formatted}`
        : formatted;

  return (
    <span
      className={cn(
        "shrink-0 whitespace-nowrap font-mono tabular-nums text-right",
        className,
      )}
      title={basis ? `${BASIS_TITLE[basis]}: ${display}` : display}
    >
      {display}
    </span>
  );
}
