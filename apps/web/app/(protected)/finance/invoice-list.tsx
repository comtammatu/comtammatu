"use client";

import { useState, useTransition } from "react";
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
import { Input } from "@comtammatu/ui/components/input";
import { Label } from "@comtammatu/ui/components/label";
import { Textarea } from "@comtammatu/ui/components/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@comtammatu/ui/components/alert-dialog";
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
import type { InvoiceRow } from "./_lib/finance-types";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import {
  Item,
  ItemContent,
  ItemFooter,
  ItemHeader,
} from "@comtammatu/ui/components/item";
import { formatVNDateTime, getVNDateString } from "@/_lib/format-datetime";

import { FORM_VI, ORDER_VI } from "@comtammatu/shared/messages";
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

function todayISODate(): string {
  return getVNDateString();
}

export function InvoiceList({
  initialInvoices,
  initialHasMore = false,
  initialNextCursor = null,
  branchId,
}: InvoiceListProps) {
  const [invoices, setInvoices] = useState(initialInvoices);
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
  const [reissueAllOpen, setReissueAllOpen] = useState(false);
  const [replaceTarget, setReplaceTarget] = useState<InvoiceRow | null>(null);
  const [replaceReason, setReplaceReason] = useState("");
  const [replaceAgreementRef, setReplaceAgreementRef] = useState("");
  const [replaceAgreementDate, setReplaceAgreementDate] =
    useState(todayISODate());
  const [replaceBuyerName, setReplaceBuyerName] = useState("");
  const [replaceBuyerTaxCode, setReplaceBuyerTaxCode] = useState("");
  const [replaceBuyerAddress, setReplaceBuyerAddress] = useState("");

  const trimmedReplaceReason = replaceReason.trim();
  const trimmedReplaceAgreementRef = replaceAgreementRef.trim();
  const replaceReasonValid =
    trimmedReplaceReason.length >= REPLACE_REASON_MIN &&
    trimmedReplaceReason.length <= REPLACE_REASON_MAX;
  const replaceAgreementValid =
    trimmedReplaceAgreementRef.length > 0 &&
    trimmedReplaceAgreementRef.length <= REPLACE_AGREEMENT_MAX;
  const replaceMstValid =
    !replaceBuyerTaxCode.trim() || MST_REGEX.test(replaceBuyerTaxCode.trim());
  const replaceBuyerNameValid =
    !replaceBuyerTaxCode.trim() || replaceBuyerName.trim().length > 0;
  const replaceFormValid =
    replaceReasonValid &&
    replaceAgreementValid &&
    replaceMstValid &&
    replaceBuyerNameValid;

  function openReplaceDialog(inv: InvoiceRow) {
    setReplaceTarget(inv);
    setReplaceReason("");
    setReplaceAgreementRef("");
    setReplaceAgreementDate(todayISODate());
    setReplaceBuyerName(inv.buyer_name ?? "");
    setReplaceBuyerTaxCode(inv.buyer_tax_code ?? "");
    setReplaceBuyerAddress("");
  }

  function resetReplaceDialog() {
    setReplaceTarget(null);
    setReplaceReason("");
    setReplaceAgreementRef("");
    setReplaceAgreementDate(todayISODate());
    setReplaceBuyerName("");
    setReplaceBuyerTaxCode("");
    setReplaceBuyerAddress("");
  }

  function handleReplace() {
    if (!replaceTarget || !replaceFormValid) return;
    const oldId = replaceTarget.id;
    startTransition(async () => {
      const result = await replaceTaxInvoice({
        originalId: oldId,
        reason: trimmedReplaceReason,
        agreementRef: trimmedReplaceAgreementRef,
        agreementDate: replaceAgreementDate,
        buyerName: replaceBuyerName.trim() || undefined,
        buyerTaxCode: replaceBuyerTaxCode.trim() || undefined,
        buyerAddress: replaceBuyerAddress.trim() || undefined,
      });
      if (!result.success) {
        toast.error(result.error ?? "Không thể thay thế hóa đơn");
        return;
      }
      const data = result.data as {
        new_id?: number;
        new_invoice_number?: string | null;
        new_status?: string;
      } | null;
      toast.success(
        `Đã tạo HĐ thay thế ${
          data?.new_invoice_number ?? `#${data?.new_id ?? "?"}`
        }`,
      );
      setInvoices((prev) =>
        prev.map((inv) =>
          inv.id === oldId ? { ...inv, status: "replaced" } : inv,
        ),
      );
      resetReplaceDialog();
    });
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
        toast.error(result.error ?? "Không thể hủy hóa đơn");
        return;
      }
      toast.success("Đã hủy hóa đơn");
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
        toast.error("Link tải không hợp lệ");
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
          toast.error(result.error ?? "Không thể đồng bộ hóa đơn");
          return;
        }
        const outcome =
          (result.data as { outcome?: string } | null)?.outcome ?? "no_change";
        if (outcome === "transition") {
          toast.success("Đã đồng bộ — trạng thái cập nhật");
        } else if (outcome === "no_change") {
          toast.info("Provider chưa có cập nhật — thử lại sau");
        } else if (outcome === "race_lost") {
          toast.warning("Hóa đơn đã thay đổi trạng thái — tải lại trang");
        } else if (outcome === "giveup_24h") {
          toast.warning("Hóa đơn quá hạn — đã chuyển sang 'đã hủy'");
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
        setReissueAllOpen(false);
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
              title="Tải PDF"
            >
              <IconDownload className="size-4" />
              {dense ? <span className="sr-only">Tải PDF</span> : "PDF"}
            </Button>
            <Button
              variant="ghost"
              size={size}
              onClick={() => handleDownload(inv, "xml")}
              disabled={isPending}
              title="Tải XML"
            >
              <IconDownload className="size-4" />
              {dense ? <span className="sr-only">Tải XML</span> : "XML"}
            </Button>
          </>
        ) : null}
        {inv.status === "draft" ? (
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
        {isResyncable(inv.status) ? (
          <Button
            variant="ghost"
            size={size}
            onClick={() => handleResync(inv)}
            disabled={isPending && resyncingId === inv.id}
            title="Đồng bộ lại với provider"
          >
            {isPending && resyncingId === inv.id ? (
              <Spinner className="size-4" />
            ) : (
              <IconRefreshCw className="size-4" />
            )}
            {dense ? <span className="sr-only">Đồng bộ lại</span> : "Đồng bộ"}
          </Button>
        ) : null}
        {inv.status === "issued" ? (
          <>
            <Button
              variant="ghost"
              size={size}
              onClick={() => openReplaceDialog(inv)}
              title="Thay thế hóa đơn"
            >
              <IconFileEdit className="size-4" />
              {dense ? (
                <span className="sr-only">Thay thế hóa đơn</span>
              ) : (
                "Thay thế"
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
              title="Hủy hóa đơn"
            >
              <IconFileX className="size-4" />
              {dense ? (
                <span className="sr-only">Hủy hóa đơn</span>
              ) : (
                "Hủy hóa đơn"
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
      header: "Số HĐ",
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
      header: "Người mua",
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
      header: "Thời gian",
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
        {draftCount > 0 ? (
          <div className="flex justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setReissueAllOpen(true)}
              disabled={isPending}
            >
              <IconRefreshCw className="size-4" />
              {messages.finance.invoiceList.reissueAll(draftCount)}
            </Button>
          </div>
        ) : null}
        <DataTable
          columns={columns}
          data={invoices}
          getRowKey={(inv) => inv.id}
          emptyTitle="Chưa có hóa đơn nào"
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
              <ItemContent className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <p className="text-muted-foreground">Người mua</p>
                  <p className="mt-1">{inv.buyer_name ?? "—"}</p>
                  {inv.buyer_tax_code ? (
                    <p className="text-xs text-muted-foreground">
                      MST: {inv.buyer_tax_code}
                    </p>
                  ) : null}
                </div>
                <div className="text-left sm:text-right">
                  <p className="text-muted-foreground">{FORM_VI.value}</p>
                  <p className="mt-1 font-mono font-semibold">
                    {formatVND(inv.total_amount)}
                  </p>
                </div>
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

      <AlertDialog
        open={!!cancelTarget}
        onOpenChange={(open) => !open && resetCancelDialog()}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xác nhận hủy hóa đơn</AlertDialogTitle>
            <AlertDialogDescription>
              Hủy hóa đơn{" "}
              <strong>
                {cancelTarget?.invoice_number ?? `#${cancelTarget?.id}`}
              </strong>
              ? Hành động này không thể hoàn tác. Lý do hủy được lưu vào hồ sơ
              HĐĐT theo yêu cầu của Nghị định 70/2025.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="invoice-cancel-reason">
              Lý do hủy (tối thiểu {CANCEL_REASON_MIN} ký tự)
            </Label>
            <Textarea
              id="invoice-cancel-reason"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Ví dụ: Khách hàng yêu cầu xuất lại HĐĐT vì sai mã số thuế."
              rows={3}
              maxLength={CANCEL_REASON_MAX}
              disabled={isPending}
            />
            <p className="text-xs text-muted-foreground">
              {trimmedReason.length}/{CANCEL_REASON_MAX}
            </p>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Không</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancel}
              disabled={isPending || !reasonValid}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Hủy hóa đơn
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!refundTarget}
        onOpenChange={(open) => !open && resetRefundDialog()}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {messages.finance.invoiceList.refundDialogTitle}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {messages.finance.invoiceList.refundWarning}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="invoice-refund-reason">
              {messages.finance.invoiceList.refundReasonLabel(
                REFUND_REASON_MIN,
              )}
            </Label>
            <Textarea
              id="invoice-refund-reason"
              value={refundReason}
              onChange={(e) => setRefundReason(e.target.value)}
              placeholder={messages.finance.invoiceList.refundReasonPlaceholder}
              rows={3}
              maxLength={REFUND_REASON_MAX}
              disabled={isPending}
            />
            <p className="text-xs text-muted-foreground">
              {trimmedRefundReason.length}/{REFUND_REASON_MAX}
            </p>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>
              {messages.finance.invoiceList.refundCancel}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRefund}
              disabled={isPending || !refundReasonValid}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {messages.finance.invoiceList.refundConfirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!methodFixTarget}
        onOpenChange={(open) => !open && resetMethodFixDialog()}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {messages.finance.invoiceList.methodFixDialogTitle}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {messages.finance.invoiceList.methodFixWarning}
            </AlertDialogDescription>
          </AlertDialogHeader>
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
            <div className="grid gap-2">
              <Label htmlFor="invoice-methodfix-reason">
                {messages.finance.invoiceList.methodFixReasonLabel(
                  REFUND_REASON_MIN,
                )}
              </Label>
              <Textarea
                id="invoice-methodfix-reason"
                value={methodFixReason}
                onChange={(e) => setMethodFixReason(e.target.value)}
                placeholder={
                  messages.finance.invoiceList.methodFixReasonPlaceholder
                }
                rows={3}
                maxLength={REFUND_REASON_MAX}
                disabled={isPending}
              />
              <p className="text-xs text-muted-foreground">
                {trimmedMethodFixReason.length}/{REFUND_REASON_MAX}
              </p>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>
              {messages.finance.invoiceList.methodFixCancel}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleMethodFix}
              disabled={isPending || !methodFixValid}
            >
              {messages.finance.invoiceList.methodFixConfirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!replaceTarget}
        onOpenChange={(open) => !open && resetReplaceDialog()}
      >
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Thay thế hóa đơn</AlertDialogTitle>
            <AlertDialogDescription>
              Tạo HĐ thay thế cho{" "}
              <strong>
                {replaceTarget?.invoice_number ?? `#${replaceTarget?.id}`}
              </strong>
              . HĐ gốc sẽ chuyển sang trạng thái &quot;Đã thay thế&quot;. Cần
              văn bản thỏa thuận với người mua theo TT78 §7.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-2">
              <Label htmlFor="replace-reason">
                Lý do thay thế (≥{REPLACE_REASON_MIN} ký tự)
              </Label>
              <Textarea
                id="replace-reason"
                value={replaceReason}
                onChange={(e) => setReplaceReason(e.target.value)}
                placeholder="Ví dụ: Sửa sai MST người mua từ 0100109106 thành 0312891234."
                rows={3}
                maxLength={REPLACE_REASON_MAX}
                disabled={isPending}
              />
              <p className="text-xs text-muted-foreground">
                {trimmedReplaceReason.length}/{REPLACE_REASON_MAX}
              </p>
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="replace-agreement-ref">
                  Văn bản thỏa thuận
                </Label>
                <Input
                  id="replace-agreement-ref"
                  value={replaceAgreementRef}
                  onChange={(e) => setReplaceAgreementRef(e.target.value)}
                  placeholder="Số biên bản / mô tả"
                  maxLength={REPLACE_AGREEMENT_MAX}
                  disabled={isPending}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="replace-agreement-date">Ngày văn bản</Label>
                <Input
                  id="replace-agreement-date"
                  type="date"
                  value={replaceAgreementDate}
                  onChange={(e) => setReplaceAgreementDate(e.target.value)}
                  max={todayISODate()}
                  disabled={isPending}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="replace-buyer-name">Tên người mua</Label>
              <Input
                id="replace-buyer-name"
                value={replaceBuyerName}
                onChange={(e) => setReplaceBuyerName(e.target.value)}
                maxLength={200}
                disabled={isPending}
              />
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="replace-buyer-mst">MST người mua</Label>
                <Input
                  id="replace-buyer-mst"
                  value={replaceBuyerTaxCode}
                  onChange={(e) => setReplaceBuyerTaxCode(e.target.value)}
                  placeholder="0312891234 hoặc 0312891234-001"
                  disabled={isPending}
                />
                {replaceBuyerTaxCode.trim() && !replaceMstValid ? (
                  <p className="text-xs text-destructive">
                    MST phải có dạng 10 số hoặc 10-3 số
                  </p>
                ) : null}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="replace-buyer-address">Địa chỉ</Label>
                <Input
                  id="replace-buyer-address"
                  value={replaceBuyerAddress}
                  onChange={(e) => setReplaceBuyerAddress(e.target.value)}
                  maxLength={500}
                  disabled={isPending}
                />
              </div>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Không</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleReplace}
              disabled={isPending || !replaceFormValid}
            >
              Tạo HĐ thay thế
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={reissueAllOpen}
        onOpenChange={(open) => !open && setReissueAllOpen(false)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {messages.finance.invoiceList.reissueAllTitle}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {messages.finance.invoiceList.reissueAllDescription(draftCount)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>
              {messages.finance.invoiceList.reissueAllCancel}
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleReissueAll} disabled={isPending}>
              {messages.finance.invoiceList.reissueAllConfirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
