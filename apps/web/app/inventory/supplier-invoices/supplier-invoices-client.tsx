"use client";

import { useMemo, useState, useTransition } from "react";
import { AlertTriangle, CheckCircle2, Search } from "lucide-react";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@comtammatu/ui/components/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@comtammatu/ui/components/dialog";
import { Input } from "@comtammatu/ui/components/input";
import { Label } from "@comtammatu/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@comtammatu/ui/components/table";
import { toast } from "@comtammatu/ui/components/sonner";
import { useIsMobile } from "@comtammatu/ui/hooks/use-mobile";
import { cn } from "@comtammatu/ui";
import { InventoryHeader } from "../_components/inventory-header";
import { TableEmptyStateRow } from "../_components/table-empty-state-row";
import {
  createSupplierInvoice,
  fetchSupplierInvoices,
  markInvoicePaid,
  recomputeInvoiceMatching,
} from "../procurement-actions";


import { formatVND } from "../_lib/format";
import {
  getInventoryStatusBadgeVariant,
  getInventoryStatusLabel,
} from "../_lib/ui";

export type SupplierInvoiceRow = {
  id: number;
  supplierId: number;
  grnId: number | null;
  code: string;
  supplierName: string;
  grnCode: string | null;
  matchStatus: string;
  paymentStatus: string;
  amount: number;
  paidAmount: number;
  variance: number | null;
  invoiceDate: string | null;
  dueDate: string | null;
};

type SupplierOption = {
  id: number;
  name: string;
};

type GrnOption = {
  id: number;
  code: string;
  supplierId: number;
  supplierName: string;
};

const ALL_FILTER_VALUE = "_all";

const MATCH_STATUS_OPTIONS = [
  { value: "pending", label: "Chờ đối soát" },
  { value: "matched", label: "Đã khớp" },
  { value: "discrepancy", label: "Chênh lệch" },
  { value: "approved", label: "Đã duyệt ngoại lệ" },
] as const;

const PAYMENT_STATUS_OPTIONS = [
  { value: "unpaid", label: "Chưa thanh toán" },
  { value: "partial", label: "Thanh toán một phần" },
  { value: "paid", label: "Đã thanh toán" },
] as const;

function formatDate(value: string | null) {
  if (!value) return "Chưa có";

  return new Date(value).toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function getOutstandingAmount(invoice: SupplierInvoiceRow) {
  return Math.max(invoice.amount - invoice.paidAmount, 0);
}

function isInvoiceOverdue(invoice: SupplierInvoiceRow) {
  if (!invoice.dueDate || invoice.paymentStatus === "paid") {
    return false;
  }

  const dueDate = new Date(invoice.dueDate);
  const today = new Date();

  dueDate.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);

  return dueDate < today;
}

export function SupplierInvoicesClient({
  invoices,
  suppliers,
  grns,
}: {
  invoices: SupplierInvoiceRow[];
  suppliers: SupplierOption[];
  grns: GrnOption[];
}) {
  const [rows, setRows] = useState(invoices);
  const [search, setSearch] = useState("");
  const [supplierFilter, setSupplierFilter] = useState(ALL_FILTER_VALUE);
  const [matchStatusFilter, setMatchStatusFilter] = useState(ALL_FILTER_VALUE);
  const [paymentStatusFilter, setPaymentStatusFilter] =
    useState(ALL_FILTER_VALUE);
  const [showOnlyOverdue, setShowOnlyOverdue] = useState(false);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<number | null>(
    invoices[0]?.id ?? null,
  );
  const [createOpen, setCreateOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [supplierId, setSupplierId] = useState("");
  const [grnId, setGrnId] = useState("none");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [subtotal, setSubtotal] = useState("");
  const [vatRate, setVatRate] = useState("8");
  const [matchingNotes, setMatchingNotes] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [isPending, startTransition] = useTransition();
  const isMobile = useIsMobile();

  const supplierOptions = useMemo(() => {
    return Array.from(
      new Set(
        rows
          .map((invoice) => invoice.supplierName)
          .filter((supplierName) => supplierName.trim().length > 0),
      ),
    )
      .sort((left, right) => left.localeCompare(right, "vi"))
      .map((supplierName) => ({
        label: supplierName,
        value: supplierName,
      }));
  }, [rows]);

  const filteredInvoices = useMemo(() => {
    const query = search.trim().toLowerCase();

    return rows.filter((invoice) => {
      if (
        supplierFilter !== ALL_FILTER_VALUE &&
        invoice.supplierName !== supplierFilter
      ) {
        return false;
      }

      if (
        matchStatusFilter !== ALL_FILTER_VALUE &&
        invoice.matchStatus !== matchStatusFilter
      ) {
        return false;
      }

      if (
        paymentStatusFilter !== ALL_FILTER_VALUE &&
        invoice.paymentStatus !== paymentStatusFilter
      ) {
        return false;
      }

      if (showOnlyOverdue && !isInvoiceOverdue(invoice)) {
        return false;
      }

      if (!query) {
        return true;
      }

      return (
        invoice.code.toLowerCase().includes(query) ||
        invoice.supplierName.toLowerCase().includes(query) ||
        (invoice.grnCode ?? "").toLowerCase().includes(query)
      );
    });
  }, [
    rows,
    matchStatusFilter,
    paymentStatusFilter,
    search,
    showOnlyOverdue,
    supplierFilter,
  ]);

  const selectedInvoice =
    filteredInvoices.find((invoice) => invoice.id === selectedInvoiceId) ??
    filteredInvoices[0] ??
    null;

  const totalOutstanding = useMemo(() => {
    return rows.reduce(
      (sum, invoice) => sum + getOutstandingAmount(invoice),
      0,
    );
  }, [rows]);

  const pendingMatchCount = rows.filter(
    (invoice) =>
      invoice.matchStatus === "pending" ||
      invoice.matchStatus === "discrepancy",
  ).length;
  const overdueCount = rows.filter(isInvoiceOverdue).length;
  const paidCount = rows.filter(
    (invoice) => invoice.paymentStatus === "paid",
  ).length;

  const showEmptyResults =
    filteredInvoices.length === 0 &&
    (search.trim().length > 0 ||
      supplierFilter !== ALL_FILTER_VALUE ||
      matchStatusFilter !== ALL_FILTER_VALUE ||
      paymentStatusFilter !== ALL_FILTER_VALUE ||
      showOnlyOverdue);
  const selectedGrn =
    grnId !== "none"
      ? (grns.find((option) => option.id === Number(grnId)) ?? null)
      : null;
  const numericSubtotal = Number(subtotal || 0);
  const numericVatRate = Number(vatRate || 0);
  const vatAmount = Math.round(numericSubtotal * numericVatRate) / 100;
  const totalAmount = numericSubtotal + vatAmount;

  async function reloadInvoices(nextSelectedId?: number | null) {
    const again = await fetchSupplierInvoices();
    if (!again.success) return;

    const nextRows = ((again.data ?? []) as Array<Record<string, unknown>>).map(
      (row) => ({
        id: row.id as number,
        supplierId: Number(row.supplier_id ?? 0),
        grnId: row.grn_id != null ? Number(row.grn_id) : null,
        code: (row.invoice_number as string) ?? "",
        supplierName:
          ((row.suppliers as Record<string, unknown>)?.name as string) ?? "—",
        grnCode:
          ((row.goods_received_notes as Record<string, unknown>)
            ?.grn_number as string) ?? null,
        matchStatus:
          (row.matching_status as string | undefined) ??
          (row.match_status as string | undefined) ??
          "pending",
        paymentStatus: (row.payment_status as string) ?? "unpaid",
        amount: Number(row.total_amount ?? 0),
        paidAmount: Number(row.paid_amount ?? 0),
        variance:
          (row.variance_pct as number | null | undefined) != null
            ? Number(row.variance_pct)
            : null,
        invoiceDate: (row.invoice_date as string) ?? null,
        dueDate: (row.due_date as string) ?? null,
      }),
    );

    setRows(nextRows);
    if (typeof nextSelectedId === "number") {
      setSelectedInvoiceId(nextSelectedId);
    }
  }

  function handleCreateInvoice() {
    const resolvedSupplierId =
      selectedGrn?.supplierId ?? Number(supplierId || 0);
    if (!resolvedSupplierId) {
      toast.error("Chọn nhà cung cấp hoặc GRN liên kết.");
      return;
    }
    if (!invoiceNumber.trim()) {
      toast.error("Nhập số hóa đơn.");
      return;
    }
    if (numericSubtotal <= 0) {
      toast.error("Nhập giá trị hóa đơn hợp lệ.");
      return;
    }

    startTransition(async () => {
      const res = await createSupplierInvoice({
        supplierId: resolvedSupplierId,
        grnId: selectedGrn?.id ?? null,
        invoiceNumber: invoiceNumber.trim(),
        invoiceDate,
        subtotal: numericSubtotal,
        vatRate: numericVatRate,
        vatAmount,
        totalAmount,
        matchingNotes: matchingNotes.trim() || undefined,
      });

      if (!res.success || !res.data) {
        toast.error(res.error ?? "Không thể ghi nhận hóa đơn NCC.");
        return;
      }

      const created = res.data as { id: number };
      toast.success("Đã ghi nhận hóa đơn NCC.");
      setCreateOpen(false);
      setSupplierId("");
      setGrnId("none");
      setInvoiceNumber("");
      setSubtotal("");
      setVatRate("8");
      setMatchingNotes("");
      await reloadInvoices(created.id);
    });
  }

  function handleRecomputeMatching() {
    if (!selectedInvoice) return;

    startTransition(async () => {
      const res = await recomputeInvoiceMatching(selectedInvoice.id);
      if (!res.success) {
        toast.error(res.error ?? "Không thể tính lại đối soát.");
        return;
      }
      toast.success("Đã tính lại đối soát 3-way.");
      await reloadInvoices(selectedInvoice.id);
    });
  }

  function handleMarkPaid() {
    if (!selectedInvoice) return;
    const amount = Number(paymentAmount || 0);
    if (amount <= 0) {
      toast.error("Nhập số tiền thanh toán hợp lệ.");
      return;
    }

    startTransition(async () => {
      const res = await markInvoicePaid({
        invoiceId: selectedInvoice.id,
        amount,
        paidAt: new Date().toISOString(),
      });
      if (!res.success) {
        toast.error(res.error ?? "Không thể ghi nhận thanh toán.");
        return;
      }
      toast.success("Đã cập nhật thanh toán hóa đơn.");
      setPaymentOpen(false);
      setPaymentAmount("");
      await reloadInvoices(selectedInvoice.id);
    });
  }

  return (
    <>
      <InventoryHeader
        title="Hóa đơn NCC"
        actions={
          <Button type="button" onClick={() => setCreateOpen(true)}>
            Ghi nhận hóa đơn NCC
          </Button>
        }
      />
      <div className="space-y-6">

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Card><CardContent>
            <Badge variant="secondary">
              Chờ đối soát
            </Badge>
            <p className="mt-3 text-3xl font-semibold">{pendingMatchCount}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Hóa đơn còn pending hoặc có chênh lệch cần xử lý.
            </p>
          </CardContent></Card>
          <Card><CardContent>
            <Badge variant="secondary">
              Quá hạn chưa trả
            </Badge>
            <p className="mt-3 text-3xl font-semibold">{overdueCount}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Khoản phải trả cần được ưu tiên trong hôm nay.
            </p>
          </CardContent></Card>
          <Card><CardContent>
            <Badge variant="secondary">
              Đã thanh toán đủ
            </Badge>
            <p className="mt-3 text-3xl font-semibold">{paidCount}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Hóa đơn đã đóng vòng công nợ hoàn chỉnh.
            </p>
          </CardContent></Card>
          <Card><CardContent>
            <Badge variant="secondary">
              Công nợ còn lại
            </Badge>
            <p className="mt-3 text-3xl font-semibold">
              {formatVND(totalOutstanding)}đ
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Tổng giá trị cần tiếp tục thanh toán.
            </p>
          </CardContent></Card>
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,1fr)]">
          <Card className="overflow-hidden">
            <CardHeader className="gap-4">
              <div className="space-y-1">
                <CardTitle>Danh sách hóa đơn nhà cung cấp</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Lọc theo nhà cung cấp, GRN liên kết, đối soát và trạng thái
                  thanh toán.
                </p>
              </div>
              <Card className="py-0"><CardContent className="flex flex-wrap items-center gap-3 p-3">
                <div className="relative min-w-[16rem] flex-1">
                  <Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Tìm số hóa đơn, NCC hoặc mã GRN"
                    className="pl-10"
                  />
                </div>

                <Select
                  value={supplierFilter}
                  onValueChange={setSupplierFilter}
                >
                  <SelectTrigger className="min-w-[13rem]">
                    <SelectValue placeholder="Nhà cung cấp" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_FILTER_VALUE}>
                      Tất cả nhà cung cấp
                    </SelectItem>
                    {supplierOptions.map((supplier) => (
                      <SelectItem key={supplier.value} value={supplier.value}>
                        {supplier.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={matchStatusFilter}
                  onValueChange={setMatchStatusFilter}
                >
                  <SelectTrigger className="min-w-[13rem]">
                    <SelectValue placeholder="Đối soát" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_FILTER_VALUE}>
                      Tất cả trạng thái đối soát
                    </SelectItem>
                    {MATCH_STATUS_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={paymentStatusFilter}
                  onValueChange={setPaymentStatusFilter}
                >
                  <SelectTrigger className="min-w-[13rem]">
                    <SelectValue placeholder="Thanh toán" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_FILTER_VALUE}>
                      Tất cả trạng thái thanh toán
                    </SelectItem>
                    {PAYMENT_STATUS_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </CardContent></Card>
            </CardHeader>
            <CardContent className="p-6 pt-0">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <Button
                  type="button"
                  size="sm"
                  variant={showOnlyOverdue ? "default" : "outline"}
                  onClick={() => setShowOnlyOverdue((current) => !current)}
                  aria-pressed={showOnlyOverdue}
                >
                  <AlertTriangle className="size-4" />
                  Chỉ xem hóa đơn quá hạn
                </Button>
                <Badge variant="outline" className="rounded-full">
                  {filteredInvoices.length} / {rows.length} hóa đơn
                </Badge>
              </div>

              {isMobile ? (
                <div className="space-y-3">
                  {filteredInvoices.length === 0 ? (
                    <Card>
                      <CardContent className="py-10 text-center">
                        <p className="text-base font-semibold">
                          {showEmptyResults
                            ? "Không tìm thấy hóa đơn phù hợp"
                            : "Chưa có hóa đơn NCC"}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {showEmptyResults
                            ? "Thử nới bộ lọc hoặc từ khóa để xem thêm kết quả."
                            : "Các hóa đơn NCC mới sẽ xuất hiện tại đây sau khi được tạo."}
                        </p>
                      </CardContent>
                    </Card>
                  ) : null}

                  {filteredInvoices.map((invoice) => {
                    const outstandingAmount = getOutstandingAmount(invoice);
                    const overdue = isInvoiceOverdue(invoice);
                    const isActive = selectedInvoice?.id === invoice.id;

                    return (
                      <Card
                        key={invoice.id}
                        className={cn(
                          "bg-muted/30 transition",
                          isActive && "ring-primary/40 shadow-md",
                        )}
                      ><CardContent>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 space-y-1">
                            <p className="font-mono text-base font-semibold">
                              {invoice.code}
                            </p>
                            <p className="truncate text-sm text-muted-foreground">
                              {invoice.supplierName}
                            </p>
                          </div>
                          {overdue ? (
                            <Badge
                              variant={getInventoryStatusBadgeVariant(
                                "overdue",
                              )}
                            >
                              {getInventoryStatusLabel("overdue")}
                            </Badge>
                          ) : null}
                        </div>

                        <div className="mt-4 flex flex-wrap gap-2">
                          <Badge
                            variant={getInventoryStatusBadgeVariant(
                              invoice.matchStatus,
                            )}
                          >
                            {getInventoryStatusLabel(invoice.matchStatus)}
                          </Badge>
                          <Badge
                            variant={getInventoryStatusBadgeVariant(
                              invoice.paymentStatus,
                            )}
                          >
                            {getInventoryStatusLabel(invoice.paymentStatus)}
                          </Badge>
                        </div>

                        <div className="mt-4 grid gap-2 text-sm">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-muted-foreground">
                              Ngày hóa đơn
                            </span>
                            <span>{formatDate(invoice.invoiceDate)}</span>
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-muted-foreground">
                              Hạn thanh toán
                            </span>
                            <span>{formatDate(invoice.dueDate)}</span>
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-muted-foreground">
                              Còn lại
                            </span>
                            <span className="font-mono font-semibold">
                              {formatVND(outstandingAmount)}đ
                            </span>
                          </div>
                        </div>

                        <Button
                          type="button"
                          variant={isActive ? "default" : "outline"}
                          className="mt-4 w-full"
                          onClick={() => setSelectedInvoiceId(invoice.id)}
                        >
                          {isActive ? "Đang xem phân tích" : "Xem phân tích"}
                        </Button>
                      </CardContent></Card>
                    );
                  })}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-40">Số hóa đơn</TableHead>
                      <TableHead className="min-w-52">Nhà cung cấp</TableHead>
                      <TableHead className="min-w-44">Ngày / hạn</TableHead>
                      <TableHead className="min-w-36">Đối soát</TableHead>
                      <TableHead className="min-w-36">Thanh toán</TableHead>
                      <TableHead className="min-w-32 text-right">
                        Còn lại
                      </TableHead>
                      <TableHead className="w-28 text-right">
                        Thao tác
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredInvoices.length === 0 ? (
                      <TableEmptyStateRow
                        colSpan={7}
                        title={
                          showEmptyResults
                            ? "Không tìm thấy hóa đơn phù hợp"
                            : "Chưa có hóa đơn NCC"
                        }
                        description={
                          showEmptyResults
                            ? "Thử nới bộ lọc hoặc từ khóa để xem thêm kết quả."
                            : "Các hóa đơn NCC mới sẽ xuất hiện tại đây sau khi được tạo."
                        }
                      />
                    ) : null}

                    {filteredInvoices.map((invoice) => {
                      const outstandingAmount = getOutstandingAmount(invoice);
                      const overdue = isInvoiceOverdue(invoice);
                      const isActive = selectedInvoice?.id === invoice.id;

                      return (
                        <TableRow
                          key={invoice.id}
                          className={cn(isActive && "bg-primary/5")}
                        >
                          <TableCell>
                            <div className="space-y-1">
                              <p className="font-mono font-semibold text-foreground">
                                {invoice.code}
                              </p>
                              {invoice.grnCode ? (
                                <p className="text-xs text-muted-foreground">
                                  GRN: {invoice.grnCode}
                                </p>
                              ) : null}
                            </div>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {invoice.supplierName}
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1 text-sm">
                              <p>{formatDate(invoice.invoiceDate)}</p>
                              <p
                                className={cn(
                                  "text-muted-foreground",
                                  overdue && "font-medium text-destructive",
                                )}
                              >
                                Hạn: {formatDate(invoice.dueDate)}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={getInventoryStatusBadgeVariant(
                                invoice.matchStatus,
                              )}
                            >
                              {getInventoryStatusLabel(invoice.matchStatus)}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-2">
                              <Badge
                                variant={getInventoryStatusBadgeVariant(
                                  invoice.paymentStatus,
                                )}
                              >
                                {getInventoryStatusLabel(invoice.paymentStatus)}
                              </Badge>
                              {overdue ? (
                                <Badge
                                  variant={getInventoryStatusBadgeVariant(
                                    "overdue",
                                  )}
                                >
                                  {getInventoryStatusLabel("overdue")}
                                </Badge>
                              ) : null}
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-mono font-semibold">
                            {formatVND(outstandingAmount)}đ
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              type="button"
                              size="sm"
                              variant={isActive ? "default" : "outline"}
                              onClick={() => setSelectedInvoiceId(invoice.id)}
                            >
                              {isActive ? "Đang xem" : "Phân tích"}
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-1">
                <CardTitle>
                  {selectedInvoice?.code ?? "Chưa chọn hóa đơn"}
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  {selectedInvoice?.supplierName ??
                    "Chọn một hóa đơn để xem phân tích công nợ và đối soát."}
                </p>
              </div>
              {selectedInvoice ? (
                <div className="flex flex-wrap justify-end gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={handleRecomputeMatching}
                    disabled={isPending}
                  >
                    Tính lại đối soát
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => setPaymentOpen(true)}
                    disabled={
                      isPending || getOutstandingAmount(selectedInvoice) <= 0
                    }
                  >
                    Ghi nhận thanh toán
                  </Button>
                  <Badge
                    variant={getInventoryStatusBadgeVariant(
                      selectedInvoice.matchStatus,
                    )}
                  >
                    {getInventoryStatusLabel(selectedInvoice.matchStatus)}
                  </Badge>
                  <Badge
                    variant={getInventoryStatusBadgeVariant(
                      selectedInvoice.paymentStatus,
                    )}
                  >
                    {getInventoryStatusLabel(selectedInvoice.paymentStatus)}
                  </Badge>
                </div>
              ) : null}
            </CardHeader>
            <CardContent>
              {selectedInvoice ? (
                <div className="space-y-5">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Card className="bg-muted/30"><CardContent>
                      <Badge variant="secondary">
                        Tổng hóa đơn
                      </Badge>
                      <p className="mt-2 font-mono text-xl font-semibold">
                        {formatVND(selectedInvoice.amount)}đ
                      </p>
                    </CardContent></Card>
                    <Card className="bg-muted/30"><CardContent>
                      <Badge variant="secondary">
                        Còn phải trả
                      </Badge>
                      <p className="mt-2 font-mono text-xl font-semibold">
                        {formatVND(getOutstandingAmount(selectedInvoice))}đ
                      </p>
                    </CardContent></Card>
                  </div>

                  <div className="space-y-3">
                    <Card className="bg-muted/30 py-0"><CardContent className="flex items-center justify-between gap-3 px-4 py-3">
                      <span className="text-sm text-muted-foreground">
                        Ngày hóa đơn
                      </span>
                      <span className="text-sm font-medium">
                        {formatDate(selectedInvoice.invoiceDate)}
                      </span>
                    </CardContent></Card>
                    <Card className="bg-muted/30 py-0"><CardContent className="flex items-center justify-between gap-3 px-4 py-3">
                      <span className="text-sm text-muted-foreground">
                        Hạn thanh toán
                      </span>
                      <span
                        className={cn(
                          "text-sm font-medium",
                          isInvoiceOverdue(selectedInvoice) &&
                            "text-destructive",
                        )}
                      >
                        {formatDate(selectedInvoice.dueDate)}
                      </span>
                    </CardContent></Card>
                    <Card className="bg-muted/30 py-0"><CardContent className="flex items-center justify-between gap-3 px-4 py-3">
                      <span className="text-sm text-muted-foreground">
                        Đã thanh toán
                      </span>
                      <span className="text-sm font-medium">
                        {formatVND(selectedInvoice.paidAmount)}đ
                      </span>
                    </CardContent></Card>
                    <Card className="bg-muted/30 py-0"><CardContent className="flex items-center justify-between gap-3 px-4 py-3">
                      <span className="text-sm text-muted-foreground">
                        GRN liên kết
                      </span>
                      <span className="text-sm font-medium">
                        {selectedInvoice.grnCode ?? "Chưa liên kết"}
                      </span>
                    </CardContent></Card>
                  </div>

                  {selectedInvoice.variance !== null &&
                  selectedInvoice.variance > 0 ? (
                    <div className="rounded-[1.5rem] border border-destructive/30 bg-destructive/5 p-4">
                      <div className="flex items-start gap-3">
                        <AlertTriangle className="mt-0.5 size-4 text-destructive" />
                        <div className="space-y-1">
                          <p className="text-sm font-semibold text-destructive">
                            Chênh lệch đối soát {selectedInvoice.variance}%
                          </p>
                          <p className="text-sm text-muted-foreground">
                            Kiểm tra lại số lượng thực nhận, đơn giá hoặc khoản
                            phụ phí trước khi xác nhận thanh toán.
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-[1.5rem] border border-success/30 bg-success/5 p-4">
                      <div className="flex items-start gap-3">
                        <CheckCircle2 className="mt-0.5 size-4 text-success" />
                        <div className="space-y-1">
                          <p className="text-sm font-semibold text-success">
                            Hóa đơn đang ở ngưỡng an toàn để xử lý tiếp
                          </p>
                          <p className="text-sm text-muted-foreground">
                            Không có cảnh báo chênh lệch lớn trên dữ liệu hiện
                            tại.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed px-6 py-10 text-center">
                  <p className="text-base font-semibold">
                    Chưa có hóa đơn để phân tích
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Chọn một hóa đơn từ danh sách bên trái để xem chi tiết công
                    nợ và trạng thái đối soát.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ghi nhận hóa đơn NCC</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label>GRN liên kết</Label>
              <Select
                value={grnId}
                onValueChange={(value) => {
                  setGrnId(value);
                  if (value !== "none") {
                    const grn =
                      grns.find((option) => option.id === Number(value)) ??
                      null;
                    if (grn) {
                      setSupplierId(String(grn.supplierId));
                    }
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Chọn GRN (tùy chọn)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Không liên kết GRN</SelectItem>
                  {grns.map((option) => (
                    <SelectItem key={option.id} value={String(option.id)}>
                      {option.code} · {option.supplierName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label>Nhà cung cấp</Label>
              <Select value={supplierId} onValueChange={setSupplierId}>
                <SelectTrigger>
                  <SelectValue placeholder="Chọn nhà cung cấp" />
                </SelectTrigger>
                <SelectContent>
                  {suppliers.map((option) => (
                    <SelectItem key={option.id} value={String(option.id)}>
                      {option.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label>Số hóa đơn</Label>
              <Input
                value={invoiceNumber}
                onChange={(event) => setInvoiceNumber(event.target.value)}
                placeholder="INV-2026-001"
              />
            </div>

            <div className="grid gap-2">
              <Label>Ngày hóa đơn</Label>
              <Input
                type="date"
                value={invoiceDate}
                onChange={(event) => setInvoiceDate(event.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>Tạm tính</Label>
                <Input
                  inputMode="decimal"
                  value={subtotal}
                  onChange={(event) => setSubtotal(event.target.value)}
                  placeholder="0"
                />
              </div>
              <div className="grid gap-2">
                <Label>VAT %</Label>
                <Input
                  inputMode="decimal"
                  value={vatRate}
                  onChange={(event) => setVatRate(event.target.value)}
                  placeholder="8"
                />
              </div>
            </div>

            <div className="rounded-2xl border border-border/60 bg-muted/20 px-4 py-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">VAT</span>
                <span className="font-mono">{formatVND(vatAmount)}đ</span>
              </div>
              <div className="mt-2 flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Tổng cộng</span>
                <span className="font-mono font-semibold">
                  {formatVND(totalAmount)}đ
                </span>
              </div>
            </div>

            <div className="grid gap-2">
              <Label>Ghi chú đối soát</Label>
              <Input
                value={matchingNotes}
                onChange={(event) => setMatchingNotes(event.target.value)}
                placeholder="Ghi chú thêm cho bước matching"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setCreateOpen(false)}
              disabled={isPending}
            >
              Hủy
            </Button>
            <Button
              type="button"
              onClick={handleCreateInvoice}
              disabled={isPending}
            >
              Lưu hóa đơn
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={paymentOpen} onOpenChange={setPaymentOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ghi nhận thanh toán</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="rounded-2xl border border-border/60 bg-muted/20 px-4 py-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Hóa đơn</span>
                <span className="font-mono">
                  {selectedInvoice?.code ?? "—"}
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Còn phải trả</span>
                <span className="font-mono font-semibold">
                  {selectedInvoice
                    ? `${formatVND(getOutstandingAmount(selectedInvoice))}đ`
                    : "—"}
                </span>
              </div>
            </div>

            <div className="grid gap-2">
              <Label>Số tiền thanh toán</Label>
              <Input
                inputMode="decimal"
                value={paymentAmount}
                onChange={(event) => setPaymentAmount(event.target.value)}
                placeholder="0"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setPaymentOpen(false)}
              disabled={isPending}
            >
              Hủy
            </Button>
            <Button type="button" onClick={handleMarkPaid} disabled={isPending}>
              Cập nhật thanh toán
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
