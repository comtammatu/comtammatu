"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatVND } from "@comtammatu/shared/format";
import { formatVNDateTime } from "@comtammatu/shared/time";
import { Alert, AlertDescription } from "@comtammatu/ui/components/alert";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { confirm } from "@comtammatu/ui/components/confirm-dialog";
import { Input } from "@comtammatu/ui/components/input";
import {
  Item,
  ItemContent,
  ItemFooter,
  ItemHeader,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { Label } from "@comtammatu/ui/components/label";
import { toast } from "@comtammatu/ui/components/sonner";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import { StatusBadge } from "@/components/status-badge";
import { messages } from "@lib/messages";
import type {
  MomoPaymentException,
  MomoPaymentExceptionReviewValue,
} from "../_lib/momo-payment-exception-model";
import { reviewMomoPaymentException } from "../momo-payment-review-actions";

const copy = messages.finance.bankTransactions.momoExceptions;
type MomoExceptionFilter = "active" | "open" | "reviewing" | "refunded" | "all";

interface MomoPaymentExceptionsTableProps {
  exceptions: MomoPaymentException[];
  canReview: boolean;
  loadFailed: boolean;
}

function PaymentReferenceDetails({ row }: { row: MomoPaymentException }) {
  return (
    <dl className="grid gap-1 text-xs text-muted-foreground">
      <div className="flex flex-wrap gap-1">
        <dt>{copy.transactionId}:</dt>
        <dd className="font-mono text-foreground">
          {row.transactionId ?? "—"}
        </dd>
      </div>
      {row.providerRef ? (
        <div className="flex flex-wrap gap-1">
          <dt>{copy.providerReference}:</dt>
          <dd className="font-mono text-foreground">{row.providerRef}</dd>
        </div>
      ) : null}
    </dl>
  );
}

function PaymentCell({ row }: { row: MomoPaymentException }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-sm font-semibold">
          {copy.paymentLabel(row.paymentId)}
        </span>
        <StatusBadge domain="payment" value={row.paymentStatus} />
      </div>
      <div className="text-xs text-muted-foreground">
        {row.orderId == null ? "—" : copy.orderLabel(row.orderId)}
      </div>
      <PaymentReferenceDetails row={row} />
    </div>
  );
}

function EvidenceCell({ row }: { row: MomoPaymentException }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap gap-1">
        {row.reasons.length > 0 ? (
          row.reasons.map((reason) => (
            <Badge key={reason} variant="outline">
              {copy.evidenceLabels[reason]}
            </Badge>
          ))
        ) : (
          <Badge variant="outline">{copy.evidenceLabels.retained}</Badge>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {copy.updatedAt}: {formatVNDateTime(row.updatedAt)}
      </p>
    </div>
  );
}

function ReviewMetadata({ row }: { row: MomoPaymentException }) {
  return (
    <div className="flex flex-col gap-1 text-xs">
      {row.reviewedAt ? (
        <p className="text-muted-foreground">
          {copy.reviewedAt}: {formatVNDateTime(row.reviewedAt)}
        </p>
      ) : null}
      {row.reviewedBy ? (
        <p className="break-all text-muted-foreground">
          {copy.reviewedBy}: {row.reviewedBy}
        </p>
      ) : null}
      {row.resolutionReference ? (
        <p className="text-muted-foreground">
          {copy.resolutionReference}:{" "}
          <span className="font-mono text-foreground">
            {row.resolutionReference}
          </span>
        </p>
      ) : null}
    </div>
  );
}

function ReviewCell({ row }: { row: MomoPaymentException }) {
  return (
    <div className="flex flex-col gap-1.5">
      <StatusBadge domain="momo-payment-review" value={row.reviewStatus} />
      <ReviewMetadata row={row} />
    </div>
  );
}

export function MomoPaymentExceptionsTable({
  exceptions,
  canReview,
  loadFailed,
}: MomoPaymentExceptionsTableProps) {
  const router = useRouter();
  const [filter, setFilter] = useState<MomoExceptionFilter>("active");
  const [refundReferences, setRefundReferences] = useState<
    Record<number, string>
  >({});
  const [pendingPaymentId, setPendingPaymentId] = useState<number | null>(null);
  const [pendingStatus, setPendingStatus] =
    useState<MomoPaymentExceptionReviewValue | null>(null);
  const [isPending, startTransition] = useTransition();

  if (loadFailed) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          <span className="block font-medium">{copy.loadFailedTitle}</span>
          {copy.loadFailedDescription}
        </AlertDescription>
      </Alert>
    );
  }

  const filteredExceptions = exceptions.filter((row) => {
    if (filter === "all") return true;
    if (filter === "active") return row.reviewStatus !== "refunded";
    return row.reviewStatus === filter;
  });

  function markException(
    row: MomoPaymentException,
    status: MomoPaymentExceptionReviewValue,
    resolutionReference: string | null,
  ) {
    if (row.transactionId == null) return;

    setPendingPaymentId(row.paymentId);
    setPendingStatus(status);
    startTransition(async () => {
      try {
        const result = await reviewMomoPaymentException({
          paymentId: row.paymentId,
          expectedTransactionId: row.transactionId ?? "",
          status,
          resolutionReference,
        });

        if (result.success) {
          toast.success(copy.success[status]);
          router.refresh();
        } else {
          toast.error(result.error ?? copy.errors.actionError);
        }
      } catch {
        toast.error(copy.errors.actionError);
      } finally {
        setPendingPaymentId(null);
        setPendingStatus(null);
      }
    });
  }

  async function markRefunded(row: MomoPaymentException) {
    if (row.transactionId == null) return;
    const resolutionReference = (refundReferences[row.paymentId] ?? "").trim();
    if (resolutionReference.length < 3 || resolutionReference.length > 160) {
      toast.error(copy.refundReferenceRequired);
      return;
    }

    const confirmed = await confirm({
      title: copy.confirmRefund.title,
      description: copy.confirmRefund.description,
      details: [
        { label: copy.confirmRefund.amount, value: formatVND(row.amount) },
        {
          label: copy.confirmRefund.transactionId,
          value: row.transactionId,
        },
        { label: copy.confirmRefund.reference, value: resolutionReference },
      ],
      confirmText: copy.confirmRefund.confirmText,
      cancelText: copy.confirmRefund.cancelText,
      variant: "destructive",
    });
    if (!confirmed) return;

    markException(row, "refunded", resolutionReference);
  }

  function renderActionCell(row: MomoPaymentException) {
    if (row.reviewStatus === "refunded") return null;
    if (!canReview) {
      return <p className="text-xs text-muted-foreground">{copy.ownerOnly}</p>;
    }
    if (row.transactionId == null) {
      return (
        <p className="max-w-64 text-xs text-destructive">
          {copy.missingTransactionId}
        </p>
      );
    }

    const rowPending = isPending && pendingPaymentId === row.paymentId;
    const inputId = `momo-refund-reference-${row.paymentId}`;
    return (
      <div className="flex min-w-60 flex-col gap-2">
        {row.reviewStatus === "open" ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={isPending}
            onClick={() => markException(row, "reviewing", null)}
          >
            {rowPending && pendingStatus === "reviewing"
              ? copy.markReviewingPending
              : copy.markReviewing}
          </Button>
        ) : null}
        <div className="flex flex-col gap-1">
          <Label htmlFor={inputId} className="text-xs">
            {copy.refundReferenceLabel}
          </Label>
          <Input
            id={inputId}
            value={refundReferences[row.paymentId] ?? ""}
            maxLength={160}
            placeholder={copy.refundReferencePlaceholder}
            disabled={isPending}
            onChange={(event) =>
              setRefundReferences((current) => ({
                ...current,
                [row.paymentId]: event.target.value,
              }))
            }
          />
          <p className="text-xs text-muted-foreground">
            {copy.refundReferenceHint}
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="destructive"
          disabled={isPending}
          onClick={() => void markRefunded(row)}
        >
          {rowPending && pendingStatus === "refunded"
            ? copy.markRefundedPending
            : copy.markRefunded}
        </Button>
      </div>
    );
  }

  const columns: DataTableColumn<MomoPaymentException>[] = [
    {
      key: "payment",
      header: copy.table.payment,
      render: (row) => <PaymentCell row={row} />,
    },
    {
      key: "amount",
      header: copy.table.amount,
      className: "text-right",
      render: (row) => (
        <span className="font-mono font-semibold tabular-nums">
          {formatVND(row.amount)}
        </span>
      ),
    },
    {
      key: "evidence",
      header: copy.table.evidence,
      render: (row) => <EvidenceCell row={row} />,
    },
    {
      key: "status",
      header: copy.table.status,
      render: (row) => <ReviewCell row={row} />,
    },
    {
      key: "action",
      header: copy.table.action,
      render: (row) => renderActionCell(row),
    },
  ];

  const filterOptions: Array<[MomoExceptionFilter, string]> = [
    ["active", copy.filters.active],
    ["open", copy.filters.open],
    ["reviewing", copy.filters.reviewing],
    ["refunded", copy.filters.refunded],
    ["all", copy.filters.all],
  ];
  const hasAnyRows = exceptions.length > 0;
  const emptyTitle =
    filter === "active"
      ? copy.emptyActiveTitle
      : filter === "all" && !hasAnyRows
        ? copy.emptyAllTitle
        : copy.filteredEmptyTitle;
  const emptyDescription =
    filter === "active"
      ? copy.emptyActiveDescription
      : filter === "all" && !hasAnyRows
        ? copy.emptyAllDescription
        : copy.filteredEmptyDescription;

  return (
    <DataTable
      columns={columns}
      data={filteredExceptions}
      getRowKey={(row) => row.paymentId}
      actions={
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          {filterOptions.map(([value, label]) => (
            <Button
              key={value}
              type="button"
              variant={filter === value ? "default" : "outline"}
              size="sm"
              className="h-8 px-3 text-xs"
              onClick={() => setFilter(value)}
            >
              {label}
            </Button>
          ))}
          <Badge variant="secondary" className="font-mono">
            {copy.visibleRows(filteredExceptions.length, exceptions.length)}
          </Badge>
        </div>
      }
      emptyTitle={emptyTitle}
      emptyDescription={emptyDescription}
      emptyMode={hasAnyRows ? "no-results" : "no-data"}
      mobileCardRender={(row) => (
        <Item variant="outline">
          <ItemHeader>
            <ItemTitle>{copy.paymentLabel(row.paymentId)}</ItemTitle>
            <StatusBadge
              domain="momo-payment-review"
              value={row.reviewStatus}
            />
          </ItemHeader>
          <ItemContent className="gap-3">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>
                {row.orderId == null ? "—" : copy.orderLabel(row.orderId)}
              </span>
              <StatusBadge domain="payment" value={row.paymentStatus} />
            </div>
            <PaymentReferenceDetails row={row} />
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-xs text-muted-foreground">
                {copy.table.amount}
              </span>
              <span className="font-mono font-semibold tabular-nums">
                {formatVND(row.amount)}
              </span>
            </div>
            <EvidenceCell row={row} />
            <ReviewMetadata row={row} />
          </ItemContent>
          {row.reviewStatus !== "refunded" ? (
            <ItemFooter className="items-start">
              {renderActionCell(row)}
            </ItemFooter>
          ) : null}
        </Item>
      )}
    />
  );
}
