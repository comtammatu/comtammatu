"use client";

/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: baseline inline Vietnamese copy in finance invoice list */

import { useMemo, useState, useTransition } from "react";
import { z } from "zod";
import {
  ArrowRightLeft as IconSwap,
  Download as IconDownload,
  FileEdit as IconFileEdit,
  FileX as IconFileX,
  Receipt as IconReceipt,
  RefreshCw as IconRefreshCw,
  Undo2 as IconUndo,
} from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { Label } from "@comtammatu/ui/components/label";
import { confirm } from "@comtammatu/ui/components/confirm-dialog";
import { ReasonConfirmDialog } from "@comtammatu/ui/components/reason-confirm-dialog";
import { toast } from "@comtammatu/ui/components/sonner";
import { formatVND } from "@comtammatu/shared/format";
import { PAYMENT_METHOD_LABELS_VI } from "@comtammatu/shared/labels";
import type { PaymentMethod } from "@comtammatu/shared/providers";
import {
  cancelTaxInvoice,
  createTaxInvoice,
  fetchTaxInvoicesPage,
  reissueAllDraftInvoices,
} from "./actions";
import type { TaxInvoiceCursor } from "./actions";
import { forceResyncTaxInvoice } from "./reconcile-invoice-actions";
import { getArchiveDownloadUrl } from "./archive-actions";
import { replaceTaxInvoice } from "./replace-invoice-actions";
import { refundOrderPayment } from "./refund-actions";
import { correctPaymentMethod } from "./payment-method-actions";
import { ManualIssueInvoiceDialog } from "./manual-issue-invoice-dialog";
import type { InvoiceRow } from "./_lib/finance-types";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import { FormDialog, TextareaField, TextField } from "@/components/form";
import {
  Item,
  ItemContent,
  ItemFooter,
  ItemHeader,
} from "@comtammatu/ui/components/item";
import { DescriptionList } from "@/components/surface";
import { formatVNDateTime, getVNDateString } from "@/_lib/format-datetime";

import {
  FINANCE_VI,
  FORM_VI,
  ORDER_VI,
  POS_VI,
  VALIDATION_VI,
} from "@comtammatu/shared/messages";
import type { ActionResult } from "@comtammatu/shared/types";
import { messages } from "@lib/messages";
import { StatusBadge } from "@/components/status-badge";

function isResyncable(status: string): boolean {
  return status === "signing" || status === "submitted";
}

function formatDate(iso: string): string {
  return formatVNDateTime(iso);
}

interface InvoiceListProps {
  initialInvoices: InvoiceRow[];
  initialHasMore?: boolean;
  initialNextCursor?: TaxInvoiceCursor | null;
  branchId?: number;
  queue?: "attention";
  canManageInvoices: boolean;
  canIssueInvoices?: boolean;
  branches?: { id: number; name: string }[];
}

const CANCEL_REASON_MIN = 20;
const CANCEL_REASON_MAX = 500;
const REFUND_REASON_MIN = 5;
const REFUND_REASON_MAX = 500;
const METHOD_OPTIONS: PaymentMethod[] = ["cash", "vietqr", "momo"];
const REPLACE_REASON_MIN = 20;
const REPLACE_REASON_MAX = 255;
const REPLACE_AGREEMENT_MAX = 225;
const MST_REGEX = /^\d{10}(-\d{3})?$/;

const replaceInvoiceSchema = z
  .object({
    reason: z
      .string()
      .trim()
      .min(REPLACE_REASON_MIN, {
        error: `Lý do thay thế tối thiểu ${REPLACE_REASON_MIN} ký tự`,
      })
      .max(REPLACE_REASON_MAX, {
        error: `Lý do thay thế tối đa ${REPLACE_REASON_MAX} ký tự`,
      }),
    agreementRef: z
      .string()
      .trim()
      .min(1, { error: VALIDATION_VI.required(FINANCE_VI.agreementDocLabel) })
      .max(REPLACE_AGREEMENT_MAX, {
        error: `Văn bản thỏa thuận tối đa ${REPLACE_AGREEMENT_MAX} ký tự`,
      }),
    agreementDate: z
      .string()
      .min(1, { error: VALIDATION_VI.required(FINANCE_VI.agreementDateLabel) }),
    buyerName: z.string().trim().max(200, {
      error: "Tên người mua tối đa 200 ký tự",
    }),
    buyerTaxCode: z
      .string()
      .trim()
      .refine((value) => value.length === 0 || MST_REGEX.test(value), {
        error: FINANCE_VI.taxCodeFormatError,
      }),
    buyerAddress: z.string().trim().max(500, {
      error: "Địa chỉ tối đa 500 ký tự",
    }),
  })
  .refine((values) => !values.buyerTaxCode || values.buyerName.length > 0, {
    path: ["buyerName"],
    error: "Tên người mua không được để trống khi có MST",
  });

type ReplaceInvoiceFormValues = z.infer<typeof replaceInvoiceSchema>;

type ReplaceInvoiceResultData = {
  new_id?: number;
  new_invoice_number?: string | null;
  new_status?: string;
} | null;

function todayISODate(): string {
  return getVNDateString();
}

export function InvoiceList({
  initialInvoices,
  initialHasMore = false,
  initialNextCursor = null,
  branchId,
  queue,
  canManageInvoices,
  canIssueInvoices = false,
  branches = [],
}: InvoiceListProps) {
  const [invoices, setInvoices] = useState(initialInvoices);
  const [manualIssueOpen, setManualIssueOpen] = useState(false);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [nextCursor, setNextCursor] = useState<TaxInvoiceCursor | null>(
    initialNextCursor,
  );
  const [loadingMore, setLoadingMore] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<InvoiceRow | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [refundTarget, setRefundTarget] = useState<InvoiceRow | null>(null);
  const [refundReason, setRefundReason] = useState("");
  const [methodFixTarget, setMethodFixTarget] = useState<InvoiceRow | null>(
    null,
  );
  const [methodFixMethod, setMethodFixMethod] = useState<PaymentMethod | null>(
    null,
  );
  const [methodFixReason, setMethodFixReason] = useState("");
  const [isPending, startTransition] = useTransition();
  const [resyncingId, setResyncingId] = useState<number | null>(null);
  const [reissuingId, setReissuingId] = useState<number | null>(null);
  const [replaceTarget, setReplaceTarget] = useState<InvoiceRow | null>(null);
  const replaceDefaultValues = useMemo<ReplaceInvoiceFormValues>(
    () => ({
      reason: "",
      agreementRef: "",
      agreementDate: todayISODate(),
      buyerName: replaceTarget?.buyer_name ?? "",
      buyerTaxCode: replaceTarget?.buyer_tax_code ?? "",
      buyerAddress: "",
    }),
    [replaceTarget],
  );

  function openReplaceDialog(inv: InvoiceRow) {
    setReplaceTarget(inv);
  }

  function resetReplaceDialog() {
    setReplaceTarget(null);
  }

  async function handleReplace(
    values: ReplaceInvoiceFormValues,
  ): Promise<ActionResult> {
    if (!replaceTarget) {
      return { success: false, error: FINANCE_VI.replaceFailed };
    }
    const oldId = replaceTarget.id;

    const result = await replaceTaxInvoice({
      originalId: oldId,
      reason: values.reason,
      agreementRef: values.agreementRef,
      agreementDate: values.agreementDate,
      buyerName: values.buyerName || undefined,
      buyerTaxCode: values.buyerTaxCode || undefined,
      buyerAddress: values.buyerAddress || undefined,
    });

    if (result.success) {
      setInvoices((prev) =>
        prev.map((inv) =>
          inv.id === oldId ? { ...inv, status: "replaced" } : inv,
        ),
      );
    }

    return result;
  }

  function handleReplaceSuccess(result: ActionResult) {
    const data = result.data as ReplaceInvoiceResultData;
    toast.success(
      `Đã tạo HĐ thay thế ${data?.new_invoice_number ?? `#${data?.new_id ?? "?"}`}`,
    );
  }

  const trimmedReason = cancelReason.trim();
  const reasonValid =
    trimmedReason.length >= CANCEL_REASON_MIN &&
    trimmedReason.length <= CANCEL_REASON_MAX;

  function resetCancelDialog() {
    setCancelTarget(null);
    setCancelReason("");
  }

  function handleCancel() {
    if (!cancelTarget || !reasonValid) return;
    const id = cancelTarget.id;
    const reason = trimmedReason;
    startTransition(async () => {
      const result = await cancelTaxInvoice(id, reason);
      if (!result.success) {
        toast.error(result.error ?? FINANCE_VI.cancelFailed);
        return;
      }
      toast.success(FINANCE_VI.cancelled);
      setInvoices((prev) =>
        prev.map((inv) =>
          inv.id === id ? { ...inv, status: "cancelled" } : inv,
        ),
      );
      resetCancelDialog();
    });
  }

  const trimmedRefundReason = refundReason.trim();
  const refundReasonValid =
    trimmedRefundReason.length >= REFUND_REASON_MIN &&
    trimmedRefundReason.length <= REFUND_REASON_MAX;

  function resetRefundDialog() {
    setRefundTarget(null);
    setRefundReason("");
  }

  function handleRefund() {
    if (!refundTarget || !refundReasonValid) return;
    const orderId = refundTarget.order_id;
    if (!orderId) {
      toast.error(messages.finance.invoiceList.refundFailed);
      return;
    }
    startTransition(async () => {
      const result = await refundOrderPayment({
        orderId,
        reason: trimmedRefundReason,
      });
      if (!result.success) {
        toast.error(result.error ?? messages.finance.invoiceList.refundFailed);
        return;
      }
      toast.success(messages.finance.invoiceList.refundSuccess);
      resetRefundDialog();
    });
  }

  const trimmedMethodFixReason = methodFixReason.trim();
  const methodFixValid =
    methodFixMethod !== null &&
    trimmedMethodFixReason.length >= REFUND_REASON_MIN &&
    trimmedMethodFixReason.length <= REFUND_REASON_MAX;

  function resetMethodFixDialog() {
    setMethodFixTarget(null);
    setMethodFixMethod(null);
    setMethodFixReason("");
  }

  function handleMethodFix() {
    if (!methodFixTarget || !methodFixMethod || !methodFixValid) return;
    const orderId = methodFixTarget.order_id;
    if (!orderId) {
      toast.error(messages.finance.invoiceList.methodFixFailed);
      return;
    }
    const newMethod = methodFixMethod;
    startTransition(async () => {
      const result = await correctPaymentMethod({
        orderId,
        newMethod,
        reason: trimmedMethodFixReason,
      });
      if (!result.success) {
        toast.error(
          result.error ?? messages.finance.invoiceList.methodFixFailed,
        );
        return;
      }
      toast.success(messages.finance.invoiceList.methodFixSuccess);
      resetMethodFixDialog();
    });
  }

  function handleDownload(inv: InvoiceRow, kind: "pdf" | "xml") {
    startTransition(async () => {
      const result = await getArchiveDownloadUrl(inv.id, kind);
      if (!result.success) {
        toast.error(result.error ?? `Không tải được ${kind.toUpperCase()}`);
        return;
      }
      const url = (result.data as { url?: string } | null)?.url;
      if (!url) {
        toast.error(FINANCE_VI.invalidDownloadLink);
        return;
      }
      // Open signed URL in a new tab — TTL 5 min, browser handles
      // the actual download via Content-Disposition.
      window.open(url, "_blank", "noopener,noreferrer");
    });
  }

  function handleResync(inv: InvoiceRow) {
    setResyncingId(inv.id);
    startTransition(async () => {
      try {
        const result = await forceResyncTaxInvoice(inv.id);
        if (!result.success) {
          toast.error(result.error ?? FINANCE_VI.syncFailed);
          return;
        }
        const outcome =
          (result.data as { outcome?: string } | null)?.outcome ?? "no_change";
        if (outcome === "transition") {
          toast.success(FINANCE_VI.syncedStatusUpdated);
        } else if (outcome === "no_change") {
          toast.info(FINANCE_VI.syncNoUpdate);
        } else if (outcome === "race_lost") {
          toast.warning(FINANCE_VI.syncStatusChangedReload);
        } else if (outcome === "giveup_24h") {
          toast.warning(FINANCE_VI.syncExpiredCancelled);
        } else {
          toast.error(`Đồng bộ thất bại: ${outcome}`);
        }
      } finally {
        setResyncingId(null);
      }
    });
  }

  // Drafts are provider-rejected issuances; the server-side retry path
  // (`createTaxInvoice` reusing the existing draft row) predates this
  // button — the UI was the missing link, not the backend.
  function handleReissue(inv: InvoiceRow) {
    const orderId = inv.order_id;
    if (orderId === null) {
      toast.error(messages.finance.invoiceList.reissueNoOrder);
      return;
    }
    setReissuingId(inv.id);
    startTransition(async () => {
      try {
        const result = await createTaxInvoice({
          orderId,
          buyerName: inv.buyer_name ?? undefined,
          buyerTaxCode: inv.buyer_tax_code ?? undefined,
        });
        if (!result.success) {
          toast.error(result.error ?? messages.finance.invoiceList.reissueFailed);
          return;
        }
        const issued = result.data as {
          invoice_number?: string | null;
          status?: string;
        } | null;
        toast.success(messages.finance.invoiceList.reissueSuccess);
        setInvoices((prev) =>
          prev.map((row) =>
            row.id === inv.id
              ? {
                  ...row,
                  status: issued?.status ?? row.status,
                  invoice_number:
                    issued?.invoice_number ?? row.invoice_number,
                }
              : row,
          ),
        );
      } finally {
        setReissuingId(null);
      }
    });
  }

  const draftCount = invoices.filter((inv) => inv.status === "draft").length;

  function handleLoadMore() {
    if (loadingMore || !hasMore || !nextCursor) return;
    setLoadingMore(true);
    startTransition(async () => {
      try {
        const result = await fetchTaxInvoicesPage({
          branchId,
          before: nextCursor,
          queue,
        });
        if (!result.success || !result.data) {
          toast.error(
            result.error ?? messages.finance.invoiceList.loadMoreFailed,
          );
          return;
        }
        const { items, hasMore: more, nextCursor: cursor } = result.data;
        setInvoices((prev) => {
          const seen = new Set(prev.map((row) => row.id));
          const next = (items as InvoiceRow[]).filter(
            (row) => !seen.has(row.id),
          );
          return [...prev, ...next];
        });
        setHasMore(more);
        setNextCursor(cursor);
      } finally {
        setLoadingMore(false);
      }
    });
  }

  function handleReissueAll() {
    startTransition(async () => {
      try {
        const result = await reissueAllDraftInvoices();
        if (!result.success) {
          toast.error(messages.finance.invoiceList.reissueAllError);
          return;
        }
        const d = result.data as {
          issued?: number;
          failed?: number;
          remaining?: number;
        } | null;
        toast.success(
          messages.finance.invoiceList.reissueAllResult(
            d?.issued ?? 0,
            d?.failed ?? 0,
            d?.remaining ?? 0,
          ),
        );
        // Statuses changed server-side; reload to reflect the fresh list.
        setTimeout(() => window.location.reload(), 1500);
      } catch {
        toast.error(messages.finance.invoiceList.reissueAllError);
      }
    });
  }

  async function handleConfirmReissueAll() {
    const ok = await confirm({
      title: messages.finance.invoiceList.reissueAllTitle,
      description: messages.finance.invoiceList.reissueAllDescription(draftCount),
      cancelText: messages.finance.invoiceList.reissueAllCancel,
      confirmText: messages.finance.invoiceList.reissueAllConfirm,
    });
    if (!ok) return;
    handleReissueAll();
  }

  function renderActions(inv: InvoiceRow, variant: "card" | "table") {
    const dense = variant === "table";
    const size = dense ? "icon" : "sm";
    return (
      <div
        className={
          dense
            ? "flex items-center justify-end gap-1"
            : "flex items-center gap-2"
        }
      >
        {inv.archived_at ? (
          <>
            <Button
              variant="ghost"
              size={size}
              onClick={() => handleDownload(inv, "pdf")}
              disabled={isPending}
              title={FINANCE_VI.downloadPdf}
            >
              <IconDownload className="size-4" />
              {dense ? <span className="sr-only">{FINANCE_VI.downloadPdf}</span> : "PDF"}
            </Button>
            <Button
              variant="ghost"
              size={size}
              onClick={() => handleDownload(inv, "xml")}
              disabled={isPending}
              title={FINANCE_VI.downloadXml}
            >
              <IconDownload className="size-4" />
              {dense ? <span className="sr-only">{FINANCE_VI.downloadXml}</span> : "XML"}
            </Button>
          </>
        ) : null}
        {canManageInvoices && inv.status === "draft" ? (
          <Button
            variant="ghost"
            size={size}
            onClick={() => handleReissue(inv)}
            disabled={isPending && reissuingId === inv.id}
            title={messages.finance.invoiceList.reissueTitle}
          >
            <IconRefreshCw className="size-4" />
            {dense ? (
              <span className="sr-only">
                {messages.finance.invoiceList.reissue}
              </span>
            ) : (
              messages.finance.invoiceList.reissue
            )}
          </Button>
        ) : null}
        {canManageInvoices && isResyncable(inv.status) ? (
          <Button
            variant="ghost"
            size={size}
            onClick={() => handleResync(inv)}
            disabled={isPending && resyncingId === inv.id}
            title={FINANCE_VI.resyncWithProvider}
          >
            {isPending && resyncingId === inv.id ? (
              <Spinner className="size-4" />
            ) : (
              <IconRefreshCw className="size-4" />
            )}
            {dense ? <span className="sr-only">{FINANCE_VI.resync}</span> : FINANCE_VI.sync}
          </Button>
        ) : null}
        {canManageInvoices && inv.status === "issued" ? (
          <>
            <Button
              variant="ghost"
              size={size}
              onClick={() => openReplaceDialog(inv)}
              title={FINANCE_VI.replaceInvoice}
            >
              <IconFileEdit className="size-4" />
              {dense ? (
                <span className="sr-only">{FINANCE_VI.replaceInvoice}</span>
              ) : (
                FINANCE_VI.replace
              )}
            </Button>
            <Button
              variant="ghost"
              size={size}
              onClick={() => setRefundTarget(inv)}
              title={messages.finance.invoiceList.refundTitle}
            >
              <IconUndo className="size-4" />
              {dense ? (
                <span className="sr-only">
                  {messages.finance.invoiceList.refund}
                </span>
              ) : (
                messages.finance.invoiceList.refund
              )}
            </Button>
            <Button
              variant="ghost"
              size={size}
              onClick={() => setMethodFixTarget(inv)}
              title={messages.finance.invoiceList.methodFixDialogTitle}
            >
              <IconSwap className="size-4" />
              {dense ? (
                <span className="sr-only">
                  {messages.finance.invoiceList.methodFix}
                </span>
              ) : (
                messages.finance.invoiceList.methodFix
              )}
            </Button>
            <Button
              variant="ghost"
              size={size}
              className="text-destructive hover:text-destructive"
              onClick={() => setCancelTarget(inv)}
              title={FINANCE_VI.cancelInvoice}
            >
              <IconFileX className="size-4" />
              {dense ? (
                <span className="sr-only">{FINANCE_VI.cancelInvoice}</span>
              ) : (
                FINANCE_VI.cancelInvoice
              )}
            </Button>
          </>
        ) : null}
      </div>
    );
  }

  const columns: DataTableColumn<InvoiceRow>[] = [
    {
      key: "invoice_number",
      header: FINANCE_VI.invoiceNumberCol,
      className: "font-mono text-sm",
      render: (inv) => inv.invoice_number ?? "—",
    },
    {
      key: "order",
      header: ORDER_VI.long,
      className: "text-sm text-muted-foreground",
      render: (inv) => inv.orders?.order_number ?? `#${inv.id}`,
    },
    {
      key: "buyer",
      header: FINANCE_VI.buyer,
      render: (inv) =>
        inv.buyer_name ? (
          <div>
            <p className="text-sm">{inv.buyer_name}</p>
            {inv.buyer_tax_code && (
              <p className="text-xs text-muted-foreground">
                MST: {inv.buyer_tax_code}
              </p>
            )}
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: "total",
      header: FORM_VI.value,
      className: "text-right",
      render: (inv) => (
        <span className="font-mono text-sm tabular-nums">
          {formatVND(inv.total_amount)}
        </span>
      ),
    },
    {
      key: "status",
      header: FORM_VI.status,
      render: (inv) => <StatusBadge domain="tax-invoice" value={inv.status} />,
    },
    {
      key: "time",
      header: FINANCE_VI.timeCol,
      className: "text-sm text-muted-foreground",
      render: (inv) => formatDate(inv.issued_at ?? inv.created_at),
    },
    {
      key: "actions",
      header: "",
      className: "w-16",
      render: (inv) => renderActions(inv, "table"),
    },
  ];

  return (
    <>
      <div className="flex flex-col gap-4">
        {canIssueInvoices || (canManageInvoices && draftCount > 0) ? (
          <div className="flex flex-wrap justify-end gap-2">
            {canIssueInvoices ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setManualIssueOpen(true)}
                disabled={isPending}
              >
                <IconReceipt className="size-4" />
                {messages.finance.invoiceList.manualIssue.button}
              </Button>
            ) : null}
            {canManageInvoices && draftCount > 0 ? (
              <Button
                variant="outline"
                size="sm"
                onClick={handleConfirmReissueAll}
                disabled={isPending}
              >
                <IconRefreshCw className="size-4" />
                {messages.finance.invoiceList.reissueAll(draftCount)}
              </Button>
            ) : null}
          </div>
        ) : null}
        <DataTable
          columns={columns}
          data={invoices}
          getRowKey={(inv) => inv.id}
          emptyTitle={FINANCE_VI.emptyNoInvoices}
          emptyIcon={<IconReceipt />}
          mobileCardRender={(inv) => (
            <Item variant="outline" className="flex-col items-stretch">
              <ItemHeader className="items-start">
                <div>
                  <p className="font-mono text-sm">
                    {inv.invoice_number ?? "—"}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {inv.orders?.order_number ?? `#${inv.id}`}
                  </p>
                </div>
                <StatusBadge domain="tax-invoice" value={inv.status} />
              </ItemHeader>
              <ItemContent className="mt-4">
                <DescriptionList
                  items={[
                    {
                      term: FINANCE_VI.buyer,
                      description: (
                        <>
                          <div>{inv.buyer_name ?? "—"}</div>
                          {inv.buyer_tax_code ? (
                            <div className="text-2xs text-muted-foreground font-mono mt-0.5">
                              MST: {inv.buyer_tax_code}
                            </div>
                          ) : null}
                        </>
                      ),
                    },
                    {
                      term: FORM_VI.value,
                      description: (
                        <span className="font-mono font-semibold">
                          {formatVND(inv.total_amount)}
                        </span>
                      ),
                    },
                  ]}
                />
              </ItemContent>
              <ItemFooter className="mt-4">
                <p className="text-xs text-muted-foreground">
                  {formatDate(inv.issued_at ?? inv.created_at)}
                </p>
                {renderActions(inv, "card")}
              </ItemFooter>
            </Item>
          )}
        />
        {hasMore ? (
          <div className="flex justify-center">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleLoadMore}
              disabled={loadingMore}
            >
              {loadingMore ? (
                <Spinner className="size-4" />
              ) : null}
              {messages.finance.invoiceList.loadMore}
            </Button>
          </div>
        ) : null}
      </div>

      <ReasonConfirmDialog
        open={!!cancelTarget}
        onOpenChange={(open) => !open && resetCancelDialog()}
        title={FINANCE_VI.cancelConfirmTitle}
        description={
          <>
            Hủy hóa đơn{" "}
            <strong>
              {cancelTarget?.invoice_number ?? `#${cancelTarget?.id}`}
            </strong>
            ? {FINANCE_VI.cancelIrreversibleHint}
          </>
        }
        reasonId="invoice-cancel-reason"
        reason={cancelReason}
        onReasonChange={setCancelReason}
        reasonLabel={`Lý do hủy (tối thiểu ${CANCEL_REASON_MIN} ký tự)`}
        reasonPlaceholder={FINANCE_VI.cancelReasonPlaceholder}
        reasonMinLength={CANCEL_REASON_MIN}
        reasonTextareaProps={{
          rows: 3,
          maxLength: CANCEL_REASON_MAX,
          disabled: isPending,
        }}
        cancelLabel="Không"
        cancelDisabled={isPending}
        confirmLabel={FINANCE_VI.cancelInvoice}
        confirmVariant="destructive"
        canConfirm={reasonValid}
        isPending={isPending}
        onConfirm={handleCancel}
      >
        <div className="flex items-center justify-between gap-3 text-xs">
          <Label htmlFor="invoice-cancel-reason">
            Lý do hủy (tối thiểu {CANCEL_REASON_MIN} ký tự)
          </Label>
          <span className="text-muted-foreground">
            {trimmedReason.length}/{CANCEL_REASON_MAX}
          </span>
        </div>
      </ReasonConfirmDialog>

      <ReasonConfirmDialog
        open={!!refundTarget}
        onOpenChange={(open) => !open && resetRefundDialog()}
        title={messages.finance.invoiceList.refundDialogTitle}
        description={messages.finance.invoiceList.refundWarning}
        reasonId="invoice-refund-reason"
        reason={refundReason}
        onReasonChange={setRefundReason}
        reasonLabel={messages.finance.invoiceList.refundReasonLabel(
          REFUND_REASON_MIN,
        )}
        reasonPlaceholder={messages.finance.invoiceList.refundReasonPlaceholder}
        reasonMinLength={REFUND_REASON_MIN}
        reasonTextareaProps={{
          rows: 3,
          maxLength: REFUND_REASON_MAX,
          disabled: isPending,
        }}
        cancelLabel={messages.finance.invoiceList.refundCancel}
        cancelDisabled={isPending}
        confirmLabel={messages.finance.invoiceList.refundConfirm}
        confirmVariant="destructive"
        canConfirm={refundReasonValid}
        isPending={isPending}
        onConfirm={handleRefund}
      >
        <div className="flex items-center justify-between gap-3 text-xs">
          <Label htmlFor="invoice-refund-reason">
            {messages.finance.invoiceList.refundReasonLabel(REFUND_REASON_MIN)}
          </Label>
          <span className="text-muted-foreground">
            {trimmedRefundReason.length}/{REFUND_REASON_MAX}
          </span>
        </div>
      </ReasonConfirmDialog>

      <ReasonConfirmDialog
        open={!!methodFixTarget}
        onOpenChange={(open) => !open && resetMethodFixDialog()}
        title={messages.finance.invoiceList.methodFixDialogTitle}
        description={messages.finance.invoiceList.methodFixWarning}
        reasonId="invoice-methodfix-reason"
        reason={methodFixReason}
        onReasonChange={setMethodFixReason}
        reasonLabel={messages.finance.invoiceList.methodFixReasonLabel(
          REFUND_REASON_MIN,
        )}
        reasonPlaceholder={
          messages.finance.invoiceList.methodFixReasonPlaceholder
        }
        reasonMinLength={REFUND_REASON_MIN}
        reasonTextareaProps={{
          rows: 3,
          maxLength: REFUND_REASON_MAX,
          disabled: isPending,
        }}
        cancelLabel={messages.finance.invoiceList.methodFixCancel}
        cancelDisabled={isPending}
        confirmLabel={messages.finance.invoiceList.methodFixConfirm}
        canConfirm={methodFixValid}
        isPending={isPending}
        onConfirm={handleMethodFix}
      >
        <div className="grid gap-3">
          <div className="grid gap-2">
            <Label>{messages.finance.invoiceList.methodFixNewLabel}</Label>
            <div className="flex gap-2">
              {METHOD_OPTIONS.map((m) => (
                <Button
                  key={m}
                  type="button"
                  variant={methodFixMethod === m ? "default" : "outline"}
                  size="sm"
                  onClick={() => setMethodFixMethod(m)}
                  disabled={isPending}
                >
                  {PAYMENT_METHOD_LABELS_VI[m]}
                </Button>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between gap-3 text-xs">
            <Label htmlFor="invoice-methodfix-reason">
              {messages.finance.invoiceList.methodFixReasonLabel(
                REFUND_REASON_MIN,
              )}
            </Label>
            <span className="text-muted-foreground">
              {trimmedMethodFixReason.length}/{REFUND_REASON_MAX}
            </span>
          </div>
        </div>
      </ReasonConfirmDialog>

      <FormDialog
        open={!!replaceTarget}
        onOpenChange={(open) => {
          if (!open) resetReplaceDialog();
        }}
        title={FINANCE_VI.replaceConfirmTitle}
        description={`Tạo HĐ thay thế cho ${
          replaceTarget?.invoice_number ?? `#${replaceTarget?.id}`
        }. HĐ gốc sẽ chuyển sang trạng thái "Đã thay thế". Cần văn bản thỏa thuận với người mua theo TT78 §7.`}
        schema={replaceInvoiceSchema}
        defaultValues={replaceDefaultValues}
        entityKey={replaceTarget?.id ?? "replace-invoice"}
        onSubmit={handleReplace}
        onSuccess={handleReplaceSuccess}
        submitLabel={FINANCE_VI.createReplacementInvoice}
        cancelLabel="Không"
        contentClassName="max-w-lg"
      >
        {(form) => {
          const reasonLength = form.watch("reason").trim().length;

          return (
            <>
              <TextareaField
                control={form.control}
                name="reason"
                id="replace-reason"
                label={`Lý do thay thế (tối thiểu ${REPLACE_REASON_MIN} ký tự)`}
                placeholder={FINANCE_VI.replaceReasonPlaceholder}
                description={`${reasonLength}/${REPLACE_REASON_MAX}`}
                rows={3}
                maxLength={REPLACE_REASON_MAX}
                required
              />
              <div className="grid gap-2 md:grid-cols-2">
                <TextField
                  control={form.control}
                  name="agreementRef"
                  id="replace-agreement-ref"
                  label={FINANCE_VI.agreementDocLabel}
                  placeholder={FINANCE_VI.agreementDocPlaceholder}
                  maxLength={REPLACE_AGREEMENT_MAX}
                  required
                />
                <TextField
                  control={form.control}
                  name="agreementDate"
                  id="replace-agreement-date"
                  label={FINANCE_VI.agreementDateLabel}
                  type="date"
                  max={todayISODate()}
                  required
                />
              </div>
              <TextField
                control={form.control}
                name="buyerName"
                id="replace-buyer-name"
                label={FINANCE_VI.buyerNameLabel}
                maxLength={200}
              />
              <div className="grid gap-2 md:grid-cols-2">
                <TextField
                  control={form.control}
                  name="buyerTaxCode"
                  id="replace-buyer-mst"
                  label={FINANCE_VI.buyerTaxCodeLabel}
                  placeholder={FINANCE_VI.buyerTaxCodePlaceholder}
                />
                <TextField
                  control={form.control}
                  name="buyerAddress"
                  id="replace-buyer-address"
                  label={POS_VI.addressLabel}
                  maxLength={500}
                />
              </div>
            </>
          );
        }}
      </FormDialog>

      {canIssueInvoices ? (
        <ManualIssueInvoiceDialog
          open={manualIssueOpen}
          onOpenChange={setManualIssueOpen}
          branches={branches}
          defaultBranchId={branchId}
          onIssued={() => setTimeout(() => window.location.reload(), 1200)}
        />
      ) : null}
    </>
  );
}
