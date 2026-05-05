"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { TriangleAlert as IconAlertTriangle, CircleCheck as IconCircleCheck, Search as IconSearch } from "lucide-react";
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
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@comtammatu/ui/components/empty";
import { Input } from "@comtammatu/ui/components/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@comtammatu/ui/components/input-group";
import { Label } from "@comtammatu/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { Textarea } from "@comtammatu/ui/components/textarea";
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
import { Combobox } from "@/components/form";
import { matchesSearch } from "@lib/search";
import { FormattedNumberInput } from "../_components/formatted-number-input";
import { InventoryHeader } from "../_components/inventory-header";
import { TableEmptyStateRow } from "../_components/table-empty-state-row";
import {
  createSupplierInvoice,
  fetchSupplierInvoices,
  recomputeInvoiceMatching,
} from "../procurement-actions";


import { formatVND } from "../_lib/format";
import {
  getInventoryStatusBadgeVariant,
  getInventoryStatusLabel,
} from "../_lib/ui";
import { messages } from "@lib/messages";

import { ACTIONS_VI, FORM_VI } from "@comtammatu/shared/messages";
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
  const [supplierId, setSupplierId] = useState("");
  const [grnId, setGrnId] = useState("none");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [subtotal, setSubtotal] = useState("");
  const [vatRate, setVatRate] = useState("8");
  const [matchingNotes, setMatchingNotes] = useState("");
  const [isPending, startTransition] = useTransition();
  const isMobile = useIsMobile();
  const copy = messages.inventory.supplierInvoices;

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
    const query = search.trim();

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

      return matchesSearch(
        [invoice.code, invoice.supplierName, invoice.grnCode],
        query,
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

  function resetCreateForm() {
    setSupplierId("");
    setGrnId("none");
    setInvoiceNumber("");
    setInvoiceDate(new Date().toISOString().slice(0, 10));
    setSubtotal("");
    setVatRate("8");
    setMatchingNotes("");
  }

  useEffect(() => {
    if (createOpen) {
      return;
    }

    resetCreateForm();
  }, [createOpen]);

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

  return (
    <>
      <InventoryHeader
        title={copy.title}
        actions={
          <Button type="button" onClick={() => setCreateOpen(true)}>
            {copy.createAction}
          </Button>
        }
      />
      <div className="flex-1 overflow-auto p-4">
      <div className="mx-auto max-w-7xl space-y-4">

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,1fr)]">
          {/* IconSearch + filters */}
          <Card className="py-0"><CardContent className="flex flex-wrap items-center gap-3 p-3">
            <InputGroup className="h-10 flex-1">
              <InputGroupAddon>
                <IconSearch />
              </InputGroupAddon>
              <InputGroupInput
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={copy.searchPlaceholder}
              />
            </InputGroup>

            <Combobox
              value={supplierFilter}
              onValueChange={setSupplierFilter}
              options={[
                { value: ALL_FILTER_VALUE, label: copy.allSuppliers },
                ...supplierOptions,
              ]}
              placeholder={copy.supplierPlaceholder}
              searchPlaceholder={copy.supplierSearchPlaceholder}
              aria-label={copy.supplierFilterAria}
              triggerClassName="h-10 w-48"
            />

            <Select
              value={matchStatusFilter}
              onValueChange={setMatchStatusFilter}
            >
              <SelectTrigger className="w-48">
                <SelectValue placeholder={copy.matchingPlaceholder} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_FILTER_VALUE}>
                  {copy.allMatching}
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
              <SelectTrigger className="w-48">
                <SelectValue placeholder={copy.paymentPlaceholder} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_FILTER_VALUE}>
                  {copy.allPayments}
                </SelectItem>
                {PAYMENT_STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent></Card>

          {/* Table */}
          <Card>
            <CardContent className="p-0">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <Button
                  type="button"
                  size="sm"
                  variant={showOnlyOverdue ? "default" : "outline"}
                  onClick={() => setShowOnlyOverdue((current) => !current)}
                  aria-pressed={showOnlyOverdue}
                >
                  <IconAlertTriangle className="size-4" />
                  {copy.overdueOnly}
                </Button>
                <Badge variant="outline" className="rounded-full">
                  {copy.invoiceCount(filteredInvoices.length, rows.length)}
                </Badge>
              </div>

              {isMobile ? (
                <div className="space-y-3">
                  {filteredInvoices.length === 0 ? (
                    <Card>
                      <CardContent className="py-10 text-center">
                        <p className="text-base font-semibold">
                          {showEmptyResults
                            ? copy.emptyMatchedTitle
                            : copy.emptyInitialTitle}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {showEmptyResults
                            ? copy.emptyMatchedDescription
                            : copy.emptyInitialDescription}
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
                              {copy.invoiceDate}
                            </span>
                            <span>{formatDate(invoice.invoiceDate)}</span>
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-muted-foreground">
                              {copy.dueDate}
                            </span>
                            <span>{formatDate(invoice.dueDate)}</span>
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-muted-foreground">
                              {copy.remaining}
                            </span>
                            <span className="font-mono font-semibold">
                              {messages.inventory.common.currencyCompact(
                                formatVND(outstandingAmount),
                              )}
                            </span>
                          </div>
                        </div>

                        <Button
                          type="button"
                          variant={isActive ? "default" : "outline"}
                          className="mt-4 w-full"
                          onClick={() => setSelectedInvoiceId(invoice.id)}
                        >
                          {isActive ? copy.analyzing : copy.viewAnalysis}
                        </Button>
                      </CardContent></Card>
                    );
                  })}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-40">
                        {copy.invoiceNumber}
                      </TableHead>
                      <TableHead className="min-w-52">
                        {copy.supplier}
                      </TableHead>
                      <TableHead className="min-w-44">
                        {copy.dateDue}
                      </TableHead>
                      <TableHead className="min-w-36">
                        {copy.matchingPlaceholder}
                      </TableHead>
                      <TableHead className="min-w-36">
                        {copy.paymentPlaceholder}
                      </TableHead>
                      <TableHead className="min-w-32 text-right">
                        {copy.remaining}
                      </TableHead>
                      <TableHead className="w-28 text-right">
                        {FORM_VI.action}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredInvoices.length === 0 ? (
                      <TableEmptyStateRow
                        colSpan={7}
                        title={
                          showEmptyResults
                            ? copy.emptyMatchedTitle
                            : copy.emptyInitialTitle
                        }
                        description={
                          showEmptyResults
                            ? copy.emptyMatchedDescription
                            : copy.emptyInitialDescription
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
                                {copy.duePrefix(formatDate(invoice.dueDate))}
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
                            {messages.inventory.common.currencyCompact(
                              formatVND(outstandingAmount),
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              type="button"
                              size="sm"
                              variant={isActive ? "default" : "outline"}
                              onClick={() => setSelectedInvoiceId(invoice.id)}
                            >
                              {isActive ? copy.analyzingShort : copy.analysis}
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
                <CardTitle>
                {selectedInvoice?.code ?? copy.noInvoiceSelected}
              </CardTitle>
              {selectedInvoice ? (
                <div className="flex flex-wrap justify-end gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={handleRecomputeMatching}
                    disabled={isPending}
                  >
                    {copy.recomputeMatching}
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
                        {copy.totalInvoice}
                      </Badge>
                      <p className="mt-2 font-mono text-xl font-semibold">
                        {messages.inventory.common.currencyCompact(
                          formatVND(selectedInvoice.amount),
                        )}
                      </p>
                    </CardContent></Card>
                    <Card className="bg-muted/30"><CardContent>
                      <Badge variant="secondary">
                        {copy.outstandingPayable}
                      </Badge>
                      <p className="mt-2 font-mono text-xl font-semibold">
                        {messages.inventory.common.currencyCompact(
                          formatVND(getOutstandingAmount(selectedInvoice)),
                        )}
                      </p>
                    </CardContent></Card>
                  </div>

                  <div className="space-y-3">
                    <Card className="bg-muted/30 py-0"><CardContent className="flex items-center justify-between gap-3 px-4 py-3">
                      <span className="text-sm text-muted-foreground">
                        {copy.invoiceDate}
                      </span>
                      <span className="text-sm font-medium">
                        {formatDate(selectedInvoice.invoiceDate)}
                      </span>
                    </CardContent></Card>
                    <Card className="bg-muted/30 py-0"><CardContent className="flex items-center justify-between gap-3 px-4 py-3">
                      <span className="text-sm text-muted-foreground">
                        {copy.dueDate}
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
                        {copy.paidAmount}
                      </span>
                      <span className="text-sm font-medium">
                        {messages.inventory.common.currencyCompact(
                          formatVND(selectedInvoice.paidAmount),
                        )}
                      </span>
                    </CardContent></Card>
                    <Card className="bg-muted/30 py-0"><CardContent className="flex items-center justify-between gap-3 px-4 py-3">
                      <span className="text-sm text-muted-foreground">
                        {copy.linkedGrn}
                      </span>
                      <span className="text-sm font-medium">
                        {selectedInvoice.grnCode ?? copy.notLinked}
                      </span>
                    </CardContent></Card>
                  </div>

                  {selectedInvoice.variance !== null &&
                  selectedInvoice.variance > 0 ? (
                    <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4">
                      <div className="flex items-start gap-3">
                        <IconAlertTriangle className="mt-0.5 size-4 text-destructive" />
                        <div className="space-y-1">
                          <p className="text-sm font-semibold text-destructive">
                            {copy.varianceTitle(selectedInvoice.variance)}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {copy.varianceDescription}
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-success/30 bg-success/5 p-4">
                      <div className="flex items-start gap-3">
                        <IconCircleCheck className="mt-0.5 size-4 text-success" />
                        <div className="space-y-1">
                          <p className="text-sm font-semibold text-success">
                            {copy.safeTitle}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {copy.safeDescription}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <Empty className="py-8">
                  <EmptyHeader>
                    <EmptyTitle className="text-sm font-semibold">
                      {copy.noAnalysisTitle}
                    </EmptyTitle>
                    <EmptyDescription className="text-xs leading-5">
                      {copy.noAnalysisDescription}
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{copy.createAction}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label>{copy.linkedGrn}</Label>
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
                  <SelectValue placeholder={copy.chooseGrnOptional} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{copy.noLinkedGrn}</SelectItem>
                  {grns.map((option) => (
                    <SelectItem key={option.id} value={String(option.id)}>
                      {option.code} · {option.supplierName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label>{copy.supplier}</Label>
              <Select value={supplierId} onValueChange={setSupplierId}>
                <SelectTrigger>
                  <SelectValue placeholder={copy.chooseSupplier} />
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
              <Label>{copy.invoiceNumber}</Label>
              <Input
                value={invoiceNumber}
                onChange={(event) => setInvoiceNumber(event.target.value)}
                placeholder="INV-2026-001"
              />
            </div>

            <div className="grid gap-2">
              <Label>{copy.invoiceDate}</Label>
              <Input
                type="date"
                value={invoiceDate}
                onChange={(event) => setInvoiceDate(event.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>{FORM_VI.subtotal}</Label>
                <FormattedNumberInput
                  value={subtotal}
                  onValueChange={setSubtotal}
                  maxFractionDigits={0}
                  placeholder={copy.subtotalPlaceholder}
                />
              </div>
              <div className="grid gap-2">
                <Label>VAT %</Label>
                <FormattedNumberInput
                  value={vatRate}
                  onValueChange={setVatRate}
                  maxFractionDigits={1}
                  placeholder="8"
                />
              </div>
            </div>

            <div className="rounded-2xl border border-border/60 bg-muted/20 px-4 py-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">{copy.vat}</span>
                <span className="font-mono">
                  {messages.inventory.common.currencyCompact(formatVND(vatAmount))}
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between gap-3">
                <span className="text-muted-foreground">{FORM_VI.totalAmount}</span>
                <span className="font-mono font-semibold">
                  {messages.inventory.common.currencyCompact(formatVND(totalAmount))}
                </span>
              </div>
            </div>

            <div className="grid gap-2">
              <Label>{copy.matchingNotes}</Label>
              <Textarea
                value={matchingNotes}
                onChange={(event) => setMatchingNotes(event.target.value)}
                rows={3}
                placeholder={copy.matchingNotesPlaceholder}
                className="min-h-24"
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
              {ACTIONS_VI.cancel}
            </Button>
            <Button
              type="button"
              onClick={handleCreateInvoice}
              disabled={isPending}
            >
              {copy.saveInvoice}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </>
  );
}
