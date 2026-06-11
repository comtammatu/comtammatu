"use client";

import { useState, useTransition } from "react";
import {
  Download as IconDownload,
  FileEdit as IconFileEdit,
  FileX as IconFileX,
  Receipt as IconReceipt,
  RefreshCw as IconRefreshCw,
} from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
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
import { cancelTaxInvoice, createTaxInvoice } from "./actions";
import { forceResyncTaxInvoice } from "./reconcile-invoice-actions";
import { getArchiveDownloadUrl } from "./archive-actions";
import { replaceTaxInvoice } from "./replace-invoice-actions";
import type { InvoiceRow } from "./_lib/finance-types";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
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
}

const CANCEL_REASON_MIN = 20;
const CANCEL_REASON_MAX = 500;
const REPLACE_REASON_MIN = 20;
const REPLACE_REASON_MAX = 255;
const REPLACE_AGREEMENT_MAX = 225;
const MST_REGEX = /^\d{10}(-\d{3})?$/;

function todayISODate(): string {
  return getVNDateString();
}

export function InvoiceList({ initialInvoices }: InvoiceListProps) {
  const [invoices, setInvoices] = useState(initialInvoices);
  const [cancelTarget, setCancelTarget] = useState<InvoiceRow | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [isPending, startTransition] = useTransition();
  const [resyncingId, setResyncingId] = useState<number | null>(null);
  const [reissuingId, setReissuingId] = useState<number | null>(null);
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
            <IconRefreshCw
              className={`size-4 ${
                isPending && resyncingId === inv.id ? "animate-spin" : ""
              }`}
            />
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
      <div className="space-y-4">
<DataTable
          columns={columns}
          data={invoices}
          getRowKey={(inv) => inv.id}
          emptyTitle="Chưa có hóa đơn nào"
          emptyIcon={<IconReceipt />}
          mobileCardRender={(inv) => (
            <div className="rounded-lg border border-border/70 bg-background p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-sm">
                    {inv.invoice_number ?? "—"}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {inv.orders?.order_number ?? `#${inv.id}`}
                  </p>
                </div>
                <StatusBadge domain="tax-invoice" value={inv.status} />
              </div>
              <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
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
              </div>
              <div className="mt-4 flex items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                  {formatDate(inv.issued_at ?? inv.created_at)}
                </p>
                {renderActions(inv, "card")}
              </div>
            </div>
          )}
        />
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
    </>
  );
}
