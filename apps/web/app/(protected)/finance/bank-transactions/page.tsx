import Link from "next/link";
import {
  ArrowDownLeft as IconMoneyIn,
  ArrowUpRight as IconMoneyOut,
} from "lucide-react";
import { formatVND } from "@comtammatu/shared/format";
import { Button } from "@comtammatu/ui/components/button";
import { cn } from "@comtammatu/ui/lib/utils";
import {
  AppEmptyState,
  AppPage,
  AppPageHeader,
  AppSection,
} from "@/components/surface";
import { messages } from "@lib/messages";
import { fetchSepayBankTransactions } from "../_lib/sepay-bank-transactions";

const copy = messages.finance.bankTransactions;

function compactDateTime(value: string | null): string {
  if (!value) return "—";
  return value.replace("T", " ").slice(0, 16);
}

function statusLabel(status: string): string {
  if (status === "processed") return copy.status.processed;
  if (status === "ignored") return copy.status.ignored;
  if (status === "failed") return copy.status.failed;
  if (status === "received") return copy.status.received;
  return status;
}

export default async function BankTransactionsPage() {
  const transactions = await fetchSepayBankTransactions();

  return (
    <AppPage width="wide" density="compact">
      <AppPageHeader
        eyebrow={copy.eyebrow}
        title={copy.title}
        description={copy.description}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/finance">{messages.finance.common.backToFinance}</Link>
          </Button>
        }
      />

      <AppSection size="sm" title={copy.listTitle}>
        {transactions.length === 0 ? (
          <AppEmptyState
            compact
            title={copy.emptyTitle}
            description={copy.emptyDescription}
          />
        ) : (
          <div className="flex flex-col gap-3">
            {transactions.map((tx) => {
              const isIn = tx.transferType === "in";
              const Icon = isIn ? IconMoneyIn : IconMoneyOut;
              return (
                <div
                  key={tx.eventId}
                  className="flex min-w-0 flex-col gap-2 border-b border-border pb-3 last:border-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex min-w-0 gap-3">
                    <span
                      className={cn(
                        "mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-md",
                        isIn
                          ? "bg-success/10 text-success"
                          : "bg-warning/10 text-warning",
                      )}
                    >
                      <Icon className="size-4" aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {tx.content ?? tx.code ?? copy.noContent}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {compactDateTime(tx.transactionDate ?? tx.createdAt)} ·{" "}
                        {statusLabel(tx.processingStatus)}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {copy.account}: {tx.accountNumber ?? "—"} ·{" "}
                        {copy.reference}: {tx.referenceCode ?? tx.requestId}
                      </p>
                    </div>
                  </div>
                  <div
                    className={cn(
                      "shrink-0 font-mono text-sm font-semibold tabular-nums sm:text-right",
                      isIn ? "text-success" : "text-warning",
                    )}
                  >
                    {isIn ? "+" : "-"}
                    {formatVND(tx.amount)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </AppSection>
    </AppPage>
  );
}
