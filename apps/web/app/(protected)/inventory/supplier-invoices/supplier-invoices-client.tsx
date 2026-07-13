"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { UseFormReturn } from "react-hook-form";
import { z } from "zod";
import {
  TriangleAlert as IconAlertTriangle,
  CircleCheck as IconCircleCheck,
  Search as IconSearch,
} from "lucide-react";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@comtammatu/ui/components/alert";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@comtammatu/ui/components/input-group";
import { NoteCallout } from "@comtammatu/ui/components/note-callout";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { toast } from "@comtammatu/ui/components/sonner";
import { KpiCard } from "@/components/kpi/kpi-card";
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
  DescriptionList,
} from "@/components/surface";
import {
  createSupplierInvoice,
  fetchSupplierInvoicesPage,
  recordSupplierPayment,
  recomputeInvoiceMatching,
} from "../procurement-actions";
import type { SupplierInvoiceCursor } from "../procurement-actions";
import {
  getSupplierInvoiceOutstandingAmount,
  mapSupplierInvoiceRow,
  type SupplierInvoiceRow,
} from "./supplier-invoice-row";
import { getStatusBadgeMeta, StatusBadge } from "@/components/status-badge";

import { formatPercent } from "@comtammatu/shared/format";
import { formatVND } from "../_lib/format";
import { messages } from "@lib/messages";

import { ACTIONS_VI, FORM_VI, STATES_VI } from "@comtammatu/shared/messages";
import {
  diffVNDateDays,
  formatVNDate,
  getVNDateString,
} from "@comtammatu/shared/time";
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

type SupplierInvoiceViewMode = "supplier" | "po";

type SupplierInvoiceGroup = {
  id: string;
  title: string;
  subtitle: string;
  invoices: SupplierInvoiceRow[];
  invoiceCount: number;
  totalAmount: number;
  paidAmount: number;
  outstandingAmount: number;
  overdueAmount: number;
  overdueCount: number;
  nextDueDate: string | null;
};

const ALL_FILTER_VALUE = "_all";

const MATCH_FILTER_OPTIONS = [
  "pending",
  "matched",
  "discrepancy",
  "approved",
].map((value) => ({
  value,
  label: getStatusBadgeMeta("inventory", value).label,
}));

const PAYMENT_FILTER_OPTIONS = ["unpaid", "partial", "paid"].map((value) => ({
  value,
  label: getStatusBadgeMeta("inventory", value).label,
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

const supplierPaymentSchema = z.object({
  amount: z.string().refine((value) => Number(value) > 0, {
    error: FORM_VI.required,
  }),
  paymentMethod: z.enum(["cash", "bank_transfer"]),
  referenceNote: z.string().trim().optional(),
});

type SupplierPaymentFormValues = z.infer<typeof supplierPaymentSchema>;

function createSupplierInvoiceDefaultValues(
  preselectGrnId?: number | null,
): SupplierInvoiceFormValues {
  return {
    grnId: preselectGrnId != null ? String(preselectGrnId) : "none",
    supplierId: "",
    invoiceNumber: "",
    invoiceDate: getVNDateString(),
    subtotal: "",
    // HKD does not deduct input VAT by default (einvoice-tax.md §4.1/§4.3) —
    // field stays editable so the actual supplier-charged rate can be recorded.
    vatRate: "0",
    matchingNotes: "",
  };
}

function createSupplierPaymentDefaultValues(
  invoice?: SupplierInvoiceRow | null,
): SupplierPaymentFormValues {
  return {
    amount: invoice ? String(getSupplierInvoiceOutstandingAmount(invoice)) : "",
    paymentMethod: "bank_transfer",
    referenceNote: "",
  };
}

function formatDate(value: string | null) {
  if (!value) return "Chưa có";
  return formatVNDate(value, "Chưa có");
}

function getPrimaryInvoice(group: SupplierInvoiceGroup) {
  return (
    group.invoices.find(
      (invoice) => getSupplierInvoiceOutstandingAmount(invoice) > 0,
    ) ??
    group.invoices[0] ??
    null
  );
}

function sortSupplierInvoices(
  left: SupplierInvoiceRow,
  right: SupplierInvoiceRow,
) {
  const leftDate = left.invoiceDate ?? "";
  const rightDate = right.invoiceDate ?? "";

  if (leftDate !== rightDate) {
    return rightDate.localeCompare(leftDate);
  }

  return right.id - left.id;
}

function isInvoiceOverdue(invoice: SupplierInvoiceRow) {
  if (!invoice.dueDate || invoice.paymentStatus === "paid") {
    return false;
  }

  return diffVNDateDays(invoice.dueDate, getVNDateString()) > 0;
}

function getDisplayMatchStatus(invoice: SupplierInvoiceRow) {
  return invoice.matchStatus === "matched" && invoice.grnId == null
    ? "pending"
    : invoice.matchStatus;
}

function isMissingMatchingEvidence(invoice: SupplierInvoiceRow) {
  return invoice.grnId == null;
}

function getInvoiceAgingLabel(
  invoice: SupplierInvoiceRow,
  copy: typeof messages.inventory.supplierInvoices,
) {
  if (
    invoice.paymentStatus === "paid" ||
    getSupplierInvoiceOutstandingAmount(invoice) <= 0
  ) {
    return copy.agingPaid;
  }
  if (!invoice.dueDate) return copy.agingNoDueDate;

  const days = diffVNDateDays(invoice.dueDate, getVNDateString());
  if (days > 0) return copy.agingOverdue(days);
  if (days === 0) return copy.agingDueToday;
  return copy.agingDueIn(Math.abs(days));
}

function getPaymentMethodLabel(
  method: string,
  copy: typeof messages.inventory.supplierInvoices,
) {
  if (method === "cash" || method === "bank_transfer") {
    return copy.paymentMethods[method];
  }
  return method || copy.unknownPaymentMethod;
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
          placeholder="0"
          required
        />
      </div>
      <NoteCallout tone="muted">
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
      </NoteCallout>
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

function SupplierPaymentFields({
  form,
  copy,
  outstanding,
}: {
  form: UseFormReturn<
    SupplierPaymentFormValues,
    unknown,
    SupplierPaymentFormValues
  >;
  copy: typeof messages.inventory.supplierInvoices;
  outstanding: number;
}) {
  const methodOptions = useMemo(
    () => [
      { value: "bank_transfer", label: copy.paymentMethods.bank_transfer },
      { value: "cash", label: copy.paymentMethods.cash },
    ],
    [copy.paymentMethods.bank_transfer, copy.paymentMethods.cash],
  );

  return (
    <>
      <p className="text-sm font-medium text-muted-foreground">
        {copy.paymentOutstanding(formatVND(outstanding))}
      </p>
      <MoneyVndField
        control={form.control}
        name="amount"
        label={copy.paymentAmount}
        placeholder="0"
        required
      />
      <SelectField
        control={form.control}
        name="paymentMethod"
        label={copy.paymentMethod}
        options={methodOptions}
        required
      />
      <TextareaField
        control={form.control}
        name="referenceNote"
        label={copy.referenceNote}
        rows={3}
        placeholder={copy.referenceNotePlaceholder}
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
  grnBasePath = "/inventory/grn",
  eyebrow = "Kho hàng",
  description,
  canPaySupplier = false,
}: {
  invoices: SupplierInvoiceRow[];
  suppliers: SupplierOption[];
  grns: GrnOption[];
  initialHasMore?: boolean;
  initialNextCursor?: SupplierInvoiceCursor | null;
  branchId?: number;
  grnBasePath?: string;
  eyebrow?: string;
  description?: string;
  canPaySupplier?: boolean;
}) {
  const searchParams = useSearchParams();
  const invoiceIdParam = searchParams.get("invoiceId");
  const grnIdParam = searchParams.get("grnId");
  const preselectInvoiceId = invoiceIdParam ? Number(invoiceIdParam) : null;
  const preselectGrnId = grnIdParam ? Number(grnIdParam) : null;

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
  const [viewMode, setViewMode] = useState<SupplierInvoiceViewMode>("supplier");
  const [showOnlyOverdue, setShowOnlyOverdue] = useState(false);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<number | null>(
    preselectInvoiceId ?? invoices[0]?.id ?? null,
  );
  const [createOpen, setCreateOpen] = useState(
    preselectGrnId != null && preselectInvoiceId == null,
  );
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const copy = messages.inventory.supplierInvoices;
  const createDefaultValues = useMemo(
    () => createSupplierInvoiceDefaultValues(preselectGrnId),
    [createOpen, preselectGrnId],
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
        getDisplayMatchStatus(invoice) !== matchStatusFilter
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
        [invoice.code, invoice.supplierName, invoice.poCode, invoice.grnCode],
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

  const invoiceGroups = useMemo(() => {
    const groups = new Map<string, SupplierInvoiceGroup>();

    for (const invoice of filteredInvoices) {
      const groupId =
        viewMode === "supplier"
          ? `supplier:${invoice.supplierId}`
          : invoice.poId != null
            ? `po:${invoice.poId}`
            : `supplier:${invoice.supplierId}:no-po`;
      let group = groups.get(groupId);

      if (!group) {
        group = {
          id: groupId,
          title:
            viewMode === "supplier"
              ? invoice.supplierName
              : (invoice.poCode ?? copy.noLinkedPo),
          subtitle:
            viewMode === "supplier"
              ? copy.invoiceGroupSummary(0)
              : invoice.supplierName,
          invoices: [],
          invoiceCount: 0,
          totalAmount: 0,
          paidAmount: 0,
          outstandingAmount: 0,
          overdueAmount: 0,
          overdueCount: 0,
          nextDueDate: null,
        };
        groups.set(groupId, group);
      }

      const outstandingAmount = getSupplierInvoiceOutstandingAmount(invoice);
      group.invoices.push(invoice);
      group.invoiceCount += 1;
      group.totalAmount += invoice.amount;
      group.paidAmount += invoice.paidAmount;
      group.outstandingAmount += outstandingAmount;
      if (outstandingAmount > 0 && invoice.dueDate) {
        group.nextDueDate =
          group.nextDueDate == null || invoice.dueDate < group.nextDueDate
            ? invoice.dueDate
            : group.nextDueDate;
      }
      if (isInvoiceOverdue(invoice)) {
        group.overdueCount += 1;
        group.overdueAmount += outstandingAmount;
      }
    }

    return Array.from(groups.values())
      .map((group) => ({
        ...group,
        invoices: [...group.invoices].sort(sortSupplierInvoices),
        subtitle:
          viewMode === "supplier"
            ? copy.invoiceGroupSummary(group.invoiceCount)
            : `${group.subtitle} · ${copy.invoiceGroupSummary(group.invoiceCount)}`,
      }))
      .sort((left, right) => {
        const amountDiff = right.outstandingAmount - left.outstandingAmount;
        if (amountDiff !== 0) {
          return amountDiff;
        }

        return left.title.localeCompare(right.title, "vi");
      });
  }, [copy, filteredInvoices, viewMode]);

  const selectedInvoice =
    filteredInvoices.find((invoice) => invoice.id === selectedInvoiceId) ??
    filteredInvoices[0] ??
    null;
  const selectedOutstandingAmount = selectedInvoice
    ? getSupplierInvoiceOutstandingAmount(selectedInvoice)
    : 0;
  const selectedMissingMatchingEvidence = selectedInvoice
    ? isMissingMatchingEvidence(selectedInvoice)
    : false;
  const paymentDefaultValues = useMemo(
    () => createSupplierPaymentDefaultValues(selectedInvoice),
    [selectedInvoice?.id, selectedOutstandingAmount],
  );

  const showEmptyResults =
    filteredInvoices.length === 0 &&
    (search.trim().length > 0 ||
      supplierFilter !== ALL_FILTER_VALUE ||
      matchStatusFilter !== ALL_FILTER_VALUE ||
      paymentStatusFilter !== ALL_FILTER_VALUE ||
      showOnlyOverdue);

  async function reloadInvoices(nextSelectedId?: number | null) {
    const again = await fetchSupplierInvoicesPage({ branchId });
    if (!again.success || !again.data) return;

    const { items, hasMore: more, nextCursor: cursor } = again.data;
    const nextRows = (items as Array<Record<string, unknown>>).map(
      mapSupplierInvoiceRow,
    );

    setRows(nextRows);
    // Fresh first page — restore keyset state from the paginated result,
    // mirroring how the SSR initial load wires hasMore/nextCursor.
    setHasMore(more);
    setNextCursor(cursor);
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

  async function handleRecordPayment(values: SupplierPaymentFormValues) {
    if (!selectedInvoice) {
      return { success: false, error: copy.noPaymentInvoice };
    }

    const amount = Number(values.amount || 0);
    if (amount > selectedOutstandingAmount) {
      return { success: false, error: copy.paymentTooLarge };
    }

    const res = await recordSupplierPayment({
      invoiceId: selectedInvoice.id,
      amount,
      paymentMethod: values.paymentMethod,
      referenceNote: values.referenceNote?.trim() || undefined,
    });

    if (res.success) {
      await reloadInvoices(selectedInvoice.id);
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

  const renderInvoiceGroupCard = (group: SupplierInvoiceGroup) => {
    const primaryInvoice = getPrimaryInvoice(group);
    const isActive =
      selectedInvoice != null &&
      group.invoices.some((invoice) => invoice.id === selectedInvoice.id);

    return (
      <InteractiveCard
        asChild
        minHeight="mobile"
        padding="default"
        className={cn(
          "flex-col items-stretch gap-3 text-left",
          isActive && "border-primary/20 bg-primary/10 ring-2 ring-primary/20",
        )}
      >
        <button
          type="button"
          onClick={() => {
            if (primaryInvoice) setSelectedInvoiceId(primaryInvoice.id);
          }}
          aria-pressed={isActive}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-1">
              <p className="truncate text-sm font-semibold">{group.title}</p>
              <p className="truncate text-sm text-muted-foreground">
                {group.subtitle}
              </p>
            </div>
            {group.overdueCount > 0 ? (
              <Badge variant="outline" className="border-destructive/20">
                {copy.overdueGroupSummary(group.overdueCount)}
              </Badge>
            ) : null}
          </div>

          <div className="mt-4 grid gap-2 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">{copy.totalInvoice}</span>
              <span className="font-mono font-semibold">
                {messages.inventory.common.currencyCompact(
                  formatVND(group.totalAmount),
                )}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">
                {copy.outstandingPayable}
              </span>
              <span className="font-mono font-semibold">
                {messages.inventory.common.currencyCompact(
                  formatVND(group.outstandingAmount),
                )}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">{copy.aging}</span>
              <span
                className={cn(
                  "text-right font-mono font-semibold",
                  group.overdueAmount > 0 && "text-destructive",
                )}
              >
                {group.overdueAmount > 0
                  ? messages.inventory.common.currencyCompact(
                      formatVND(group.overdueAmount),
                    )
                  : group.nextDueDate
                    ? formatDate(group.nextDueDate)
                    : copy.noOpenDueDate}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">{copy.paidAmount}</span>
              <span className="font-mono">
                {messages.inventory.common.currencyCompact(
                  formatVND(group.paidAmount),
                )}
              </span>
            </div>
          </div>

          <span className="mt-4 text-sm font-medium text-primary">
            {isActive ? copy.analyzing : copy.groupDetailAction}
          </span>
        </button>
      </InteractiveCard>
    );
  };

  const invoiceGroupColumns: DataTableColumn<SupplierInvoiceGroup>[] = [
    {
      key: "group",
      header: viewMode === "supplier" ? copy.supplierGroup : copy.poGroup,
      className: "min-w-56",
      render: (group) => (
        <div className="flex min-w-0 flex-col gap-1">
          <p className="truncate font-semibold text-foreground">
            {group.title}
          </p>
          <p className="text-xs text-muted-foreground">{group.subtitle}</p>
          {group.overdueCount > 0 ? (
            <Badge
              variant="outline"
              className="w-fit border-destructive/20 text-xs"
            >
              {copy.overdueGroupSummary(group.overdueCount)}
            </Badge>
          ) : null}
        </div>
      ),
    },
    {
      key: "invoiceCount",
      header: copy.invoiceNumber,
      className: "min-w-28",
      render: (group) => (
        <span className="text-sm text-muted-foreground">{group.subtitle}</span>
      ),
    },
    {
      key: "aging",
      header: copy.aging,
      className: "min-w-40 text-right",
      render: (group) => (
        <div className="flex flex-col items-end gap-1 text-right">
          <span
            className={cn(
              "font-mono text-sm tabular-nums",
              group.overdueAmount > 0 && "font-semibold text-destructive",
            )}
          >
            {group.overdueAmount > 0
              ? messages.inventory.common.currencyCompact(
                  formatVND(group.overdueAmount),
                )
              : group.nextDueDate
                ? formatDate(group.nextDueDate)
                : copy.noOpenDueDate}
          </span>
          {group.overdueCount > 0 ? (
            <span className="text-xs text-muted-foreground">
              {copy.overdueGroupSummary(group.overdueCount)}
            </span>
          ) : null}
        </div>
      ),
    },
    {
      key: "total",
      header: copy.totalInvoice,
      className: "min-w-36 text-right",
      render: (group) => (
        <span className="font-mono text-sm tabular-nums">
          {messages.inventory.common.currencyCompact(
            formatVND(group.totalAmount),
          )}
        </span>
      ),
    },
    {
      key: "paid",
      header: copy.paidAmount,
      className: "min-w-36 text-right",
      render: (group) => (
        <span className="font-mono text-sm tabular-nums">
          {messages.inventory.common.currencyCompact(
            formatVND(group.paidAmount),
          )}
        </span>
      ),
    },
    {
      key: "outstanding",
      header: copy.outstandingPayable,
      className: "min-w-40 text-right",
      render: (group) => (
        <span className="font-mono text-sm font-semibold tabular-nums">
          {messages.inventory.common.currencyCompact(
            formatVND(group.outstandingAmount),
          )}
        </span>
      ),
    },
    {
      key: "action",
      header: FORM_VI.action,
      className: "w-28 text-right",
      render: (group) => {
        const primaryInvoice = getPrimaryInvoice(group);
        const isActive =
          selectedInvoice != null &&
          group.invoices.some((invoice) => invoice.id === selectedInvoice.id);

        return (
          <Button
            type="button"
            size="sm"
            variant={isActive ? "default" : "outline"}
            onClick={() => {
              if (primaryInvoice) setSelectedInvoiceId(primaryInvoice.id);
            }}
          >
            {isActive ? copy.analyzingShort : copy.groupDetailAction}
          </Button>
        );
      },
    },
  ];

  const viewModeActions = (
    <div className="flex flex-wrap gap-2">
      <Button
        type="button"
        size="sm"
        variant={viewMode === "supplier" ? "default" : "outline"}
        onClick={() => setViewMode("supplier")}
        aria-pressed={viewMode === "supplier"}
      >
        {copy.viewBySupplier}
      </Button>
      <Button
        type="button"
        size="sm"
        variant={viewMode === "po" ? "default" : "outline"}
        onClick={() => setViewMode("po")}
        aria-pressed={viewMode === "po"}
      >
        {copy.viewByPo}
      </Button>
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
    </div>
  );

  const detailTitle =
    selectedInvoice != null
      ? viewMode === "supplier"
        ? selectedInvoice.supplierName
        : (selectedInvoice.poCode ?? copy.noLinkedPo)
      : copy.noInvoiceSelected;

  const selectedGroup = selectedInvoice
    ? (invoiceGroups.find((group) =>
        group.invoices.some((invoice) => invoice.id === selectedInvoice.id),
      ) ?? null)
    : null;

  const detailSubtitle =
    selectedGroup != null
      ? `${copy.outstandingPayable}: ${messages.inventory.common.currencyCompact(
          formatVND(selectedGroup.outstandingAmount),
        )} · ${copy.invoiceGroupSummary(selectedGroup.invoiceCount)}`
      : null;

  const activeGroupId = selectedGroup?.id ?? null;
  const selectedAgingLabel = selectedInvoice
    ? getInvoiceAgingLabel(selectedInvoice, copy)
    : null;
  const selectedLastPayment = selectedInvoice?.lastPayment ?? null;

  return (
    <AppPage width="xwide">
      <AppPageHeader
        eyebrow={eyebrow}
        title={copy.title}
        description={description}
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
                  size="sm"
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
            actions={viewModeActions}
          />

          <AppSection
            title={
              viewMode === "supplier" ? copy.viewBySupplier : copy.viewByPo
            }
            headerHint={copy.groupCount(
              invoiceGroups.length,
              filteredInvoices.length,
            )}
            contentFlush
            contentScroll
          >
            <DataTable
              columns={invoiceGroupColumns}
              data={invoiceGroups}
              getRowKey={(group) => group.id}
              pageSize={50}
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
              onRowClick={(group) => {
                const primaryInvoice = getPrimaryInvoice(group);
                if (primaryInvoice) setSelectedInvoiceId(primaryInvoice.id);
              }}
              getRowAriaLabel={(group) =>
                `${copy.groupDetailAction}: ${group.title}`
              }
              getRowDataState={(group) =>
                group.id === activeGroupId ? "selected" : undefined
              }
              mobileCardRender={renderInvoiceGroupCard}
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
          title={detailTitle}
          headerHint={detailSubtitle ?? undefined}
        >
          {selectedInvoice ? (
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="font-mono">
                  {selectedInvoice.code}
                </Badge>
                {canPaySupplier && selectedOutstandingAmount > 0 ? (
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => setPaymentOpen(true)}
                    disabled={isPending}
                  >
                    {copy.payAction}
                  </Button>
                ) : null}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleRecomputeMatching}
                  disabled={isPending}
                >
                  {copy.recomputeMatching}
                </Button>
                <StatusBadge
                  domain="inventory"
                  value={getDisplayMatchStatus(selectedInvoice)}
                />
                <StatusBadge
                  domain="inventory"
                  value={selectedInvoice.paymentStatus}
                />
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <KpiCard
                  density="compact"
                  label={copy.totalInvoice}
                  value={messages.inventory.common.currencyCompact(
                    formatVND(selectedInvoice.amount),
                  )}
                />
                <KpiCard
                  density="compact"
                  label={copy.outstandingPayable}
                  value={messages.inventory.common.currencyCompact(
                    formatVND(selectedOutstandingAmount),
                  )}
                />
                <KpiCard
                  density="compact"
                  label={copy.paidAmount}
                  value={messages.inventory.common.currencyCompact(
                    formatVND(selectedInvoice.paidAmount),
                  )}
                />
                <KpiCard
                  density="compact"
                  label={copy.aging}
                  value={
                    <span
                      className={cn(
                        isInvoiceOverdue(selectedInvoice) && "text-destructive",
                      )}
                    >
                      {selectedAgingLabel}
                    </span>
                  }
                />
              </div>

              <DescriptionList
                className="grid gap-3 sm:grid-cols-2"
                descriptionClassName="font-medium"
                items={[
                  {
                    term: copy.invoiceDate,
                    description: formatDate(selectedInvoice.invoiceDate),
                  },
                  {
                    term: copy.dueDate,
                    description: (
                      <span
                        className={cn(
                          isInvoiceOverdue(selectedInvoice) &&
                            "text-destructive",
                        )}
                      >
                        {formatDate(selectedInvoice.dueDate)}
                      </span>
                    ),
                  },
                  {
                    term: copy.payableFormulaLabel,
                    description: copy.payableFormula(
                      messages.inventory.common.currencyCompact(
                        formatVND(selectedInvoice.amount),
                      ),
                      messages.inventory.common.currencyCompact(
                        formatVND(selectedInvoice.paidAmount),
                      ),
                    ),
                  },
                  {
                    term: copy.lastPayment,
                    description: selectedLastPayment
                      ? copy.lastPaymentSummary(
                          formatDate(selectedLastPayment.paymentDate),
                          getPaymentMethodLabel(
                            selectedLastPayment.paymentMethod,
                            copy,
                          ),
                          messages.inventory.common.currencyCompact(
                            formatVND(selectedLastPayment.amount),
                          ),
                        )
                      : copy.noPaymentHistory,
                  },
                  ...(selectedLastPayment?.referenceNote
                    ? [
                        {
                          term: copy.paymentReference,
                          description: selectedLastPayment.referenceNote,
                        },
                      ]
                    : []),
                  {
                    term: copy.linkedGrn,
                    description:
                      selectedInvoice.grnCode &&
                      selectedInvoice.grnId != null ? (
                        <Link
                          href={`${grnBasePath}/${selectedInvoice.grnId}`}
                          className="text-primary hover:underline"
                        >
                          {selectedInvoice.grnCode}
                        </Link>
                      ) : (
                        copy.notLinked
                      ),
                  },
                  {
                    term: copy.linkedPo,
                    description:
                      selectedInvoice.poCode && selectedInvoice.poId != null ? (
                        <span className="font-mono">
                          {selectedInvoice.poCode}
                        </span>
                      ) : (
                        copy.notLinked
                      ),
                  },
                ]}
              />

              {selectedMissingMatchingEvidence ? (
                <Alert className="border-warning/20 bg-warning/10 text-warning">
                  <IconAlertTriangle />
                  <AlertTitle>{copy.missingGrnTitle}</AlertTitle>
                  <AlertDescription className="text-muted-foreground">
                    {copy.missingGrnDescription}
                  </AlertDescription>
                </Alert>
              ) : selectedInvoice.variance !== null &&
                selectedInvoice.variance > 0 ? (
                <Alert variant="destructive">
                  <IconAlertTriangle />
                  <AlertTitle>
                    {copy.varianceTitle(
                      formatPercent(selectedInvoice.variance, 3),
                    )}
                  </AlertTitle>
                  <AlertDescription>
                    {copy.varianceDescription}
                    {selectedInvoice.grnId != null ? (
                      <Link
                        href={`${grnBasePath}/${selectedInvoice.grnId}`}
                        className="block font-medium text-primary hover:underline"
                      >
                        {copy.viewGrnLine}
                      </Link>
                    ) : null}
                  </AlertDescription>
                </Alert>
              ) : (
                <Alert className="border-success/20 bg-success/10 text-success">
                  <IconCircleCheck />
                  <AlertTitle>{copy.safeTitle}</AlertTitle>
                  <AlertDescription className="text-muted-foreground">
                    {copy.safeDescription}
                  </AlertDescription>
                </Alert>
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

      <FormDialog
        open={paymentOpen}
        onOpenChange={setPaymentOpen}
        schema={supplierPaymentSchema}
        defaultValues={paymentDefaultValues}
        entityKey={selectedInvoice?.id ?? "supplier-payment"}
        title={copy.recordPaymentTitle}
        description={copy.recordPaymentDescription}
        submitLabel={copy.payAction}
        cancelLabel={ACTIONS_VI.cancel}
        successMessage={copy.paymentRecorded}
        contentClassName="sm:max-w-md"
        onSubmit={handleRecordPayment}
      >
        {(form) => (
          <SupplierPaymentFields
            form={form}
            copy={copy}
            outstanding={selectedOutstandingAmount}
          />
        )}
      </FormDialog>
    </AppPage>
  );
}
