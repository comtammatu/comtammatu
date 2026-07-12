"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDownLeft as IconMoneyIn,
  ArrowUpRight as IconMoneyOut,
} from "lucide-react";
import { formatVND } from "@comtammatu/shared/format";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Input } from "@comtammatu/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { toast } from "@comtammatu/ui/components/sonner";
import { cn } from "@comtammatu/ui/lib/utils";
import { Item, ItemContent } from "@comtammatu/ui/components/item";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import { messages } from "@lib/messages";
import {
  SEPAY_BANK_WEBHOOK_REVIEW_VALUES,
  classifySepayReconciliationState,
  classifySepayUnmatchedMoneyIn,
  isSepayOverpayment,
  isOpenSepayBankWebhookReview,
  type SepayBankWebhookReviewStatus,
  type SepayBankTransaction,
  type SepayMissingBankWebhookPayment,
  type SepayReconciliationState,
  type SepayUnmatchedMoneyInReason,
} from "../_lib/sepay-bank-transaction-model";
import {
  linkSepayTransactionToPayment,
  reviewMissingBankWebhookPayment,
} from "../bank-webhook-review-actions";
import type { ExpenseMatchOption } from "../expense-actions";
import { MatchExpenseCell } from "./match-expense-cell";

const copy = messages.finance.bankTransactions;
const REVIEW_PENDING_VALUE = "pending";
const BANK_RECONCILIATION_FILTER_VALUES = [
  "all",
  "needs_review",
  "money_in_review",
  "money_out_review",
  "missing_webhook",
  "overpayment",
  "matched",
  "webhook_error",
] as const;
function reconciliationStateBadgeMeta(state: SepayReconciliationState): {
  label: string;
  variant: "success" | "warning" | "destructive";
} {
  if (state === "matched") {
    return { label: copy.reconciliationStateLabels[state], variant: "success" };
  }
  if (state === "webhook_error") {
    return {
      label: copy.reconciliationStateLabels[state],
      variant: "destructive",
    };
  }
  return { label: copy.reconciliationStateLabels[state], variant: "warning" };
}

interface BankTransactionsTableProps {
  transactions: SepayBankTransaction[];
  missingBankWebhookPayments: SepayMissingBankWebhookPayment[];
  expenseOptions: ExpenseMatchOption[];
  canLinkPayments: boolean;
}

type BankReconciliationFilter =
  (typeof BANK_RECONCILIATION_FILTER_VALUES)[number];

type BankReconciliationRow =
  | {
      kind: "bank";
      tx: SepayBankTransaction;
    }
  | {
      kind: "missing_webhook";
      payment: SepayMissingBankWebhookPayment;
    };

function compactDateTime(value: string | null): string {
  if (!value) return "—";
  return value.replace("T", " ").slice(0, 16);
}

function referenceCode(tx: SepayBankTransaction): string {
  return tx.referenceCode ?? tx.code ?? tx.requestId;
}

function optionalReferenceCode(tx: SepayBankTransaction): string {
  return tx.referenceCode ?? tx.code ?? "—";
}

function formatOrderId(orderId: number | null): string {
  return orderId == null ? "—" : `#${orderId}`;
}

function formatPaymentId(paymentId: number): string {
  return `#${paymentId}`;
}

function formatProviderRef(providerRef: string | null): string {
  return providerRef?.trim() ? providerRef : "—";
}

function isReviewStatus(value: string): value is SepayBankWebhookReviewStatus {
  return SEPAY_BANK_WEBHOOK_REVIEW_VALUES.some((status) => status === value);
}

function isBankReconciliationFilter(
  value: string,
): value is BankReconciliationFilter {
  return BANK_RECONCILIATION_FILTER_VALUES.some((filter) => filter === value);
}

function AmountCell({ tx }: { tx: SepayBankTransaction }) {
  const isIn = tx.transferType === "in";
  const Icon = isIn ? IconMoneyIn : IconMoneyOut;

  return (
    <div
      className={cn(
        "flex items-center justify-end gap-1.5 whitespace-nowrap font-mono text-sm font-semibold tabular-nums",
        isIn ? "text-success" : "text-warning",
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      {isIn ? "+" : "-"}
      {formatVND(tx.amount)}
    </div>
  );
}

function PaymentAmountCell({
  payment,
}: {
  payment: SepayMissingBankWebhookPayment;
}) {
  return (
    <div className="flex items-center justify-end gap-1.5 whitespace-nowrap font-mono text-sm font-semibold tabular-nums text-success">
      <IconMoneyIn className="size-3.5" aria-hidden />+
      {formatVND(payment.amount)}
    </div>
  );
}

function reasonLabel(reason: SepayUnmatchedMoneyInReason): string {
  return copy.unmatchedMoneyInTable.reasonLabels[reason];
}

function reasonDetail(tx: SepayBankTransaction): string {
  if (isSepayOverpayment(tx)) return copy.overpayment.detail;
  if (tx.errorCode) return tx.errorCode;
  if (tx.processingStatus === "failed") return tx.processingStatus;
  return optionalReferenceCode(tx);
}

function ReconciliationStateBadge({ tx }: { tx: SepayBankTransaction }) {
  const state = classifySepayReconciliationState(tx);
  const meta = reconciliationStateBadgeMeta(state);

  return <Badge variant={meta.variant}>{meta.label}</Badge>;
}

function reviewStatusLabel(
  status: SepayBankWebhookReviewStatus | typeof REVIEW_PENDING_VALUE,
): string {
  return copy.missingWebhookTable.reviewStatusLabels[status];
}

function missingWebhookBadge(payment: SepayMissingBankWebhookPayment) {
  const status = payment.bankWebhookReviewStatus ?? REVIEW_PENDING_VALUE;
  const variant =
    status === "resolved"
      ? "success"
      : status === "ignored"
        ? "secondary"
        : "warning";

  return <Badge variant={variant}>{reviewStatusLabel(status)}</Badge>;
}

function ReconciliationStatusCell({ tx }: { tx: SepayBankTransaction }) {
  const state = classifySepayReconciliationState(tx);
  const detail =
    tx.transferType === "in" && state !== "matched"
      ? reasonLabel(classifySepayUnmatchedMoneyIn(tx))
      : state !== "matched"
        ? copy.reconciliation.unmatchedMoneyOut
        : null;

  return (
    <div className="flex flex-col gap-1">
      <ReconciliationStateBadge tx={tx} />
      {detail ? (
        <span className="text-xs text-muted-foreground">{detail}</span>
      ) : null}
      {tx.transferType === "in" && state !== "matched" ? (
        <span className="font-mono text-xs text-muted-foreground">
          {reasonDetail(tx)}
        </span>
      ) : null}
    </div>
  );
}

function RowTypeBadge({ row }: { row: BankReconciliationRow }) {
  if (row.kind === "missing_webhook") {
    return (
      <Badge variant="outline" className="border-info/20 bg-info/10 text-info">
        {copy.filters.missingWebhook}
      </Badge>
    );
  }

  const isIn = row.tx.transferType === "in";
  return (
    <Badge
      variant="outline"
      className={
        isIn
          ? "border-success/20 bg-success/10 text-success"
          : "border-warning/20 bg-warning/10 text-warning"
      }
    >
      {isIn ? copy.moneyIn : copy.moneyOut}
    </Badge>
  );
}

function RowContentCell({ row }: { row: BankReconciliationRow }) {
  if (row.kind === "missing_webhook") {
    return (
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="flex min-w-0 items-center gap-2">
          <RowTypeBadge row={row} />
          <span className="min-w-0 truncate font-medium">
            {copy.missingWebhookTable.payment}{" "}
            {formatPaymentId(row.payment.paymentId)}
          </span>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span>{compactDateTime(row.payment.paidAt)}</span>
          <span>
            {copy.missingWebhookTable.order}:{" "}
            {formatOrderId(row.payment.orderId)}
          </span>
          <span className="font-mono">
            {formatProviderRef(row.payment.providerRef)}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex min-w-0 items-center gap-2">
        <RowTypeBadge row={row} />
        <span className="min-w-0 truncate font-medium">
          {row.tx.content ?? copy.noContent}
        </span>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>
          {compactDateTime(row.tx.transactionDate ?? row.tx.createdAt)}
        </span>
        <span className="font-mono">{referenceCode(row.tx)}</span>
        {isSepayOverpayment(row.tx) ? (
          <span>
            {copy.overpayment.order}: {formatOrderId(row.tx.orderId)}
          </span>
        ) : null}
        <span>
          {copy.account}: {row.tx.accountNumber ?? "—"}
        </span>
      </div>
    </div>
  );
}

function MatchCell({
  tx,
  expenseOptions,
}: {
  tx: SepayBankTransaction;
  expenseOptions: ExpenseMatchOption[];
}) {
  return (
    <MatchExpenseCell
      eventId={tx.eventId}
      amount={tx.amount}
      paymentId={tx.paymentId}
      expenseIds={tx.expenseIds}
      supplierPaymentMatches={tx.supplierPaymentMatches}
      transferType={tx.transferType}
      expenseOptions={expenseOptions}
    />
  );
}

function LinkPaymentCell({
  tx,
  canLinkPayments,
}: {
  tx: SepayBankTransaction;
  canLinkPayments: boolean;
}) {
  const router = useRouter();
  const [paymentId, setPaymentId] = React.useState("");
  const [isPending, startTransition] = React.useTransition();
  const table = copy.unmatchedMoneyInTable;
  const reason = classifySepayUnmatchedMoneyIn(tx);

  if (!canLinkPayments || reason === "webhook_error") {
    return (
      <span className="text-muted-foreground">{table.linkUnavailable}</span>
    );
  }

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsedPaymentId = Number(paymentId.trim());
    if (!Number.isSafeInteger(parsedPaymentId) || parsedPaymentId <= 0) {
      toast.error(table.linkInvalid);
      return;
    }

    startTransition(async () => {
      const res = await linkSepayTransactionToPayment({
        eventId: tx.eventId,
        paymentId: parsedPaymentId,
      });

      if (!res.success) {
        toast.error(res.error ?? table.linkError);
        return;
      }

      toast.success(table.linkSuccess);
      setPaymentId("");
      router.refresh();
    });
  };

  return (
    <form
      className="flex items-center justify-end gap-2"
      onSubmit={handleSubmit}
    >
      <Input
        inputMode="numeric"
        pattern="[0-9]*"
        aria-label={table.linkInputLabel}
        placeholder={table.linkInputPlaceholder}
        value={paymentId}
        onChange={(event) => setPaymentId(event.target.value)}
        disabled={isPending}
        className="h-8 w-24 font-mono"
      />
      <Button type="submit" size="sm" disabled={isPending}>
        {isPending ? table.linkPending : table.linkAction}
      </Button>
    </form>
  );
}

function ReviewStatusSelect({
  payment,
}: {
  payment: SepayMissingBankWebhookPayment;
}) {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();
  const table = copy.missingWebhookTable;
  const value = payment.bankWebhookReviewStatus ?? REVIEW_PENDING_VALUE;

  const handleChange = (nextValue: string) => {
    if (!isReviewStatus(nextValue)) return;

    startTransition(async () => {
      const res = await reviewMissingBankWebhookPayment({
        paymentId: payment.paymentId,
        status: nextValue,
      });

      if (!res.success) {
        toast.error(res.error ?? table.reviewStatusError);
        return;
      }

      toast.success(table.reviewStatusSuccess);
      router.refresh();
    });
  };

  return (
    <Select value={value} onValueChange={handleChange} disabled={isPending}>
      <SelectTrigger size="sm" className="h-8 w-28">
        <SelectValue placeholder={table.reviewStatusPlaceholder} />
      </SelectTrigger>
      <SelectContent align="end">
        <SelectItem value={REVIEW_PENDING_VALUE} disabled>
          {reviewStatusLabel(REVIEW_PENDING_VALUE)}
        </SelectItem>
        {SEPAY_BANK_WEBHOOK_REVIEW_VALUES.map((status) => (
          <SelectItem key={status} value={status}>
            {reviewStatusLabel(status)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function ReconciliationActionCell({
  tx,
  expenseOptions,
  canLinkPayments,
}: {
  tx: SepayBankTransaction;
  expenseOptions: ExpenseMatchOption[];
  canLinkPayments: boolean;
}) {
  const state = classifySepayReconciliationState(tx);

  if (isSepayOverpayment(tx)) {
    return (
      <span className="text-muted-foreground">
        {copy.overpayment.linkUnavailable}
      </span>
    );
  }

  if (state === "webhook_error") {
    return (
      <span className="text-muted-foreground">
        {copy.unmatchedMoneyInTable.linkUnavailable}
      </span>
    );
  }

  if (tx.transferType === "in" && state !== "matched") {
    return <LinkPaymentCell tx={tx} canLinkPayments={canLinkPayments} />;
  }

  return <MatchCell tx={tx} expenseOptions={expenseOptions} />;
}

function rowMatchesFilter(
  row: BankReconciliationRow,
  filter: BankReconciliationFilter,
): boolean {
  if (filter === "all") return true;

  if (row.kind === "missing_webhook") {
    if (filter === "missing_webhook") return true;
    return (
      filter === "needs_review" &&
      isOpenSepayBankWebhookReview(row.payment.bankWebhookReviewStatus)
    );
  }

  const state = classifySepayReconciliationState(row.tx);

  if (filter === "needs_review") {
    return state !== "matched";
  }
  if (filter === "overpayment") return isSepayOverpayment(row.tx);
  if (filter === "matched") return state === "matched";
  if (filter === "webhook_error") return state === "webhook_error";
  if (filter === "money_in_review") {
    return row.tx.transferType === "in" && state !== "matched";
  }
  if (filter === "money_out_review") {
    return row.tx.transferType === "out" && state !== "matched";
  }

  return false;
}

export function BankTransactionsTable({
  transactions,
  missingBankWebhookPayments,
  expenseOptions,
  canLinkPayments,
}: BankTransactionsTableProps) {
  const [filter, setFilter] = React.useState<BankReconciliationFilter>("all");
  const rows = React.useMemo<BankReconciliationRow[]>(
    () => [
      ...transactions.map((tx) => ({ kind: "bank" as const, tx })),
      ...missingBankWebhookPayments.map((payment) => ({
        kind: "missing_webhook" as const,
        payment,
      })),
    ],
    [missingBankWebhookPayments, transactions],
  );
  const filteredRows = React.useMemo(
    () => rows.filter((row) => rowMatchesFilter(row, filter)),
    [filter, rows],
  );
  const isFiltered = filter !== "all";
  const filterOptions = [
    ["all", copy.filters.all],
    ["needs_review", copy.filters.needsReview],
    ["money_in_review", copy.filters.moneyInReview],
    ["money_out_review", copy.filters.moneyOutReview],
    ["missing_webhook", copy.filters.missingWebhook],
    ["overpayment", copy.filters.overpayment],
    ["matched", copy.filters.matched],
    ["webhook_error", copy.filters.webhookError],
  ] as const;
  const columns: DataTableColumn<BankReconciliationRow>[] = [
    {
      key: "content",
      header: copy.table.content,
      className: "min-w-96",
      render: (row) => <RowContentCell row={row} />,
    },
    {
      key: "amount",
      header: copy.table.amount,
      className: "w-40 text-right font-mono tabular-nums",
      render: (row) =>
        row.kind === "bank" ? (
          <AmountCell tx={row.tx} />
        ) : (
          <PaymentAmountCell payment={row.payment} />
        ),
    },
    {
      key: "status",
      header: copy.table.status,
      className: "w-44",
      render: (row) =>
        row.kind === "bank" ? (
          <ReconciliationStatusCell tx={row.tx} />
        ) : (
          <div className="flex flex-col gap-1">
            {missingWebhookBadge(row.payment)}
            <span className="text-xs text-muted-foreground">
              {copy.reconciliation.missingBankWebhook}
            </span>
          </div>
        ),
    },
    {
      key: "match",
      header: copy.table.action,
      className: "w-64 text-right",
      render: (row) =>
        row.kind === "bank" ? (
          <ReconciliationActionCell
            tx={row.tx}
            expenseOptions={expenseOptions}
            canLinkPayments={canLinkPayments}
          />
        ) : (
          <ReviewStatusSelect payment={row.payment} />
        ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={filteredRows}
      getRowKey={(row) =>
        row.kind === "bank"
          ? `bank-${row.tx.eventId}`
          : `missing-${row.payment.paymentId}`
      }
      actions={
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          {filterOptions.map(([value, label]) => (
            <Button
              key={value}
              type="button"
              variant={filter === value ? "default" : "outline"}
              size="sm"
              className="h-8 px-3 text-xs"
              onClick={() =>
                setFilter(isBankReconciliationFilter(value) ? value : "all")
              }
            >
              {label}
            </Button>
          ))}
          <Badge variant="secondary" className="font-mono">
            {copy.visibleRows(filteredRows.length, rows.length)}
          </Badge>
        </div>
      }
      emptyTitle={isFiltered ? copy.filteredEmptyTitle : copy.emptyTitle}
      emptyDescription={
        isFiltered ? copy.filteredEmptyDescription : copy.emptyDescription
      }
      emptyMode={isFiltered ? "no-results" : "no-data"}
      mobileCardRender={(row) => (
        <Item variant="outline">
          <ItemContent className="gap-3">
            <RowContentCell row={row} />
            <div className="flex items-start justify-between gap-3">
              {row.kind === "bank" ? (
                <AmountCell tx={row.tx} />
              ) : (
                <PaymentAmountCell payment={row.payment} />
              )}
              {row.kind === "bank" ? (
                <ReconciliationStatusCell tx={row.tx} />
              ) : (
                missingWebhookBadge(row.payment)
              )}
            </div>
            <div className="flex justify-end">
              {row.kind === "bank" ? (
                <ReconciliationActionCell
                  tx={row.tx}
                  expenseOptions={expenseOptions}
                  canLinkPayments={canLinkPayments}
                />
              ) : (
                <ReviewStatusSelect payment={row.payment} />
              )}
            </div>
          </ItemContent>
        </Item>
      )}
    />
  );
}
