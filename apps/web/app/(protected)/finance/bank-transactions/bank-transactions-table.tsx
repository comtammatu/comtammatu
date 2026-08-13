"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowDownLeft as IconMoneyIn,
  ArrowUpRight as IconMoneyOut,
} from "lucide-react";
import {
  formatAccountingVND as formatVND,
  formatCount,
} from "@comtammatu/shared/format";
import { formatVNDate, formatVNDateTime } from "@comtammatu/shared/time";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { confirm } from "@/components/confirm-dialog";
import {
  InputGroup,
  InputGroupInput,
} from "@comtammatu/ui/components/input-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { toast } from "@comtammatu/ui/components/sonner";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@comtammatu/ui/components/tooltip";
import { cn } from "@comtammatu/ui/lib/utils";
import { Item, ItemContent } from "@comtammatu/ui/components/item";
import { useIsMobile } from "@comtammatu/ui/hooks/use-mobile";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import {
  AppListFrame,
  AppSheet,
} from "@/components/surface";
import { messages } from "@lib/messages";
import {
  SEPAY_BANK_WEBHOOK_REVIEW_VALUES,
  canManuallyLinkSepayPayment,
  classifySepayReconciliationState,
  classifySepayUnmatchedMoneyIn,
  isOpenSepayBankWebhookReview,
  isSepayPaymentConflictReviewCode,
  resolveSepayTransactionInstant,
  type SepayBankWebhookReviewStatus,
  type SepayBankTransaction,
  type SepayMissingBankWebhookPayment,
  type SepayReconciliationState,
  type SepayUnmatchedMoneyInReason,
} from "../_lib/sepay-bank-transaction-model";
import {
  linkSepayTransactionToPayment,
  recordBankTransactionCashDeposit,
  reviewMissingBankWebhookPayment,
} from "../bank-webhook-review-actions";
import type { ExpenseMatchOption } from "../expense-actions";
import type { FinanceParams } from "../_lib/finance-params";
import {
  BANK_RECONCILIATION_FILTER_DEFAULT,
  BANK_RECONCILIATION_FILTER_PARAM,
  isBankReconciliationFilter,
  parseBankReconciliationFilter,
  type BankReconciliationFilter,
} from "../_lib/bank-reconciliation-filter";
import { FilterBar } from "../components/filter-bar";
import { MatchExpenseCell } from "./match-expense-cell";
import { displayBankContent } from "../_lib/display-bank-content";

export { displayBankContent };

const copy = messages.finance.bankTransactions;
const statusCopy = messages.finance.common.status;
const REVIEW_PENDING_VALUE = "pending";
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
  return { label: statusCopy.unmatched, variant: "warning" };
}

interface BankTransactionsTableProps {
  params: FinanceParams;
  transactions: SepayBankTransaction[];
  missingBankWebhookPayments: SepayMissingBankWebhookPayment[];
  expenseOptions: ExpenseMatchOption[];
  canLinkPayments: boolean;
}

type BankReconciliationRow =
  | {
      kind: "bank";
      tx: SepayBankTransaction;
    }
  | {
      kind: "missing_webhook";
      payment: SepayMissingBankWebhookPayment;
    };

function referenceCode(tx: SepayBankTransaction): string {
  return tx.referenceCode ?? tx.code ?? tx.requestId;
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

function AmountCell({ tx }: { tx: SepayBankTransaction }) {
  return (
    <TransactionAmount amount={tx.amount} transferType={tx.transferType} />
  );
}

function TransactionAmount({
  amount,
  transferType,
}: {
  amount: number;
  transferType: "in" | "out";
}) {
  const isIn = transferType === "in";
  const Icon = isIn ? IconMoneyIn : IconMoneyOut;

  return (
    <div
      className={cn(
        "flex items-center justify-end gap-1 whitespace-nowrap font-mono text-sm font-semibold tabular-nums",
        isIn ? "text-success" : "text-warning",
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      <span className="sr-only">{isIn ? copy.moneyIn : copy.moneyOut}</span>
      {isIn ? "+" : "-"}
      {formatVND(amount)}
    </div>
  );
}

function PaymentAmountCell({
  payment,
}: {
  payment: SepayMissingBankWebhookPayment;
}) {
  return <TransactionAmount amount={payment.amount} transferType="in" />;
}

function reasonLabel(reason: SepayUnmatchedMoneyInReason): string {
  return copy.unmatchedMoneyInTable.reasonLabels[reason];
}

function reviewStatusLabel(
  status: SepayBankWebhookReviewStatus | typeof REVIEW_PENDING_VALUE,
): string {
  return copy.missingWebhookTable.reviewStatusLabels[status];
}

function MissingWebhookStatusCell({
  payment,
}: {
  payment: SepayMissingBankWebhookPayment;
}) {
  const status = payment.bankWebhookReviewStatus ?? REVIEW_PENDING_VALUE;
  const variant =
    status === "resolved" || status === "ignored" ? "secondary" : "warning";

  return <Badge variant={variant}>{reviewStatusLabel(status)}</Badge>;
}

function ReconciliationStatusCell({ tx }: { tx: SepayBankTransaction }) {
  const state = classifySepayReconciliationState(tx);
  const meta = reconciliationStateBadgeMeta(state);
  const badge = <Badge variant={meta.variant}>{meta.label}</Badge>;

  const hasPaymentConflictDetail =
    tx.transferType === "in" && isSepayPaymentConflictReviewCode(tx.errorCode);
  const conflictOrder =
    hasPaymentConflictDetail && tx.orderId != null
      ? { id: tx.orderId, number: tx.orderNumber }
      : null;

  let tip: string | null = null;
  if (state === "matched" && tx.paymentId != null) {
    tip = copy.matchedPayment(tx.paymentId);
  } else if (state === "matched" && tx.expenseIds.length > 0) {
    tip = copy.matchedExpenseCount(formatCount(tx.expenseIds.length));
  } else if (tx.transferType === "in" && state !== "matched") {
    tip = hasPaymentConflictDetail
      ? null
      : reasonLabel(classifySepayUnmatchedMoneyIn(tx));
  }

  return (
    <div className="flex min-w-0 flex-col items-start gap-1">
      {tip ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <span className="inline-flex outline-none focus-visible:ring-1 focus-visible:ring-foreground" />
            }
          >
            {badge}
          </TooltipTrigger>
          <TooltipContent side="top">{tip}</TooltipContent>
        </Tooltip>
      ) : (
        badge
      )}
      {conflictOrder ? (
        <Link
          href={`/orders?orderId=${String(conflictOrder.id)}`}
          className="truncate font-mono text-xs font-medium text-primary underline-offset-2 hover:underline"
        >
          {conflictOrder.number ?? copy.unmatchedMoneyInTable.openConflictOrder}
        </Link>
      ) : null}
    </div>
  );
}

function bankRowNeedsHighlight(row: BankReconciliationRow): boolean {
  if (row.kind === "missing_webhook") {
    return isOpenSepayBankWebhookReview(row.payment.bankWebhookReviewStatus);
  }
  const state = classifySepayReconciliationState(row.tx);
  return state === "needs_review" || state === "webhook_error";
}

function rowOccurredAt(row: BankReconciliationRow): string | null {
  if (row.kind === "missing_webhook") {
    return row.payment.paidAt;
  }
  return resolveSepayTransactionInstant(row.tx);
}

function DateCell({ row }: { row: BankReconciliationRow }) {
  const instant = rowOccurredAt(row);
  return (
    <time
      dateTime={instant ?? undefined}
      className="font-mono text-sm tabular-nums text-muted-foreground"
      title={formatVNDateTime(instant)}
    >
      {formatVNDate(instant)}
    </time>
  );
}

function RowContentCell({ row }: { row: BankReconciliationRow }) {
  if (row.kind === "missing_webhook") {
    const content = `${copy.missingWebhookTable.payment} ${formatPaymentId(
      row.payment.paymentId,
    )}`;
    const reference = formatProviderRef(row.payment.providerRef);
    return (
      <div className="flex min-w-0 flex-col gap-1">
        <p className="line-clamp-2 text-sm font-medium">{content}</p>
        {reference !== "—" ? (
          <span className="truncate font-mono text-xs text-muted-foreground">
            {reference}
          </span>
        ) : null}
      </div>
    );
  }

  const content = displayBankContent(row.tx.content);
  const reference = referenceCode(row.tx);
  const isLongContent = content.length > 80;
  const contentLabel = (
    <p className="line-clamp-2 text-sm font-medium">{content}</p>
  );

  return (
    <div className="flex min-w-0 flex-col gap-1">
      {isLongContent ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <span
                className="min-w-0 outline-none focus-visible:ring-1 focus-visible:ring-foreground"
                tabIndex={0}
              />
            }
          >
            {contentLabel}
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-sm whitespace-normal">
            <p className="break-words font-medium">{content}</p>
          </TooltipContent>
        </Tooltip>
      ) : (
        contentLabel
      )}
      <span className="truncate font-mono text-xs text-muted-foreground">
        {reference}
      </span>
    </div>
  );
}

function MatchCell({
  tx,
  expenseOptions,
  touch,
}: {
  tx: SepayBankTransaction;
  expenseOptions: ExpenseMatchOption[];
  touch: boolean;
}) {
  if (tx.bankTransactionId == null && tx.eventId == null) {
    return <span className="text-muted-foreground">—</span>;
  }

  return (
    <MatchExpenseCell
      bankTransactionId={tx.bankTransactionId ?? null}
      eventId={tx.eventId}
      amount={tx.amount}
      paymentId={tx.paymentId}
      expenseIds={tx.expenseIds}
      supplierPaymentMatches={tx.supplierPaymentMatches}
      supplierPaymentMatchConfirmed={tx.supplierPaymentMatchConfirmed}
      refundMatches={tx.refundMatches}
      refundMatchConfirmed={tx.refundMatchConfirmed}
      transferType={tx.transferType}
      expenseOptions={expenseOptions}
      touch={touch}
      evidence={{
        content: tx.content,
        reference: referenceCode(tx),
        occurredAt: formatVNDateTime(resolveSepayTransactionInstant(tx)),
        accountNumber: tx.accountNumber,
      }}
    />
  );
}

function LinkPaymentCell({
  tx,
  canLinkPayments,
  touch,
}: {
  tx: SepayBankTransaction;
  canLinkPayments: boolean;
  touch: boolean;
}) {
  const router = useRouter();
  const [paymentCode, setPaymentCode] = React.useState(tx.code ?? "");
  const [open, setOpen] = React.useState(false);
  const [isPaymentPending, startPaymentTransition] = React.useTransition();
  const [isDepositPending, startDepositTransition] = React.useTransition();
  const table = copy.unmatchedMoneyInTable;
  const bankTransactionId = tx.bankTransactionId ?? null;
  const eventId = tx.eventId;

  if (
    !canLinkPayments ||
    (bankTransactionId == null && eventId == null) ||
    !canManuallyLinkSepayPayment(tx)
  ) {
    return null;
  }

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedPaymentCode = paymentCode.trim();
    if (normalizedPaymentCode === "") {
      toast.error(table.linkInvalid);
      return;
    }

    startPaymentTransition(async () => {
      const res = await linkSepayTransactionToPayment({
        bankTransactionId,
        eventId,
        paymentCode: normalizedPaymentCode,
      });

      if (!res.success) {
        toast.error(res.error ?? table.linkError);
        return;
      }

      toast.success(table.linkSuccess);
      setPaymentCode(tx.code ?? "");
      setOpen(false);
      router.refresh();
    });
  };

  const handleCashDeposit = async () => {
    if (bankTransactionId == null) return;

    const approved = await confirm({
      title: table.cashDepositConfirmTitle,
      description: table.cashDepositConfirm(formatVND(tx.amount)),
      confirmText: table.cashDepositAction,
    });
    if (!approved) return;

    startDepositTransition(async () => {
      const res = await recordBankTransactionCashDeposit({
        bankTransactionId,
      });

      if (!res.success) {
        toast.error(res.error ?? table.cashDepositError);
        return;
      }

      toast.success(table.cashDepositSuccess);
      setOpen(false);
      router.refresh();
    });
  };

  const canRecordCashDeposit = bankTransactionId != null;

  return (
    <AppSheet
      open={open}
      onOpenChange={setOpen}
      title={table.linkTitle}
      description={table.linkDescription}
      trigger={
        <Button variant="outline" size={touch ? "touch" : "sm"}>
          {copy.matchAction}
        </Button>
      }
    >
        <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
          <InputGroup size={touch ? "touch" : "default"}>
            <InputGroupInput
              autoCapitalize="characters"
              autoComplete="off"
              aria-label={table.linkInputLabel}
              aria-describedby="bank-payment-code-help"
              placeholder={table.linkInputPlaceholder}
              value={paymentCode}
              onChange={(event) => setPaymentCode(event.target.value)}
              disabled={isPaymentPending || isDepositPending}
              className="font-mono"
            />
          </InputGroup>
          <p
            id="bank-payment-code-help"
            className="text-sm text-muted-foreground"
          >
            {table.linkInputHelp}
          </p>
          <Button
            type="submit"
            size={touch ? "touch" : "default"}
            disabled={isPaymentPending || isDepositPending}
          >
            {isPaymentPending ? table.linkPending : table.linkPaymentAction}
          </Button>
          {canRecordCashDeposit ? (
            <div className="flex flex-col gap-3 border-t pt-4">
              <div>
                <p className="font-medium">{table.cashDepositTitle}</p>
                <p className="text-sm text-muted-foreground">
                  {table.cashDepositDescription}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size={touch ? "touch" : "default"}
                disabled={isPaymentPending || isDepositPending}
                onClick={() => void handleCashDeposit()}
              >
                {isDepositPending
                  ? table.cashDepositPending
                  : table.cashDepositAction}
              </Button>
            </div>
          ) : null}
        </form>
    </AppSheet>
  );
}

function ReviewStatusSelect({
  payment,
  touch,
}: {
  payment: SepayMissingBankWebhookPayment;
  touch: boolean;
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
      <SelectTrigger size={touch ? "touch" : "sm"} className="w-36">
        <SelectValue placeholder={table.reviewStatusPlaceholder} />
      </SelectTrigger>
      <SelectContent align="end">
        <SelectItem
          value={REVIEW_PENDING_VALUE}
          size={touch ? "touch" : "default"}
          disabled
        >
          {reviewStatusLabel(REVIEW_PENDING_VALUE)}
        </SelectItem>
        {SEPAY_BANK_WEBHOOK_REVIEW_VALUES.map((status) => (
          <SelectItem
            key={status}
            value={status}
            size={touch ? "touch" : "default"}
          >
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
  touch,
}: {
  tx: SepayBankTransaction;
  expenseOptions: ExpenseMatchOption[];
  canLinkPayments: boolean;
  touch: boolean;
}) {
  const state = classifySepayReconciliationState(tx);

  if (state === "matched" && tx.paymentId != null) return null;

  if (tx.transferType === "in" && state !== "matched") {
    return (
      <LinkPaymentCell
        tx={tx}
        canLinkPayments={canLinkPayments}
        touch={touch}
      />
    );
  }

  return <MatchCell tx={tx} expenseOptions={expenseOptions} touch={touch} />;
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
    return state === "needs_review";
  }
  if (filter === "matched") return state === "matched";
  if (filter === "webhook_error") return state === "webhook_error";
  if (filter === "money_in_review") {
    return row.tx.transferType === "in" && state === "needs_review";
  }
  if (filter === "money_out_review") {
    return row.tx.transferType === "out" && state === "needs_review";
  }

  return false;
}

export function BankTransactionsTable({
  params,
  transactions,
  missingBankWebhookPayments,
  expenseOptions,
  canLinkPayments,
}: BankTransactionsTableProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isFilterPending, startFilterTransition] = React.useTransition();
  const isTouchLayout = useIsMobile(1024);
  const controlSize = isTouchLayout ? "touch" : "field";
  const filter = parseBankReconciliationFilter(
    searchParams.get(BANK_RECONCILIATION_FILTER_PARAM),
  );

  function setFilter(next: BankReconciliationFilter) {
    const usp = new URLSearchParams(searchParams.toString());
    if (next === BANK_RECONCILIATION_FILTER_DEFAULT) {
      usp.delete(BANK_RECONCILIATION_FILTER_PARAM);
    } else {
      usp.set(BANK_RECONCILIATION_FILTER_PARAM, next);
    }
    const qs = usp.toString();
    startFilterTransition(() => {
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    });
  }

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
  const openQueueCount = React.useMemo(
    () => rows.filter((row) => rowMatchesFilter(row, "needs_review")).length,
    [rows],
  );
  const hasRows = rows.length > 0;
  const isQueueView = filter === "needs_review";
  const filterOptions = [
    ["all", copy.filters.all],
    ["needs_review", copy.filters.needsReview],
    ["money_in_review", copy.filters.moneyInReview],
    ["money_out_review", copy.filters.moneyOutReview],
    ["missing_webhook", copy.filters.missingWebhook],
    ["matched", copy.filters.matched],
    ["webhook_error", copy.filters.webhookError],
  ] as const;
  const columns: DataTableColumn<BankReconciliationRow>[] = [
    {
      key: "date",
      header: copy.table.date,
      className: "w-28 font-mono tabular-nums",
      render: (row) => <DateCell row={row} />,
    },
    {
      key: "amount",
      header: copy.table.amount,
      className: "w-32 text-right",
      render: (row) =>
        row.kind === "bank" ? (
          <AmountCell tx={row.tx} />
        ) : (
          <PaymentAmountCell payment={row.payment} />
        ),
    },
    {
      key: "content",
      header: copy.table.content,
      className: "min-w-48 whitespace-normal",
      render: (row) => <RowContentCell row={row} />,
    },
    {
      key: "status",
      header: copy.table.status,
      className: "w-36",
      render: (row) =>
        row.kind === "bank" ? (
          <ReconciliationStatusCell tx={row.tx} />
        ) : (
          <MissingWebhookStatusCell payment={row.payment} />
        ),
    },
    {
      key: "action",
      header: copy.table.action,
      className: "w-28",
      render: (row) =>
        row.kind === "bank" ? (
          <ReconciliationActionCell
            tx={row.tx}
            expenseOptions={expenseOptions}
            canLinkPayments={canLinkPayments}
            touch={isTouchLayout}
          />
        ) : (
          <ReviewStatusSelect payment={row.payment} touch={isTouchLayout} />
        ),
    },
  ];

  const table = (
    <DataTable
      columns={columns}
      data={filteredRows}
      getRowKey={(row) =>
        row.kind === "bank"
          ? `bank-${String(
              row.tx.bankTransactionId ?? row.tx.eventId ?? row.tx.requestId,
            )}`
          : `missing-${row.payment.paymentId}`
      }
      rowClassName={(row) =>
        bankRowNeedsHighlight(row) ? "border-l-2 border-l-warning" : undefined
      }
      emptyTitle={
        !hasRows
          ? copy.emptyTitle
          : isQueueView
            ? copy.queueEmptyTitle
            : copy.filteredEmptyTitle
      }
      emptyDescription={
        !hasRows
          ? copy.emptyDescription
          : isQueueView
            ? copy.queueEmptyDescription
            : copy.filteredEmptyDescription
      }
      emptyMode={hasRows ? "no-results" : "no-data"}
      className="[&_table]:table-fixed"
      mobileBreakpoint={1024}
      mobileCardRender={(row) => (
        <Item
          variant="outline"
          className={cn(
            bankRowNeedsHighlight(row) && "border-l-2 border-l-warning",
          )}
        >
          <ItemContent className="min-w-0 gap-3">
            <div className="flex items-start justify-between gap-3">
              <DateCell row={row} />
              {row.kind === "bank" ? (
                <AmountCell tx={row.tx} />
              ) : (
                <PaymentAmountCell payment={row.payment} />
              )}
            </div>
            <RowContentCell row={row} />
            <div className="flex min-w-0 items-center justify-between gap-3">
              {row.kind === "bank" ? (
                <ReconciliationStatusCell tx={row.tx} />
              ) : (
                <MissingWebhookStatusCell payment={row.payment} />
              )}
              {row.kind === "bank" ? (
                <ReconciliationActionCell
                  tx={row.tx}
                  expenseOptions={expenseOptions}
                  canLinkPayments={canLinkPayments}
                  touch={isTouchLayout}
                />
              ) : (
                <ReviewStatusSelect
                  payment={row.payment}
                  touch={isTouchLayout}
                />
              )}
            </div>
          </ItemContent>
        </Item>
      )}
    />
  );

  return (
    <AppListFrame
      toolbar={
        <FilterBar
          variant="inline"
          params={params}
          branches={[]}
          basePath="/finance/bank-transactions"
          hide={["branch", "granularity", "compare"]}
          trailing={
            <>
              <span className="text-xs font-medium text-muted-foreground">
                {copy.filters.label}
              </span>
              <Select
                value={filter}
                disabled={isFilterPending}
                onValueChange={(value) => {
                  if (isBankReconciliationFilter(value)) setFilter(value);
                }}
              >
                <SelectTrigger
                  size={controlSize}
                  className="min-w-36"
                  aria-label={copy.filters.label}
                >
                  <SelectValue placeholder={copy.filters.placeholder} />
                </SelectTrigger>
                <SelectContent>
                  {filterOptions.map(([value, label]) => (
                    <SelectItem
                      key={value}
                      value={value}
                      size={controlSize === "touch" ? "touch" : "default"}
                    >
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Badge
                variant={openQueueCount > 0 ? "warning" : "success"}
                className="font-mono"
              >
                {copy.queueCount(formatCount(openQueueCount))}
              </Badge>
            </>
          }
        />
      }
    >
      {table}
    </AppListFrame>
  );
}
