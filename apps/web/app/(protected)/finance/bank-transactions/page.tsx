/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: operator UI */
import Link from "next/link";
import {
  ArrowDownLeft as IconMoneyIn,
  ArrowUpRight as IconMoneyOut,
} from "lucide-react";
import { formatVND } from "@comtammatu/shared/format";
import { Button } from "@comtammatu/ui/components/button";
import { cn } from "@comtammatu/ui/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@comtammatu/ui/components/table";
import {
  AppEmptyState,
  AppPage,
  AppPageHeader,
  AppSection,
} from "@/components/surface";
import { messages } from "@lib/messages";
import { fetchSepayBankTransactions } from "../_lib/sepay-bank-transactions";
import { fetchExpenseMatchOptions } from "../expense-actions";
import { MatchExpenseCell } from "./match-expense-cell";

const copy = messages.finance.bankTransactions;

function compactDateTime(value: string | null): string {
  if (!value) return "—";
  return value.replace("T", " ").slice(0, 16);
}

export default async function BankTransactionsPage() {
  const [transactions, expenseOptionsRes] = await Promise.all([
    fetchSepayBankTransactions(),
    fetchExpenseMatchOptions(),
  ]);

  const expenseOptions =
    expenseOptionsRes.success && expenseOptionsRes.data
      ? expenseOptionsRes.data
      : [];

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
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-44">Thời gian</TableHead>
                  <TableHead>Số Tiền</TableHead>
                  <TableHead>Nội dung chuyển khoản</TableHead>
                  <TableHead>Mã tham chiếu</TableHead>
                  <TableHead className="w-72">Khớp</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map((tx) => {
                  const isIn = tx.transferType === "in";
                  const Icon = isIn ? IconMoneyIn : IconMoneyOut;
                  const referenceCode =
                    tx.referenceCode ?? tx.code ?? tx.requestId;
                  return (
                    <TableRow key={tx.eventId}>
                      <TableCell className="text-xs text-muted-foreground">
                        {compactDateTime(tx.transactionDate ?? tx.createdAt)}
                      </TableCell>
                      <TableCell>
                        <div
                          className={cn(
                            "flex items-center gap-1.5 font-mono text-sm font-semibold tabular-nums",
                            isIn ? "text-success" : "text-warning",
                          )}
                        >
                          <Icon className="size-3.5" aria-hidden />
                          {isIn ? "+" : "-"}
                          {formatVND(tx.amount)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium">
                            {tx.content ?? copy.noContent}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {copy.account}: {tx.accountNumber ?? "—"}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {referenceCode}
                      </TableCell>
                      <TableCell>
                        <MatchExpenseCell
	                          eventId={tx.eventId}
	                          paymentId={tx.paymentId}
	                          expenseIds={tx.expenseIds}
	                          transferType={tx.transferType}
	                          expenseOptions={expenseOptions}
	                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </AppSection>
    </AppPage>
  );
}
