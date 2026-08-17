import { formatAccountingVND as formatVND } from "@comtammatu/shared/format";
import { formatVNDate, formatVNTimeSeconds } from "@comtammatu/shared/time";
import { Badge } from "@comtammatu/ui/components/badge";
import { cn } from "@comtammatu/ui";
import { messages } from "@lib/messages";
import { displayBankContent } from "../_lib/display-bank-content";

const copy = messages.finance.bankTransactions;

export function BankMatchEvidence({
  transferType,
  amount,
  content,
  occurredAt,
  reference,
  accountNumber,
}: {
  transferType: "in" | "out";
  amount: number;
  content: string | null;
  occurredAt: string | null;
  reference: string;
  accountNumber: string | null;
}) {
  const isIn = transferType === "in";
  const date = formatVNDate(occurredAt);
  const time = formatVNTimeSeconds(occurredAt);
  const when = time !== "—" ? `${date} ${time}` : date;

  return (
    <div className="grid gap-1 border-b pb-3">
      <div className="flex items-center justify-between gap-3">
        <Badge variant="outline">{isIn ? copy.moneyIn : copy.moneyOut}</Badge>
        <span
          className={cn(
            "font-mono text-sm font-medium tabular-nums",
            isIn ? "text-success" : "text-warning",
          )}
        >
          {isIn ? "+" : "-"}
          {formatVND(amount)}
        </span>
      </div>
      <p className="line-clamp-2 text-sm font-medium">
        {displayBankContent(content)}
      </p>
      <p className="text-xs text-muted-foreground">
        {when}
        {reference !== "—" ? ` · ${reference}` : ""}
        {accountNumber
          ? ` · ${copy.account} ${accountNumber}`
          : ""}
      </p>
    </div>
  );
}
