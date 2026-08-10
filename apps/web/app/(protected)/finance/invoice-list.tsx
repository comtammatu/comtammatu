"use client";

/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: baseline inline Vietnamese copy in finance invoice list */

import { useMemo, useState, useTransition } from "react";
import { z } from "zod";
import {
  ArrowRightLeft as IconSwap,
  BadgeCheck as IconReconcile,
  FileEdit as IconFileEdit,
  FileX as IconFileX,
  Receipt as IconReceipt,
} from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { Label } from "@comtammatu/ui/components/label";
import { ReasonConfirmDialog } from "@/components/reason-confirm-dialog";
import { toast } from "@comtammatu/ui/components/sonner";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@comtammatu/ui/components/toggle-group";
import { useIsMobile } from "@comtammatu/ui/hooks/use-mobile";

import { formatAccountingVND as formatVND } from "@comtammatu/shared/format";

import {
  PAYMENT_METHOD_LABELS_VI,
  getPaymentMethodLabelVi,
  sanitizeViettelInvoiceError,
} from "@comtammatu/shared/labels";

import {
  cancelTaxInvoice,
  fetchTaxInvoicesPage,
  reconcileTaxInvoiceProviderIssued,
  requeueTaxInvoiceIssueJob,
  type TaxInvoiceIssueAttention,
} from "./actions";
import type { TaxInvoiceCursor } from "./actions";
import { replaceTaxInvoice } from "./replace-invoice-actions";
import { correctPaymentMethod } from "./payment-method-actions";
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
import { BUYER_KIND_TOGGLE_ITEM_CLASS } from "@lib/hddt/buyer-kind-ui";
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

function formatDate(iso: string): string {
  return formatVNDateTime(iso);
}

function formatIssueAttentionStatus(
  status: TaxInvoiceIssueAttention["status"],
): string {
  return status === "reconcile_required"
    ? "Chưa xác định trạng thái phát hành trên Viettel"
    : "Phát hành tự động đang bị chặn";
}

interface InvoiceListProps {
  initialInvoices: InvoiceRow[];
  initialHasMore?: boolean;
  initialNextCursor?: TaxInvoiceCursor | null;
  branchId?: number;
  queue?: "attention";
  canManageInvoices: boolean;
  initialIssueAttention?: TaxInvoiceIssueAttention[];
}

const CANCEL_REASON_MIN = 20;
const CANCEL_REASON_MAX = 500;
const REFUND_REASON_MIN = 5;
const REFUND_REASON_MAX = 500;
type CorrectablePaymentMethod = "cash" | "vietqr";

const METHOD_OPTIONS: CorrectablePaymentMethod[] = ["cash", "vietqr"];
const REPLACE_REASON_MIN = 20;
const REPLACE_REASON_MAX = 255;
const REPLACE_AGREEMENT_MAX = 225;
const MST_REGEX = /^\d{10}(-\d{3})?$/;
const reconcileInvoiceSchema = z.object({
  invoiceNumber: z
    .string()
    .trim()
    .min(1, "Nhập số hóa đơn từ Viettel")
    .max(200),
  cqtCode: z.string().trim().max(200),
});
type ReconcileInvoiceValues = z.infer<typeof reconcileInvoiceSchema>;
type ReconcileTarget = {
  key: string;
  taxInvoiceId: number;
  providerRef: string;
  attentionJobId?: number;
};

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
    buyerKind: z.enum(["individual", "business"]),
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
  })
  .refine(
    (values) => {
      const hasBuyer =
        values.buyerName.length > 0 ||
        values.buyerTaxCode.length > 0 ||
        values.buyerAddress.length > 0;
      if (!hasBuyer) return true;
      if (values.buyerKind === "business") {
        return values.buyerTaxCode.length > 0 && values.buyerName.length > 0;
      }
      return values.buyerName.length > 0;
    },
    {
      path: ["buyerName"],
      error: "Thông tin người mua chưa đầy đủ theo loại đã chọn",
    },
  );

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
  initialIssueAttention = [],
}: InvoiceListProps) {
  const isTouchLayout = useIsMobile(1024);
  const [invoices, setInvoices] = useState(initialInvoices);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [nextCursor, setNextCursor] = useState<TaxInvoiceCursor | null>(
    initialNextCursor,
  );
  const [loadingMore, setLoadingMore] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<InvoiceRow | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [methodFixTarget, setMethodFixTarget] = useState<InvoiceRow | null>(
    null,
  );
  const [methodFixMethod, setMethodFixMethod] =
    useState<CorrectablePaymentMethod | null>(null);
  const [methodFixReason, setMethodFixReason] = useState("");
  const [isPending, startTransition] = useTransition();
  const [issueAttention, setIssueAttention] = useState(initialIssueAttention);
  const [reconcileTarget, setReconcileTarget] =
    useState<ReconcileTarget | null>(null);
  const [replaceTarget, setReplaceTarget] = useState<InvoiceRow | null>(null);
  const replaceDefaultValues = useMemo<ReplaceInvoiceFormValues>(
    () => ({
      reason: "",
      agreementRef: "",
      agreementDate: todayISODate(),
      buyerKind: replaceTarget?.buyer_tax_code ? "business" : "individual",
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
      buyerKind: values.buyerKind,
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

  function handleRequeue(job: TaxInvoiceIssueAttention) {
    startTransition(async () => {
      const result = await requeueTaxInvoiceIssueJob(job.id);
      if (!result.success) {
        toast.error(
          result.error ?? "Không thể đưa yêu cầu phát hành HĐĐT vào hàng chờ.",
        );
        return;
      }
      setIssueAttention((current) =>
        current.filter((item) => item.id !== job.id),
      );
      toast.success("Đã đưa HĐĐT vào hàng chờ xử lý.");
    });
  }

  function openReconcileForInvoice(invoice: InvoiceRow) {
    if (!invoice.provider_ref) return;
    setReconcileTarget({
      key: `invoice-${invoice.id}`,
      taxInvoiceId: invoice.id,
      providerRef: invoice.provider_ref,
    });
  }

  function openReconcileForJob(job: TaxInvoiceIssueAttention) {
    if (!job.tax_invoice_id || !job.provider_ref) return;
    setReconcileTarget({
      key: `job-${job.id}`,
      taxInvoiceId: job.tax_invoice_id,
      providerRef: job.provider_ref,
      attentionJobId: job.id,
    });
  }

  async function handleReconcile(
    values: ReconcileInvoiceValues,
  ): Promise<ActionResult> {
    if (!reconcileTarget) {
      return {
        success: false,
        error: "Thiếu mã đối soát của nhà cung cấp dịch vụ.",
      };
    }
    const result = await reconcileTaxInvoiceProviderIssued({
      taxInvoiceId: reconcileTarget.taxInvoiceId,
      providerRef: reconcileTarget.providerRef,
      invoiceNumber: values.invoiceNumber,
      cqtCode: values.cqtCode || undefined,
    });
    if (result.success) {
      if (reconcileTarget.attentionJobId) {
        setIssueAttention((current) =>
          current.filter((item) => item.id !== reconcileTarget.attentionJobId),
        );
      }
      setInvoices((current) =>
        current.map((invoice) =>
          invoice.id === reconcileTarget.taxInvoiceId
            ? {
                ...invoice,
                status: "issued",
                invoice_number: values.invoiceNumber,
              }
            : invoice,
        ),
      );
    }
    return result;
  }

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

  function renderActions(inv: InvoiceRow, variant: "card" | "table") {
    const dense = variant === "table";
    const size = dense ? "icon" : "touch";
    return (
      <div
        className={
          dense
            ? "flex items-center justify-end gap-1"
            : "flex flex-wrap items-center justify-end gap-2"
        }
      >
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
        {canManageInvoices &&
        ["signing", "submitted"].includes(inv.status) &&
        inv.provider_ref ? (
          <Button
            variant="ghost"
            size={size}
            onClick={() => openReconcileForInvoice(inv)}
            title="Đối soát đã phát hành"
          >
            <IconReconcile className="size-4" />
            {dense ? (
              <span className="sr-only">Đối soát đã phát hành</span>
            ) : (
              "Đối soát đã phát hành"
            )}
          </Button>
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
        {issueAttention.length > 0 ? (
          <Item variant="outline" className="flex-col items-stretch gap-3">
            <ItemHeader>
              <ItemContent>
                <p className="font-semibold">HĐĐT cần kiểm tra trên Viettel</p>
                <p className="text-sm text-muted-foreground">
                  Đối chiếu đúng mã đơn, mã HĐĐT và mã giao dịch Viettel. Chỉ
                  ghi số HĐ sau khi xác minh; không phát hành lại.
                </p>
              </ItemContent>
            </ItemHeader>
            {issueAttention.map((job) => (
              <Item
                key={job.id}
                variant="muted"
                className="flex-col items-stretch gap-2 p-3 sm:flex-row sm:items-center"
              >
                <ItemContent className="min-w-0">
                  <p className="text-sm font-semibold">
                    Đơn{" "}
                    <span className="font-mono">
                      {job.order_number ?? `#${job.order_id}`}
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Mã đơn <span className="font-mono">#{job.order_id}</span>
                    {" · "}
                    Mã HĐĐT{" "}
                    <span className="font-mono">
                      {job.tax_invoice_id
                        ? `#${job.tax_invoice_id}`
                        : "Chưa tạo"}
                    </span>
                  </p>
                  <DescriptionList
                    className="mt-3 grid gap-3 sm:grid-cols-2"
                    items={[
                      {
                        term: "Số HĐ Viettel",
                        description: (
                          <span className="font-mono">
                            {job.invoice_number ?? "Chưa ghi nhận"}
                          </span>
                        ),
                      },
                      {
                        term: "Mã giao dịch Viettel",
                        description: (
                          <span className="break-all font-mono text-xs">
                            {job.provider_ref ?? "Chưa có"}
                          </span>
                        ),
                      },
                      {
                        term: "Phương thức thanh toán",
                        description: job.payment_method
                          ? (getPaymentMethodLabelVi(job.payment_method) ||
                            PAYMENT_METHOD_LABELS_VI[job.payment_method])
                          : "Chưa ghi nhận",
                      },
                    ]}
                  />
                  <p className="mt-3 text-xs text-destructive">
                    {formatIssueAttentionStatus(job.status)}
                    {job.last_error
                      ? ` · ${sanitizeViettelInvoiceError(job.last_error)}`
                      : ""}
                    {" · "}
                    {formatDate(job.updated_at)}
                  </p>

                </ItemContent>
                {canManageInvoices ? (
                  <ItemFooter className="gap-2">
                    {job.status === "reconcile_required" &&
                    job.tax_invoice_id &&
                    job.provider_ref ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => openReconcileForJob(job)}
                        disabled={isPending}
                      >
                        Đối soát đã phát hành
                      </Button>
                    ) : null}
                    {job.status === "blocked" ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleRequeue(job)}
                        disabled={isPending}
                      >
                        Đưa vào hàng chờ
                      </Button>
                    ) : null}
                  </ItemFooter>
                ) : null}
              </Item>
            ))}
          </Item>
        ) : null}
        <DataTable
          columns={columns}
          data={invoices}
          getRowKey={(inv) => inv.id}
          emptyTitle={FINANCE_VI.emptyNoInvoices}
          emptyIcon={<IconReceipt />}
          mobileCardRender={(inv) => (
            <Item variant="outline" className="min-w-0 flex-col items-stretch">
              <ItemHeader className="w-full items-start">
                <div className="min-w-0">
                  <p className="break-all font-mono text-sm">
                    {inv.invoice_number ?? "—"}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {inv.orders?.order_number ?? `#${inv.id}`}
                  </p>
                </div>
                <StatusBadge domain="tax-invoice" value={inv.status} />
              </ItemHeader>
              <ItemContent className="mt-4 w-full">
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
              <ItemFooter className="mt-4 w-full flex-col items-stretch sm:flex-row sm:items-center">
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
              size={isTouchLayout ? "touch" : "sm"}
              onClick={handleLoadMore}
              disabled={loadingMore}
            >
              {loadingMore ? <Spinner className="size-4" /> : null}
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
                  size="touch"
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
        }. HĐ gốc sẽ chuyển sang trạng thái "Đã thay thế". Cần văn bản thỏa thuận với người mua theo TT 32/2025 và NĐ 254/2026.`}
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
              <div className="grid gap-2">
                <Label>{FINANCE_VI.buyerKindLabel}</Label>
                <ToggleGroup
                  type="single"
                  value={form.watch("buyerKind")}
                  onValueChange={(value) => {
                    if (value === "business" || value === "individual") {
                      form.setValue("buyerKind", value, {
                        shouldValidate: true,
                      });
                    }
                  }}
                  variant="outline"
                  size="sm"
                  className="grid w-full grid-cols-2 gap-2"
                  aria-label={FINANCE_VI.buyerKindLabel}
                >
                  <ToggleGroupItem
                    value="business"
                    className={BUYER_KIND_TOGGLE_ITEM_CLASS}
                  >
                    {FINANCE_VI.buyerKindBusiness}
                  </ToggleGroupItem>
                  <ToggleGroupItem
                    value="individual"
                    className={BUYER_KIND_TOGGLE_ITEM_CLASS}
                  >
                    {FINANCE_VI.buyerKindIndividual}
                  </ToggleGroupItem>
                </ToggleGroup>
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

      <FormDialog
        open={!!reconcileTarget}
        onOpenChange={(open) => {
          if (!open) setReconcileTarget(null);
        }}
        title="Đối soát HĐĐT đã phát hành"
        description={`Chỉ ghi khi đã xác minh trên Viettel: mã giao dịch ${reconcileTarget?.providerRef ?? "—"}. Thao tác này không phát hành lại hóa đơn.`}
        schema={reconcileInvoiceSchema}
        defaultValues={{ invoiceNumber: "", cqtCode: "" }}
        entityKey={reconcileTarget?.key ?? "tax-invoice-reconcile"}
        onSubmit={handleReconcile}
        onSuccess={() => toast.success("Đã ghi nhận HĐĐT từ Viettel.")}
        submitLabel="Xác nhận đối soát"
        cancelLabel="Không"
        contentClassName="max-w-lg"
      >
        {(form) => (
          <>
            <TextField
              control={form.control}
              name="invoiceNumber"
              id="tax-invoice-reconcile-number"
              label="Số hóa đơn Viettel"
              required
              maxLength={200}
            />
            <TextField
              control={form.control}
              name="cqtCode"
              id="tax-invoice-reconcile-cqt"
              label="Mã CQT"
              maxLength={200}
            />
          </>
        )}
      </FormDialog>
    </>
  );
}
