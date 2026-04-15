"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Search } from "lucide-react";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@comtammatu/ui/components/card";
import { Input } from "@comtammatu/ui/components/input";
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
import { useIsMobile } from "@comtammatu/ui/hooks/use-mobile";
import { cn } from "@comtammatu/ui";
import { EmptyStatePanel } from "../_components/empty-state-panel";
import { TableEmptyStateRow } from "../_components/table-empty-state-row";
import { tRoute } from "../_lib/dictionary";
import { formatVND } from "../_lib/format";
import {
  getInventoryStatusBadgeVariant,
  getInventoryStatusLabel,
} from "../_lib/ui";

export type SupplierInvoiceRow = {
  id: number;
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
}: {
  invoices: SupplierInvoiceRow[];
}) {
  const [search, setSearch] = useState("");
  const [supplierFilter, setSupplierFilter] = useState(ALL_FILTER_VALUE);
  const [matchStatusFilter, setMatchStatusFilter] = useState(ALL_FILTER_VALUE);
  const [paymentStatusFilter, setPaymentStatusFilter] =
    useState(ALL_FILTER_VALUE);
  const [showOnlyOverdue, setShowOnlyOverdue] = useState(false);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<number | null>(
    invoices[0]?.id ?? null,
  );
  const isMobile = useIsMobile();

  const supplierOptions = useMemo(() => {
    return Array.from(
      new Set(
        invoices
          .map((invoice) => invoice.supplierName)
          .filter((supplierName) => supplierName.trim().length > 0),
      ),
    )
      .sort((left, right) => left.localeCompare(right, "vi"))
      .map((supplierName) => ({
        label: supplierName,
        value: supplierName,
      }));
  }, [invoices]);

  const filteredInvoices = useMemo(() => {
    const query = search.trim().toLowerCase();

    return invoices.filter((invoice) => {
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
    invoices,
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
    return invoices.reduce(
      (sum, invoice) => sum + getOutstandingAmount(invoice),
      0,
    );
  }, [invoices]);

  const pendingMatchCount = invoices.filter(
    (invoice) =>
      invoice.matchStatus === "pending" ||
      invoice.matchStatus === "discrepancy",
  ).length;
  const overdueCount = invoices.filter(isInvoiceOverdue).length;
  const paidCount = invoices.filter(
    (invoice) => invoice.paymentStatus === "paid",
  ).length;

  const showEmptyResults =
    filteredInvoices.length === 0 &&
    (search.trim().length > 0 ||
      supplierFilter !== ALL_FILTER_VALUE ||
      matchStatusFilter !== ALL_FILTER_VALUE ||
      paymentStatusFilter !== ALL_FILTER_VALUE ||
      showOnlyOverdue);

  return (
    <div className="space-y-6">
      <Card className="border-border/70">
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1.5">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Công nợ NCC
            </p>
            <div className="space-y-1">
              <CardTitle className="text-3xl">
                {tRoute("/inventory/supplier-invoices", "heading")}
              </CardTitle>
              <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
                Theo dõi đối soát 3-way, hạn thanh toán và công nợ phải trả cho từng hóa đơn NCC.
              </p>
            </div>
          </div>
          <Button type="button" disabled>
            Tạo hóa đơn NCC
          </Button>
        </CardHeader>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Chờ đối soát", value: String(pendingMatchCount) },
          { label: "Quá hạn chưa trả", value: String(overdueCount) },
          { label: "Đã thanh toán đủ", value: String(paidCount) },
          { label: "Công nợ còn lại", value: `${formatVND(totalOutstanding)}đ` },
        ].map((item) => (
          <Card key={item.label} className="border-border/70">
            <CardContent className="space-y-3 p-5">
              <p className="truncate text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                {item.label}
              </p>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-semibold tracking-tight">{item.value}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,1fr)]">
        <Card className="border-border/70">
          <CardContent className="space-y-4 p-4 md:p-6">
            <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_220px_220px_220px]">
              <div className="flex h-11 items-center gap-3 rounded-lg border border-input bg-background px-3">
                <Search className="size-4 shrink-0 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Tìm số hóa đơn, NCC hoặc mã GRN"
                  className="h-auto border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
                />
              </div>

              <Select value={supplierFilter} onValueChange={setSupplierFilter}>
                <SelectTrigger className="h-11">
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
                <SelectTrigger className="h-11">
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
                <SelectTrigger className="h-11">
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
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
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
              <p className="text-sm text-muted-foreground">
                {filteredInvoices.length} / {invoices.length} hóa đơn
              </p>
            </div>

            {isMobile ? (
              <div className="space-y-3">
                {filteredInvoices.length === 0 ? (
                  <EmptyStatePanel
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
                    <Card
                      key={invoice.id}
                      className={cn(
                        "border-border/70",
                        isActive && "border-primary/40 shadow-md",
                      )}
                    >
                      <CardContent className="space-y-4 p-4">
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
                            <Badge variant={getInventoryStatusBadgeVariant("overdue")}>
                              {getInventoryStatusLabel("overdue")}
                            </Badge>
                          ) : null}
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <Badge variant={getInventoryStatusBadgeVariant(invoice.matchStatus)}>
                            {getInventoryStatusLabel(invoice.matchStatus)}
                          </Badge>
                          <Badge variant={getInventoryStatusBadgeVariant(invoice.paymentStatus)}>
                            {getInventoryStatusLabel(invoice.paymentStatus)}
                          </Badge>
                        </div>

                        <div className="grid gap-2 text-sm">
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
                          className="w-full"
                          onClick={() => setSelectedInvoiceId(invoice.id)}
                        >
                          {isActive ? "Đang xem phân tích" : "Xem phân tích"}
                        </Button>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-border/70">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/20 hover:bg-muted/20">
                      <TableHead className="min-w-40">Số hóa đơn</TableHead>
                      <TableHead className="min-w-52">Nhà cung cấp</TableHead>
                      <TableHead className="min-w-44">Ngày / hạn</TableHead>
                      <TableHead className="min-w-36">Đối soát</TableHead>
                      <TableHead className="min-w-36">Thanh toán</TableHead>
                      <TableHead className="min-w-32 text-right">
                        Còn lại
                      </TableHead>
                      <TableHead className="w-28 text-right">Thao tác</TableHead>
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
                          className={cn(
                            "hover:bg-muted/20",
                            isActive && "bg-primary/5",
                          )}
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
                            <Badge variant={getInventoryStatusBadgeVariant(invoice.matchStatus)}>
                              {getInventoryStatusLabel(invoice.matchStatus)}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-2">
                              <Badge variant={getInventoryStatusBadgeVariant(invoice.paymentStatus)}>
                                {getInventoryStatusLabel(invoice.paymentStatus)}
                              </Badge>
                              {overdue ? (
                                <Badge variant={getInventoryStatusBadgeVariant("overdue")}>
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
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/70">
          <CardHeader className="space-y-3 border-b border-border/70">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <CardTitle className="text-xl">
                  {selectedInvoice?.code ?? "Chưa chọn hóa đơn"}
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  {selectedInvoice?.supplierName ??
                    "Chọn một hóa đơn để xem phân tích công nợ và đối soát."}
                </p>
              </div>
              {selectedInvoice ? (
                <div className="flex flex-wrap justify-end gap-2">
                  <Badge variant={getInventoryStatusBadgeVariant(selectedInvoice.matchStatus)}>
                    {getInventoryStatusLabel(selectedInvoice.matchStatus)}
                  </Badge>
                  <Badge variant={getInventoryStatusBadgeVariant(selectedInvoice.paymentStatus)}>
                    {getInventoryStatusLabel(selectedInvoice.paymentStatus)}
                  </Badge>
                </div>
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="space-y-5 p-4 md:p-6">
            {selectedInvoice ? (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border border-border/70 bg-muted/20 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Tổng hóa đơn
                    </p>
                    <p className="mt-2 font-mono text-xl font-semibold">
                      {formatVND(selectedInvoice.amount)}đ
                    </p>
                  </div>
                  <div className="rounded-lg border border-border/70 bg-muted/20 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Còn phải trả
                    </p>
                    <p className="mt-2 font-mono text-xl font-semibold">
                      {formatVND(getOutstandingAmount(selectedInvoice))}đ
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-border/70 px-4 py-3">
                    <span className="text-sm text-muted-foreground">
                      Ngày hóa đơn
                    </span>
                    <span className="text-sm font-medium">
                      {formatDate(selectedInvoice.invoiceDate)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-border/70 px-4 py-3">
                    <span className="text-sm text-muted-foreground">
                      Hạn thanh toán
                    </span>
                    <span
                      className={cn(
                        "text-sm font-medium",
                        isInvoiceOverdue(selectedInvoice) && "text-destructive",
                      )}
                    >
                      {formatDate(selectedInvoice.dueDate)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-border/70 px-4 py-3">
                    <span className="text-sm text-muted-foreground">
                      Đã thanh toán
                    </span>
                    <span className="text-sm font-medium">
                      {formatVND(selectedInvoice.paidAmount)}đ
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-border/70 px-4 py-3">
                    <span className="text-sm text-muted-foreground">
                      GRN liên kết
                    </span>
                    <span className="text-sm font-medium">
                      {selectedInvoice.grnCode ?? "Chưa liên kết"}
                    </span>
                  </div>
                </div>

                {selectedInvoice.variance !== null &&
                selectedInvoice.variance > 0 ? (
                  <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
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
                  <div className="rounded-lg border border-success/30 bg-success/5 p-4">
                    <div className="flex items-start gap-3">
                      <CheckCircle2 className="mt-0.5 size-4 text-success" />
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-success">
                          Hóa đơn đang ở ngưỡng an toàn để xử lý tiếp
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Không có cảnh báo chênh lệch lớn trên dữ liệu hiện tại.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <EmptyStatePanel
                title="Chưa có hóa đơn để phân tích"
                description="Chọn một hóa đơn từ danh sách bên trái để xem chi tiết công nợ và trạng thái đối soát."
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
