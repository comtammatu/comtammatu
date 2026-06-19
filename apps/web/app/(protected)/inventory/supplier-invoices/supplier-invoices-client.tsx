"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import type { UseFormReturn } from "react-hook-form";
import { z } from "zod";
import {
  TriangleAlert as IconAlertTriangle,
  CircleCheck as IconCircleCheck,
  Search as IconSearch,
} from "lucide-react";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  InputGroup,
  InputGroupAddon,
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
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import { InteractiveCard } from "@/components/data-table/interactive-card";
import { cn } from "@comtammatu/ui";
import {
  BusinessDateField,
  Combobox,
  FormDialog,
  MoneyVndField,
  NumberField,
  SelectField,
  TextareaField,
  TextField,
} from "@/components/form";
import { matchesSearch } from "@lib/search";
import {
  AppEmptyState,
  AppPage,
  AppPageHeader,
  AppSection,
  AppToolbar,
} from "@/components/surface";
import {
  createSupplierInvoice,
  fetchSupplierInvoices,
  fetchSupplierInvoicesPage,
  recomputeInvoiceMatching,
} from "../procurement-actions";
import type { SupplierInvoiceCursor } from "../procurement-actions";
import { StatusBadge } from "../_components/status-badge";

import { formatVND } from "../_lib/format";
import { getInventoryStatusLabel } from "../_lib/ui";
import { messages } from "@lib/messages";

import { ACTIONS_VI, FORM_VI, STATES_VI } from "@comtammatu/shared/messages";
import {
  diffVNDateDays,
  formatVNBusinessDate,
  getVNDateString,
} from "@comtammatu/shared/time";
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

export function mapSupplierInvoiceRow(
  row: Record<string, unknown>,
): SupplierInvoiceRow {
  return {
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
  };
}

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

const MATCH_FILTER_OPTIONS = [
  "pending",
  "matched",
  "discrepancy",
  "approved",
].map((value) => ({
  value,
  label: getInventoryStatusLabel(value),
}));

const PAYMENT_FILTER_OPTIONS = ["unpaid", "partial", "paid"].map((value) => ({
  value,
  label: getInventoryStatusLabel(value),
}));

const supplierInvoiceSchema = z.object({
  grnId: z.string(),
  supplierId: z.string().min(1, { error: FORM_VI.required }),
  invoiceNumber: z.string().trim().min(1, { error: FORM_VI.required }),
  invoiceDate: z.string().min(1, { error: FORM_VI.required }),
  subtotal: z.string().refine((value) => Number(value) > 0, {
    error: FORM_VI.required,
  }),
  vatRate: z.string().refine(
    (value) => {
      const numericValue = Number(value || 0);
      return Number.isFinite(numericValue) && numericValue >= 0;
    },
    { error: FORM_VI.required },
  ),
  matchingNotes: z.string().trim().optional(),
});

type SupplierInvoiceFormValues = z.infer<typeof supplierInvoiceSchema>;

function createSupplierInvoiceDefaultValues(): SupplierInvoiceFormValues {
  return {
    grnId: "none",
    supplierId: "",
    invoiceNumber: "",
    invoiceDate: getVNDateString(),
    subtotal: "",
    vatRate: "8",
    matchingNotes: "",
  };
}

function formatDate(value: string | null) {
  if (!value) return "Chưa có";
  return formatVNBusinessDate(value);
}

function getOutstandingAmount(invoice: SupplierInvoiceRow) {
  return Math.max(invoice.amount - invoice.paidAmount, 0);
}

function isInvoiceOverdue(invoice: SupplierInvoiceRow) {
  if (!invoice.dueDate || invoice.paymentStatus === "paid") {
    return false;
  }

  return diffVNDateDays(invoice.dueDate, getVNDateString()) > 0;
}

function SupplierInvoiceCreateFields({
  form,
  suppliers,
  grns,
  copy,
}: {
  form: UseFormReturn<
    SupplierInvoiceFormValues,
    unknown,
    SupplierInvoiceFormValues
  >;
  suppliers: SupplierOption[];
  grns: GrnOption[];
  copy: typeof messages.inventory.supplierInvoices;
}) {
  const grnId = form.watch("grnId");
  const subtotal = form.watch("subtotal");
  const vatRate = form.watch("vatRate");
  const selectedGrn =
    grnId !== "none"
      ? (grns.find((option) => option.id === Number(grnId)) ?? null)
      : null;
  const numericSubtotal = Number(subtotal || 0);
  const numericVatRate = Number(vatRate || 0);
  const vatAmount = Math.round(numericSubtotal * numericVatRate) / 100;
  const totalAmount = numericSubtotal + vatAmount;

  useEffect(() => {
    if (!selectedGrn) {
      return;
    }

    const nextSupplierId = String(selectedGrn.supplierId);
    if (form.getValues("supplierId") === nextSupplierId) {
      return;
    }

    form.setValue("supplierId", nextSupplierId, {
      shouldDirty: true,
      shouldValidate: true,
    });
  }, [form, selectedGrn]);

  const grnOptions = useMemo(
    () => [
      { value: "none", label: copy.noLinkedGrn },
      ...grns.map((option) => ({
        value: String(option.id),
        label: `${option.code} · ${option.supplierName}`,
      })),
    ],
    [copy.noLinkedGrn, grns],
  );
  const supplierOptions = useMemo(
    () =>
      suppliers.map((option) => ({
        value: String(option.id),
        label: option.name,
      })),
    [suppliers],
  );

  return (
    <>
      <SelectField
        control={form.control}
        name="grnId"
        label={copy.linkedGrn}
        options={grnOptions}
        placeholder={copy.chooseGrnOptional}
      />
      <SelectField
        control={form.control}
        name="supplierId"
        label={copy.supplier}
        options={supplierOptions}
        placeholder={copy.chooseSupplier}
        disabled={selectedGrn != null}
        required
      />
      <TextField
        control={form.control}
        name="invoiceNumber"
        label={copy.invoiceNumber}
        placeholder="INV-2026-001"
        required
      />
      <BusinessDateField
        control={form.control}
        name="invoiceDate"
        label={copy.invoiceDate}
        required
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <MoneyVndField
          control={form.control}
          name="subtotal"
          label={FORM_VI.subtotal}
          placeholder={copy.subtotalPlaceholder}
          required
        />
        <NumberField
          control={form.control}
          name="vatRate"
          label={`${copy.vat} %`}
          maxFractionDigits={1}
          placeholder="8"
          required
        />
      </div>
      <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-sm">
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">{copy.vat}</span>
          <span className="font-mono tabular-nums">
            {messages.inventory.common.currencyCompact(formatVND(vatAmount))}
          </span>
        </div>
        <div className="mt-2 flex items-center justify-between gap-3">
          <span className="text-muted-foreground">{FORM_VI.totalAmount}</span>
          <span className="font-mono font-semibold tabular-nums">
            {messages.inventory.common.currencyCompact(formatVND(totalAmount))}
          </span>
        </div>
      </div>
      <TextareaField
        control={form.control}
        name="matchingNotes"
        label={copy.matchingNotes}
        rows={3}
        placeholder={copy.matchingNotesPlaceholder}
      />
    </>
  );
}

export function SupplierInvoicesClient({
  invoices,
  suppliers,
  grns,
  initialHasMore = false,
  initialNextCursor = null,
  branchId,
}: {
  invoices: SupplierInvoiceRow[];
  suppliers: SupplierOption[];
  grns: GrnOption[];
  initialHasMore?: boolean;
  initialNextCursor?: SupplierInvoiceCursor | null;
  branchId?: number;
}) {
  const [rows, setRows] = useState(invoices);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [nextCursor, setNextCursor] = useState<SupplierInvoiceCursor | null>(
    initialNextCursor,
  );
  const [loadingMore, setLoadingMore] = useState(false);
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
  const [isPending, startTransition] = useTransition();
  const copy = messages.inventory.supplierInvoices;
  const createDefaultValues = useMemo(
    () => createSupplierInvoiceDefaultValues(),
    [createOpen],
  );

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

  async function reloadInvoices(nextSelectedId?: number | null) {
    const again = await fetchSupplierInvoices();
    if (!again.success) return;

    const nextRows = ((again.data ?? []) as Array<Record<string, unknown>>).map(
      mapSupplierInvoiceRow,
    );

    setRows(nextRows);
    // Full reload returns every invoice, so keyset paging no longer applies.
    setHasMore(false);
    setNextCursor(null);
    if (typeof nextSelectedId === "number") {
      setSelectedInvoiceId(nextSelectedId);
    }
  }

  function handleLoadMore() {
    if (loadingMore || !hasMore || !nextCursor) return;
    setLoadingMore(true);
    startTransition(async () => {
      try {
        const result = await fetchSupplierInvoicesPage({
          branchId,
          before: nextCursor,
        });
        if (!result.success || !result.data) {
          toast.error(result.error ?? copy.loadMoreFailed);
          return;
        }
        const { items, hasMore: more, nextCursor: cursor } = result.data;
        const mapped = (items as Array<Record<string, unknown>>).map(
          mapSupplierInvoiceRow,
        );
        setRows((prev) => {
          const seen = new Set(prev.map((row) => row.id));
          const next = mapped.filter((row) => !seen.has(row.id));
          return [...prev, ...next];
        });
        setHasMore(more);
        setNextCursor(cursor);
      } finally {
        setLoadingMore(false);
      }
    });
  }

  async function handleCreateInvoice(values: SupplierInvoiceFormValues) {
    const selectedGrn =
      values.grnId !== "none"
        ? (grns.find((option) => option.id === Number(values.grnId)) ?? null)
        : null;
    const resolvedSupplierId =
      selectedGrn?.supplierId ?? Number(values.supplierId || 0);
    const numericSubtotal = Number(values.subtotal || 0);
    const numericVatRate = Number(values.vatRate || 0);
    const vatAmount = Math.round(numericSubtotal * numericVatRate) / 100;
    const totalAmount = numericSubtotal + vatAmount;
    const res = await createSupplierInvoice({
      supplierId: resolvedSupplierId,
      grnId: selectedGrn?.id ?? null,
      invoiceNumber: values.invoiceNumber.trim(),
      invoiceDate: values.invoiceDate,
      subtotal: numericSubtotal,
      vatRate: numericVatRate,
      vatAmount,
      totalAmount,
      matchingNotes: values.matchingNotes?.trim() || undefined,
    });

    if (res.success && res.data) {
      const created = res.data as { id: number };
      await reloadInvoices(created.id);
    }

    return res;
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

  const renderInvoiceCard = (invoice: SupplierInvoiceRow) => {
    const outstandingAmount = getOutstandingAmount(invoice);
    const overdue = isInvoiceOverdue(invoice);
    const isActive = selectedInvoice?.id === invoice.id;

    return (
      <InteractiveCard
        asChild
        minHeight="mobile"
        padding="default"
        className={cn(
          "flex-col items-stretch gap-3 text-left",
          isActive && "border-primary/40 bg-primary/5 ring-2 ring-primary/40",
        )}
      >
        <button
          type="button"
          onClick={() => setSelectedInvoiceId(invoice.id)}
          aria-pressed={isActive}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-1">
              <p className="font-mono text-base font-semibold">
                {invoice.code}
              </p>
              <p className="truncate text-sm text-muted-foreground">
                {invoice.supplierName}
              </p>
            </div>
            {overdue ? <StatusBadge status="overdue" /> : null}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <StatusBadge status={invoice.matchStatus} />
            <StatusBadge status={invoice.paymentStatus} />
          </div>

          <div className="mt-4 grid gap-2 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">{copy.invoiceDate}</span>
              <span>{formatDate(invoice.invoiceDate)}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">{copy.dueDate}</span>
              <span>{formatDate(invoice.dueDate)}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">{copy.remaining}</span>
              <span className="font-mono font-semibold">
                {messages.inventory.common.currencyCompact(
                  formatVND(outstandingAmount),
                )}
              </span>
            </div>
          </div>

          <span className="mt-4 text-sm font-medium text-primary">
            {isActive ? copy.analyzing : copy.viewAnalysis}
          </span>
        </button>
      </InteractiveCard>
    );
  };

  const invoiceColumns: DataTableColumn<SupplierInvoiceRow>[] = [
    {
      key: "code",
      header: copy.invoiceNumber,
      className: "min-w-40",
      render: (invoice) => (
        <div className="flex flex-col gap-1">
          <p className="font-mono font-semibold text-foreground">
            {invoice.code}
          </p>
          {invoice.grnCode ? (
            <p className="text-xs text-muted-foreground">
              GRN: {invoice.grnCode}
            </p>
          ) : null}
        </div>
      ),
    },
    {
      key: "supplier",
      header: copy.supplier,
      className: "min-w-52",
      render: (invoice) => (
        <span className="text-muted-foreground">{invoice.supplierName}</span>
      ),
    },
    {
      key: "dateDue",
      header: copy.dateDue,
      className: "min-w-44",
      render: (invoice) => (
        <div className="flex flex-col gap-1 text-sm">
          <p>{formatDate(invoice.invoiceDate)}</p>
          <p
            className={cn(
              "text-muted-foreground",
              isInvoiceOverdue(invoice) && "font-medium text-destructive",
            )}
          >
            {copy.duePrefix(formatDate(invoice.dueDate))}
          </p>
        </div>
      ),
    },
    {
      key: "matchStatus",
      header: copy.matchingPlaceholder,
      className: "min-w-36",
      render: (invoice) => <StatusBadge status={invoice.matchStatus} />,
    },
    {
      key: "paymentStatus",
      header: copy.paymentPlaceholder,
      className: "min-w-36",
      render: (invoice) => (
        <div className="flex flex-wrap gap-2">
          <StatusBadge status={invoice.paymentStatus} />
          {isInvoiceOverdue(invoice) ? <StatusBadge status="overdue" /> : null}
        </div>
      ),
    },
    {
      key: "remaining",
      header: copy.remaining,
      className: "min-w-32 text-right",
      render: (invoice) => (
        <span className="font-mono font-semibold">
          {messages.inventory.common.currencyCompact(
            formatVND(getOutstandingAmount(invoice)),
          )}
        </span>
      ),
    },
    {
      key: "action",
      header: FORM_VI.action,
      className: "w-28 text-right",
      render: (invoice) => (
        <Button
          type="button"
          size="sm"
          variant={selectedInvoice?.id === invoice.id ? "default" : "outline"}
          onClick={() => setSelectedInvoiceId(invoice.id)}
        >
          {selectedInvoice?.id === invoice.id
            ? copy.analyzingShort
            : copy.analysis}
        </Button>
      ),
    },
  ];

  return (
    <AppPage width="full">
      <AppPageHeader
        eyebrow="Kho hàng"
        title={copy.title}
        actions={
          <Button type="button" onClick={() => setCreateOpen(true)}>
            {copy.createAction}
          </Button>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,1fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          <AppToolbar
            search={
              <InputGroup className="min-w-0 flex-1">
                <InputGroupAddon>
                  <IconSearch />
                </InputGroupAddon>
                <InputGroupInput
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={copy.searchPlaceholder}
                />
              </InputGroup>
            }
            filters={
              <>
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
                  triggerClassName="w-48"
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
                    {MATCH_FILTER_OPTIONS.map((option) => (
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
                    {PAYMENT_FILTER_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            }
            actions={
              <Button
                type="button"
                size="sm"
                variant={showOnlyOverdue ? "default" : "outline"}
                onClick={() => setShowOnlyOverdue((current) => !current)}
                aria-pressed={showOnlyOverdue}
              >
                <IconAlertTriangle data-icon="inline-start" />
                {copy.overdueOnly}
              </Button>
            }
          />

          <AppSection
            title={copy.title}
            headerHint={copy.invoiceCount(filteredInvoices.length, rows.length)}
            contentFlush
          >
            <DataTable
              columns={invoiceColumns}
              data={filteredInvoices}
              getRowKey={(invoice) => invoice.id}
              emptyTitle={
                showEmptyResults
                  ? copy.emptyMatchedTitle
                  : copy.emptyInitialTitle
              }
              emptyDescription={
                showEmptyResults
                  ? copy.emptyMatchedDescription
                  : copy.emptyInitialDescription
              }
              emptyMode={showEmptyResults ? "no-results" : "no-data"}
              onRowClick={(invoice) => setSelectedInvoiceId(invoice.id)}
              getRowAriaLabel={(invoice) => `${copy.analysis}: ${invoice.code}`}
              getRowDataState={(invoice) =>
                selectedInvoice?.id === invoice.id ? "selected" : undefined
              }
              mobileCardRender={renderInvoiceCard}
            />
            {hasMore ? (
              <div className="flex justify-center p-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                >
                  {copy.loadMore}
                </Button>
              </div>
            ) : null}
          </AppSection>
        </div>

        <AppSection
          title={selectedInvoice?.code ?? copy.noInvoiceSelected}
          action={
            selectedInvoice ? (
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
                <StatusBadge status={selectedInvoice.matchStatus} />
                <StatusBadge status={selectedInvoice.paymentStatus} />
              </div>
            ) : null
          }
        >
          {selectedInvoice ? (
            <div className="flex flex-col gap-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border bg-muted/30 p-3">
                  <Badge variant="secondary">{copy.totalInvoice}</Badge>
                  <p className="mt-2 font-mono text-xl font-semibold tabular-nums">
                    {messages.inventory.common.currencyCompact(
                      formatVND(selectedInvoice.amount),
                    )}
                  </p>
                </div>
                <div className="rounded-lg border bg-muted/30 p-3">
                  <Badge variant="secondary">{copy.outstandingPayable}</Badge>
                  <p className="mt-2 font-mono text-xl font-semibold tabular-nums">
                    {messages.inventory.common.currencyCompact(
                      formatVND(getOutstandingAmount(selectedInvoice)),
                    )}
                  </p>
                </div>
              </div>

              <dl className="grid gap-2">
                <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 px-3 py-2">
                  <dt className="text-sm text-muted-foreground">
                    {copy.invoiceDate}
                  </dt>
                  <dd className="text-sm font-medium">
                    {formatDate(selectedInvoice.invoiceDate)}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 px-3 py-2">
                  <dt className="text-sm text-muted-foreground">
                    {copy.dueDate}
                  </dt>
                  <dd
                    className={cn(
                      "text-sm font-medium",
                      isInvoiceOverdue(selectedInvoice) && "text-destructive",
                    )}
                  >
                    {formatDate(selectedInvoice.dueDate)}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 px-3 py-2">
                  <dt className="text-sm text-muted-foreground">
                    {copy.paidAmount}
                  </dt>
                  <dd className="font-mono text-sm font-medium tabular-nums">
                    {messages.inventory.common.currencyCompact(
                      formatVND(selectedInvoice.paidAmount),
                    )}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 px-3 py-2">
                  <dt className="text-sm text-muted-foreground">
                    {copy.linkedGrn}
                  </dt>
                  <dd className="text-sm font-medium">
                    {selectedInvoice.grnCode ?? copy.notLinked}
                  </dd>
                </div>
              </dl>

              {selectedInvoice.variance !== null &&
              selectedInvoice.variance > 0 ? (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                  <div className="flex items-start gap-3">
                    <IconAlertTriangle className="mt-0.5 size-4 text-destructive" />
                    <div className="flex flex-col gap-1">
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
                <div className="rounded-lg border border-success/30 bg-success/5 p-3">
                  <div className="flex items-start gap-3">
                    <IconCircleCheck className="mt-0.5 size-4 text-success" />
                    <div className="flex flex-col gap-1">
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
            <AppEmptyState
              compact
              title={copy.noAnalysisTitle}
              description={copy.noAnalysisDescription}
            />
          )}
        </AppSection>
      </div>

      <FormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        schema={supplierInvoiceSchema}
        defaultValues={createDefaultValues}
        entityKey="new-supplier-invoice"
        title={copy.createAction}
        submitLabel={copy.saveInvoice}
        cancelLabel={ACTIONS_VI.cancel}
        successMessage={STATES_VI.saved}
        contentClassName="sm:max-w-2xl"
        onSubmit={handleCreateInvoice}
      >
        {(form) => (
          <SupplierInvoiceCreateFields
            form={form}
            suppliers={suppliers}
            grns={grns}
            copy={copy}
          />
        )}
      </FormDialog>
    </AppPage>
  );
}
