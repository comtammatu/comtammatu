"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { UseFormReturn } from "react-hook-form";
import { z } from "zod";
import {
  TriangleAlert as IconAlertTriangle,
  Eye as IconEye,
  ReceiptText as IconReceipt,
  Search as IconSearch,
  Trash as IconTrash,
  Upload as IconUpload,
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
  SelectField,
  TextareaField,
  TextField,
} from "@/components/form";
import { useFormControlSize } from "@/components/form/control-size";
import {
  AppEmptyState,
  AppListFrame,
  AppPage,
  AppPageHeader,
  AppToolbar,
} from "@/components/surface";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@comtammatu/ui/components/sheet";
import {
  inventoryListFilterSelectClassName,
} from "../../inventory/_components/inventory-list-frame";
import {
  attachSupplierInvoiceVatEvidence,
  createSupplierInvoice,
  fetchSupplierInvoicesPage,
  recordSupplierPayment,
  recomputeInvoiceMatching,
  type SupplierInvoiceCursor,
} from "../supplier-invoice-actions";
import { createClient } from "@comtammatu/database/supabase/client";
import { Spinner } from "@comtammatu/ui/components/spinner";
import {
  getSupplierInvoiceOutstandingAmount,
  mapSupplierInvoiceRow,
  resolveSupplierPaymentIntentKey,
  type SupplierInvoiceRow,
} from "./supplier-invoice-row";
import {
  getSupplierInvoiceDisplayMatchStatus as getDisplayMatchStatus,
  getSupplierInvoiceGroupId,
  hasSupplierInvoiceListFilters,
  isSupplierInvoiceMissingVatEvidence,
  isSupplierInvoiceOverdue as isInvoiceOverdue,
  supplierInvoiceFiltersKey,
  SUPPLIER_INVOICE_MATCH_STATUSES,
  SUPPLIER_INVOICE_PAYMENT_STATUSES,
  type SupplierInvoiceGroup as SupplierInvoiceAggregateGroup,
  type SupplierInvoiceListFilters,
  type SupplierInvoiceViewMode,
} from "./supplier-invoice-list-model";
import { getStatusBadgeMeta, StatusBadge } from "@/components/status-badge";
import {
  RowActionsContextMenuItems,
  RowActionsMenu,
  type RowActionItem,
} from "@/components/row-actions-menu";

import { formatPercent } from "@comtammatu/shared/format";
import { formatVND } from "@lib/inventory/format";
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
  optionKey: string;
  id: number;
  code: string;
  supplierId: number;
  supplierName: string;
  poId: number | null;
  netAcceptedAmount: number | null;
};

type SupplierInvoiceGroup = SupplierInvoiceAggregateGroup & {
  title: string;
  subtitle: string;
};

const ALL_FILTER_VALUE = "_all";

const MATCH_FILTER_OPTIONS = SUPPLIER_INVOICE_MATCH_STATUSES.map((value) => ({
  value,
  label: getStatusBadgeMeta("inventory", value).label,
}));

const PAYMENT_FILTER_OPTIONS = SUPPLIER_INVOICE_PAYMENT_STATUSES.map(
  (value) => ({
    value,
    label: getStatusBadgeMeta("inventory", value).label,
  }),
);

const VAT_BUCKET_FIELDS = [
  { rate: 0, taxableField: "vat0Taxable", vatField: null },
  { rate: 5, taxableField: "vat5Taxable", vatField: "vat5Amount" },
  { rate: 8, taxableField: "vat8Taxable", vatField: "vat8Amount" },
  { rate: 10, taxableField: "vat10Taxable", vatField: "vat10Amount" },
] as const;

const optionalMoneySchema = z.string().refine(
  (value) => {
    if (!value.trim()) return true;
    const amount = Number(value);
    return Number.isFinite(amount) && amount >= 0;
  },
  { error: messages.inventory.supplierInvoices.invalidAmount },
);

const supplierInvoiceSchema = z
  .object({
    grnId: z.string(),
    supplierId: z.string().min(1, { error: FORM_VI.required }),
    invoiceNumber: z.string().trim().min(1, { error: FORM_VI.required }),
    invoiceDate: z.string().min(1, { error: FORM_VI.required }),
    vat0Taxable: optionalMoneySchema,
    vat5Taxable: optionalMoneySchema,
    vat5Amount: optionalMoneySchema,
    vat8Taxable: optionalMoneySchema,
    vat8Amount: optionalMoneySchema,
    vat10Taxable: optionalMoneySchema,
    vat10Amount: optionalMoneySchema,
  })
  .superRefine((data, ctx) => {
    const hasTaxableBucket = VAT_BUCKET_FIELDS.some(
      (bucket) => Number(data[bucket.taxableField] || 0) > 0,
    );
    if (hasTaxableBucket) return;

    const firstEmptyBucket = VAT_BUCKET_FIELDS.find(
      (bucket) => !(Number(data[bucket.taxableField] || 0) > 0),
    );
    ctx.addIssue({
      code: "custom",
      message: messages.inventory.supplierInvoices.vatBreakdownRequired,
      path: [firstEmptyBucket?.taxableField ?? "vat0Taxable"],
    });
  });

type SupplierInvoiceFormValues = z.infer<typeof supplierInvoiceSchema>;

type VatRate = (typeof VAT_BUCKET_FIELDS)[number]["rate"];

const DEFAULT_VISIBLE_VAT_RATE: VatRate = 8;

function getVatBucket(rate: VatRate) {
  const bucket = VAT_BUCKET_FIELDS.find((entry) => entry.rate === rate);
  if (!bucket) {
    throw new Error(`Unsupported VAT rate: ${rate}`);
  }
  return bucket;
}

function clearVatBucketFields(
  form: UseFormReturn<
    SupplierInvoiceFormValues,
    unknown,
    SupplierInvoiceFormValues
  >,
  rate: VatRate,
) {
  const bucket = getVatBucket(rate);
  form.setValue(bucket.taxableField, "", {
    shouldDirty: true,
    shouldValidate: true,
  });
  if (bucket.vatField != null) {
    form.setValue(bucket.vatField, "", {
      shouldDirty: true,
      shouldValidate: true,
    });
  }
}

function moveVatBucketFields(
  form: UseFormReturn<
    SupplierInvoiceFormValues,
    unknown,
    SupplierInvoiceFormValues
  >,
  fromRate: VatRate,
  toRate: VatRate,
) {
  if (fromRate === toRate) return;
  const from = getVatBucket(fromRate);
  const to = getVatBucket(toRate);
  const taxable = form.getValues(from.taxableField);
  const vatAmount =
    from.vatField != null ? form.getValues(from.vatField) : "";
  form.setValue(to.taxableField, taxable, {
    shouldDirty: true,
    shouldValidate: true,
  });
  if (to.vatField != null) {
    form.setValue(to.vatField, typeof vatAmount === "string" ? vatAmount : "", {
      shouldDirty: true,
      shouldValidate: true,
    });
  }
  clearVatBucketFields(form, fromRate);
}

function buildSupplierInvoiceVatBreakdown(values: SupplierInvoiceFormValues) {
  return VAT_BUCKET_FIELDS.flatMap((bucket) => {
    const taxableAmount = Number(values[bucket.taxableField] || 0);
    if (taxableAmount <= 0) return [];

    const enteredVat =
      bucket.vatField != null ? values[bucket.vatField].trim() : "";
    const vatAmount =
      bucket.rate === 0
        ? 0
        : enteredVat
          ? Number(enteredVat)
          : Math.round(taxableAmount * bucket.rate) / 100;

    return [{ vatRate: bucket.rate, taxableAmount, vatAmount }];
  });
}

const supplierPaymentSchema = z.object({
  amount: z.string().refine((value) => Number(value) > 0, {
    error: FORM_VI.required,
  }),
  paymentMethod: z.enum(["cash", "bank_transfer"]),
  referenceNote: z.string().trim().optional(),
});

type SupplierPaymentFormValues = z.infer<typeof supplierPaymentSchema>;

function createSupplierInvoiceDefaultValues(
  preselectGrnOptionKey?: string | null,
): SupplierInvoiceFormValues {
  return {
    grnId: preselectGrnOptionKey ?? "none",
    supplierId: "",
    invoiceNumber: "",
    invoiceDate: getVNDateString(),
    vat0Taxable: "",
    vat5Taxable: "",
    vat5Amount: "",
    vat8Taxable: "",
    vat8Amount: "",
    vat10Taxable: "",
    vat10Amount: "",
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
  return group.primaryInvoice;
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

function DetailFact({
  label,
  value,
  className,
  valueClassName,
}: {
  label: string;
  value: ReactNode;
  className?: string;
  valueClassName?: string;
}) {
  return (
    <Item variant="outline" size="sm" className={cn("items-start", className)}>
      <ItemContent className="gap-1">
        <ItemDescription className="line-clamp-none">{label}</ItemDescription>
        <ItemTitle
          size="heading"
          className={cn("line-clamp-none font-normal", valueClassName)}
        >
          {value}
        </ItemTitle>
      </ItemContent>
    </Item>
  );
}

function SupplierInvoiceCreateFields({
  form,
  suppliers,
  grns,
  copy,
  canAttachVatEvidence,
  pendingVatFile,
  onPendingVatFileChange,
}: {
  form: UseFormReturn<
    SupplierInvoiceFormValues,
    unknown,
    SupplierInvoiceFormValues
  >;
  suppliers: SupplierOption[];
  grns: GrnOption[];
  copy: typeof messages.inventory.supplierInvoices;
  canAttachVatEvidence: boolean;
  pendingVatFile: File | null;
  onPendingVatFileChange: (file: File | null) => void;
}) {
  const grnId = form.watch("grnId");
  const formValues = form.watch();
  const selectedGrn =
    grnId !== "none"
      ? (grns.find((option) => option.optionKey === grnId) ?? null)
      : null;
  const [visibleRates, setVisibleRates] = useState<VatRate[]>([
    DEFAULT_VISIBLE_VAT_RATE,
  ]);
  const vatBreakdown = buildSupplierInvoiceVatBreakdown(formValues);
  const subtotal = vatBreakdown.reduce(
    (sum, line) => sum + line.taxableAmount,
    0,
  );
  const vatAmount = vatBreakdown.reduce((sum, line) => sum + line.vatAmount, 0);
  const totalAmount = subtotal + vatAmount;
  const unusedRates = VAT_BUCKET_FIELDS.map((bucket) => bucket.rate).filter(
    (rate) => !visibleRates.includes(rate),
  );

  useEffect(() => {
    if (!selectedGrn) {
      return;
    }

    const nextSupplierId = String(selectedGrn.supplierId);
    if (form.getValues("supplierId") !== nextSupplierId) {
      form.setValue("supplierId", nextSupplierId, {
        shouldDirty: true,
        shouldValidate: true,
      });
    }

    setVisibleRates([DEFAULT_VISIBLE_VAT_RATE]);
    for (const bucket of VAT_BUCKET_FIELDS) {
      if (bucket.rate === DEFAULT_VISIBLE_VAT_RATE) continue;
      clearVatBucketFields(form, bucket.rate);
    }

    const bucket = getVatBucket(DEFAULT_VISIBLE_VAT_RATE);
    if (selectedGrn.netAcceptedAmount != null) {
      form.setValue(
        bucket.taxableField,
        String(selectedGrn.netAcceptedAmount),
        {
          shouldDirty: true,
          shouldValidate: true,
        },
      );
    } else {
      form.setValue(bucket.taxableField, "", {
        shouldDirty: true,
        shouldValidate: true,
      });
    }
    if (bucket.vatField != null) {
      form.setValue(bucket.vatField, "", {
        shouldDirty: true,
        shouldValidate: true,
      });
    }
  }, [
    form,
    selectedGrn?.optionKey,
    selectedGrn?.netAcceptedAmount,
    selectedGrn?.supplierId,
  ]);

  const grnOptions = useMemo(
    () => [
      ...grns.map((option) => ({
        value: option.optionKey,
        label: `${option.code} · ${option.supplierName}`,
      })),
      { value: "none", label: copy.noLinkedGrn },
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

  function handleRateChange(index: number, nextRate: VatRate) {
    const currentRate = visibleRates[index];
    if (currentRate == null || currentRate === nextRate) return;
    if (visibleRates.includes(nextRate)) return;

    moveVatBucketFields(form, currentRate, nextRate);
    setVisibleRates((current) =>
      current.map((rate, rateIndex) =>
        rateIndex === index ? nextRate : rate,
      ),
    );
  }

  function handleAddVatRate() {
    const nextRate = unusedRates[0];
    if (nextRate == null) return;
    setVisibleRates((current) => [...current, nextRate]);
  }

  function handleRemoveVatRate(index: number) {
    if (visibleRates.length <= 1) return;
    const rate = visibleRates[index];
    if (rate == null) return;
    clearVatBucketFields(form, rate);
    setVisibleRates((current) =>
      current.filter((_, rateIndex) => rateIndex !== index),
    );
  }

  return (
    <>
      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium">{copy.documentSection}</p>
        <SelectField
          control={form.control}
          name="grnId"
          label={copy.linkedGrn}
          options={grnOptions}
          placeholder={copy.chooseGrnPrimary}
        />
        {selectedGrn ? (
          <NoteCallout tone="muted">
            <div className="flex flex-col gap-1 text-sm">
              <span>
                {selectedGrn.code} · {selectedGrn.supplierName}
              </span>
              {selectedGrn.netAcceptedAmount != null ? (
                <span className="text-muted-foreground">
                  {copy.grnNetAcceptedLabel}:{" "}
                  <span className="font-mono tabular-nums text-foreground">
                    {messages.inventory.common.currencyCompact(
                      formatVND(selectedGrn.netAcceptedAmount),
                    )}
                  </span>
                </span>
              ) : (
                <span className="text-muted-foreground">
                  {copy.grnNetAcceptedUnavailable}
                </span>
              )}
            </div>
          </NoteCallout>
        ) : (
          <SelectField
            control={form.control}
            name="supplierId"
            label={copy.supplier}
            options={supplierOptions}
            placeholder={copy.chooseSupplier}
            required
          />
        )}
        <TextField
          control={form.control}
          name="invoiceNumber"
          label={copy.invoiceNumber}
          placeholder={copy.invoiceNumberPlaceholder}
          required
        />
        <BusinessDateField
          control={form.control}
          name="invoiceDate"
          label={copy.invoiceDate}
          required
        />
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">{copy.vatSection}</p>
        <p className="text-xs text-muted-foreground">{copy.vatSectionHint}</p>
        <div className="flex flex-col gap-3">
          {visibleRates.map((rate, index) => {
            const bucket = getVatBucket(rate);
            const rateOptions = VAT_BUCKET_FIELDS.filter(
              (entry) =>
                entry.rate === rate || !visibleRates.includes(entry.rate),
            ).map((entry) => ({
              value: String(entry.rate),
              label: formatPercent(entry.rate, 0),
            }));
            return (
              <div
                key={`${rate}-${index}`}
                className="flex flex-col gap-3"
              >
                <div className="flex items-end gap-2">
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <p className="text-sm font-medium">{copy.vatRateLabel}</p>
                    <Select
                      value={String(rate)}
                      onValueChange={(value) => {
                        const nextRate = Number(value) as VatRate;
                        if (![0, 5, 8, 10].includes(nextRate)) return;
                        handleRateChange(index, nextRate);
                      }}
                    >
                      <SelectTrigger
                        size="touch"
                        aria-label={copy.vatRateLabel}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {rateOptions.map((option) => (
                          <SelectItem
                            key={option.value}
                            value={option.value}
                            size="touch"
                          >
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {visibleRates.length > 1 ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="shrink-0 text-destructive"
                      onClick={() => handleRemoveVatRate(index)}
                      aria-label={copy.removeVatRate}
                    >
                      <IconTrash className="size-4" />
                    </Button>
                  ) : null}
                </div>
                <div
                  className={
                    bucket.vatField != null
                      ? "grid gap-3 sm:grid-cols-2"
                      : "grid gap-3"
                  }
                >
                  <MoneyVndField
                    control={form.control}
                    name={bucket.taxableField}
                    label={copy.taxableAmountLabel}
                    placeholder={copy.subtotalPlaceholder}
                  />
                  {bucket.vatField != null ? (
                    <MoneyVndField
                      control={form.control}
                      name={bucket.vatField}
                      label={copy.vatAmountLabel}
                      placeholder={copy.vatAutoPlaceholder}
                    />
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
        {unusedRates.length > 0 ? (
          <Button
            type="button"
            variant="outline"
            size="touch"
            className="w-full sm:w-auto"
            onClick={handleAddVatRate}
          >
            {copy.addVatRate}
          </Button>
        ) : null}
        <NoteCallout tone="muted">
          {vatBreakdown.map((line) => (
            <div
              key={line.vatRate}
              className="mb-2 flex items-center justify-between gap-3"
            >
              <span className="text-muted-foreground">
                {copy.vatBucketSummary(
                  formatPercent(line.vatRate, 0),
                  messages.inventory.common.currencyCompact(
                    formatVND(line.taxableAmount),
                  ),
                )}
              </span>
              <span className="font-mono tabular-nums">
                {messages.inventory.common.currencyCompact(
                  formatVND(line.vatAmount),
                )}
              </span>
            </div>
          ))}
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
      </div>

      {canAttachVatEvidence ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">{copy.vatAttachmentLabel}</p>
          <p className="text-xs text-muted-foreground">
            {copy.vatAttachmentOptionalHint}
          </p>
          {pendingVatFile ? (
            <div className="flex flex-wrap items-center gap-2">
              <p className="min-w-0 flex-1 truncate text-sm">
                {copy.vatAttachmentFileSelected(pendingVatFile.name)}
              </p>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="text-destructive"
                onClick={() => onPendingVatFileChange(null)}
                aria-label={copy.vatAttachmentClear}
              >
                <IconTrash className="size-4" />
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="touch"
              className="relative w-full sm:w-auto"
              render={<label />}
            >
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                className="absolute inset-0 cursor-pointer opacity-0"
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  event.target.value = "";
                  if (!file) return;
                  const isPdf = file.type === "application/pdf";
                  const isImage = file.type.startsWith("image/");
                  if (!isImage && !isPdf) {
                    toast.error(copy.vatAttachmentHint);
                    return;
                  }
                  if (file.size > 10 * 1024 * 1024) {
                    toast.error(copy.vatAttachmentHint);
                    return;
                  }
                  onPendingVatFileChange(file);
                }}
              />
              <IconUpload className="size-4" />
              {copy.vatAttachmentUpload}
            </Button>
          )}
        </div>
      ) : null}
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
  initialGroups,
  initialTotalCount,
  filters,
  branchId,
  tenantId,
  grnBasePath = "/inventory/grn",
  description,
  canPaySupplier = false,
  canAttachVatEvidence = false,
}: {
  invoices: SupplierInvoiceRow[];
  suppliers: SupplierOption[];
  grns: GrnOption[];
  initialHasMore?: boolean;
  initialNextCursor?: SupplierInvoiceCursor | null;
  initialGroups: SupplierInvoiceAggregateGroup[];
  initialTotalCount: number;
  filters: SupplierInvoiceListFilters;
  branchId?: number;
  tenantId: number;
  grnBasePath?: string;
  description?: string;
  canPaySupplier?: boolean;
  canAttachVatEvidence?: boolean;
}) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const invoiceIdParam = searchParams.get("invoiceId");
  const grnIdParam = searchParams.get("grnId");
  const preselectInvoiceId = invoiceIdParam ? Number(invoiceIdParam) : null;
  const preselectGrnId = grnIdParam ? Number(grnIdParam) : null;

  const [rows, setRows] = useState(invoices);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [nextCursor, setNextCursor] = useState<SupplierInvoiceCursor | null>(
    initialNextCursor,
  );
  const [aggregateGroups, setAggregateGroups] = useState(initialGroups);
  const [totalCount, setTotalCount] = useState(initialTotalCount);
  const [loadingMore, setLoadingMore] = useState(false);
  const [search, setSearch] = useState(filters.query);
  const supplierFilter =
    filters.supplierId != null ? String(filters.supplierId) : ALL_FILTER_VALUE;
  const matchStatusFilter = filters.matchStatus ?? ALL_FILTER_VALUE;
  const paymentStatusFilter = filters.paymentStatus ?? ALL_FILTER_VALUE;
  const viewMode: SupplierInvoiceViewMode = filters.viewMode;
  const showOnlyOverdue = filters.overdueOnly;
  const showOnlyMissingVat = filters.vatEvidence === "missing";
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<number | null>(
    preselectInvoiceId,
  );
  const [detailOpen, setDetailOpen] = useState(preselectInvoiceId != null);
  const [createOpen, setCreateOpen] = useState(
    preselectGrnId != null && preselectInvoiceId == null,
  );
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [vatUploading, setVatUploading] = useState(false);
  const [pendingCreateVatFile, setPendingCreateVatFile] = useState<File | null>(
    null,
  );
  const paymentIntentKeyRef = useRef<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const controlSize = useFormControlSize();
  const copy = messages.inventory.supplierInvoices;
  const preselectGrnOptionKey =
    preselectGrnId != null
      ? (grns.find((option) => option.id === preselectGrnId)?.optionKey ?? null)
      : null;
  const createDefaultValues = useMemo(
    () => createSupplierInvoiceDefaultValues(preselectGrnOptionKey),
    [createOpen, preselectGrnOptionKey],
  );
  const listKey = supplierInvoiceFiltersKey(filters);
  const actionFilters = useMemo(
    () => ({
      query: filters.query,
      supplierId: filters.supplierId ?? undefined,
      matchStatus: filters.matchStatus ?? undefined,
      paymentStatus: filters.paymentStatus ?? undefined,
      overdueOnly: filters.overdueOnly,
      vatEvidence: filters.vatEvidence ?? undefined,
      viewMode: filters.viewMode,
    }),
    [filters],
  );

  useEffect(() => {
    setRows(invoices);
    setHasMore(initialHasMore);
    setNextCursor(initialNextCursor);
    setAggregateGroups(initialGroups);
    setTotalCount(initialTotalCount);
    setSearch(filters.query);
    setSelectedInvoiceId(preselectInvoiceId);
    setDetailOpen(preselectInvoiceId != null);
  }, [
    filters.query,
    initialGroups,
    initialHasMore,
    initialNextCursor,
    initialTotalCount,
    invoices,
    listKey,
    preselectInvoiceId,
  ]);

  const replaceListParam = useCallback(
    (key: string, value: string | null) => {
      const next = new URLSearchParams(searchParams.toString());
      if (key !== "q") {
        const pendingQuery = search.trim().slice(0, 200);
        if (pendingQuery) next.set("q", pendingQuery);
        else next.delete("q");
      }
      if (value == null || value === "") next.delete(key);
      else next.set(key, value);
      const query = next.toString();
      startTransition(() => {
        router.replace(query ? `${pathname}?${query}` : pathname, {
          scroll: false,
        });
      });
    },
    [pathname, router, search, searchParams, startTransition],
  );

  const openInvoiceDetail = useCallback(
    (invoiceId: number) => {
      setSelectedInvoiceId(invoiceId);
      setDetailOpen(true);
      replaceListParam("invoiceId", String(invoiceId));
    },
    [replaceListParam],
  );

  function handleDetailOpenChange(open: boolean) {
    setDetailOpen(open);
    if (!open) {
      setSelectedInvoiceId(null);
      replaceListParam("invoiceId", null);
    }
  }

  useEffect(() => {
    const normalized = search.trim().slice(0, 200);
    if (normalized === filters.query) return;

    const timeout = window.setTimeout(() => {
      replaceListParam("q", normalized || null);
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [filters.query, replaceListParam, search]);

  const supplierOptions = useMemo(() => {
    return suppliers
      .filter((supplier) => supplier.id > 0 && supplier.name.trim().length > 0)
      .sort((left, right) => left.name.localeCompare(right.name, "vi"))
      .map((supplier) => ({
        label: supplier.name,
        value: String(supplier.id),
      }));
  }, [suppliers]);

  const allInvoiceGroups = useMemo<SupplierInvoiceGroup[]>(
    () =>
      aggregateGroups.map((group) => ({
        ...group,
        title:
          viewMode === "supplier"
            ? group.supplierName
            : (group.poCode ?? copy.noLinkedPo),
        subtitle:
          viewMode === "supplier"
            ? copy.invoiceGroupSummary(group.invoiceCount)
            : `${group.supplierName} · ${copy.invoiceGroupSummary(group.invoiceCount)}`,
      })),
    [aggregateGroups, copy, viewMode],
  );
  const loadedGroupIds = useMemo(
    () =>
      new Set(
        rows.map((invoice) => getSupplierInvoiceGroupId(invoice, viewMode)),
      ),
    [rows, viewMode],
  );
  const invoiceGroups = useMemo(
    () => allInvoiceGroups.filter((group) => loadedGroupIds.has(group.id)),
    [allInvoiceGroups, loadedGroupIds],
  );

  const selectedInvoice =
    (typeof selectedInvoiceId === "number"
      ? (rows.find((invoice) => invoice.id === selectedInvoiceId) ??
        allInvoiceGroups
          .flatMap((group) => group.invoices)
          .find((invoice) => invoice.id === selectedInvoiceId) ??
        allInvoiceGroups.find(
          (group) => group.primaryInvoice.id === selectedInvoiceId,
        )?.primaryInvoice)
      : null) ?? null;
  const selectedOutstandingAmount = selectedInvoice
    ? getSupplierInvoiceOutstandingAmount(selectedInvoice)
    : 0;
  const selectedMissingMatchingEvidence = selectedInvoice
    ? isMissingMatchingEvidence(selectedInvoice)
    : false;
  const selectedGroup =
    selectedInvoice != null
      ? (allInvoiceGroups.find(
          (group) =>
            group.id === getSupplierInvoiceGroupId(selectedInvoice, viewMode),
        ) ?? null)
      : null;
  const selectedGroupId = selectedGroup?.id ?? null;
  const invoicesInSelectedGroup = useMemo(() => {
    if (selectedGroup == null) return [];
    const rowById = new Map(rows.map((invoice) => [invoice.id, invoice]));
    return selectedGroup.invoices.map(
      (invoice) => rowById.get(invoice.id) ?? invoice,
    );
  }, [rows, selectedGroup]);
  const paymentDefaultValues = useMemo(
    () => createSupplierPaymentDefaultValues(selectedInvoice),
    [selectedInvoice?.id, selectedOutstandingAmount],
  );

  const showEmptyResults =
    totalCount === 0 && hasSupplierInvoiceListFilters(filters);

  async function reloadInvoices(nextSelectedId?: number | null) {
    const [again, exactSelected] = await Promise.all([
      fetchSupplierInvoicesPage({ branchId, ...actionFilters }),
      typeof nextSelectedId === "number"
        ? fetchSupplierInvoicesPage({
            branchId,
            invoiceId: nextSelectedId,
            pageSize: 1,
          })
        : Promise.resolve(null),
    ]);
    if (!again.success || !again.data) return;

    const {
      items,
      hasMore: more,
      nextCursor: cursor,
      groups: nextGroups,
      totalCount: nextTotalCount,
    } = again.data;
    let nextRows = (items as Array<Record<string, unknown>>).map(
      mapSupplierInvoiceRow,
    );

    if (typeof nextSelectedId === "number") {
      const exactItem = (
        exactSelected?.success ? exactSelected.data?.items[0] : undefined
      ) as Record<string, unknown> | undefined;
      if (!exactItem || Number(exactItem.id) !== nextSelectedId) {
        toast.error(exactSelected?.error ?? copy.loadFailed);
        return;
      }

      const exactRow = mapSupplierInvoiceRow(exactItem);
      nextRows = [
        exactRow,
        ...nextRows.filter((invoice) => invoice.id !== exactRow.id),
      ];
    }

    setRows(nextRows);
    // Fresh first page — restore keyset state from the paginated result,
    // mirroring how the SSR initial load wires hasMore/nextCursor.
    setHasMore(more);
    setNextCursor(cursor);
    setAggregateGroups(nextGroups);
    setTotalCount(nextTotalCount);
    if (typeof nextSelectedId === "number") {
      setSelectedInvoiceId(nextSelectedId);
      setDetailOpen(true);
      replaceListParam("invoiceId", String(nextSelectedId));
    }
  }

  function handleLoadMore() {
    if (loadingMore || !hasMore || !nextCursor) return;
    setLoadingMore(true);
    startTransition(async () => {
      try {
        const result = await fetchSupplierInvoicesPage({
          branchId,
          ...actionFilters,
          before: nextCursor,
        });
        if (!result.success || !result.data) {
          toast.error(result.error ?? copy.loadMoreFailed);
          return;
        }
        const {
          items,
          hasMore: more,
          nextCursor: cursor,
          groups: nextGroups,
          totalCount: nextTotalCount,
        } = result.data;
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
        setAggregateGroups(nextGroups);
        setTotalCount(nextTotalCount);
      } finally {
        setLoadingMore(false);
      }
    });
  }

  async function uploadAndAttachVatEvidence(
    invoiceId: number,
    file: File,
  ): Promise<boolean> {
    const isPdf = file.type === "application/pdf";
    const isImage = file.type.startsWith("image/");
    if (!isImage && !isPdf) {
      toast.error(copy.vatAttachmentHint);
      return false;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error(copy.vatAttachmentHint);
      return false;
    }

    const supabase = createClient();
    const ext =
      file.name.includes(".") && file.name.lastIndexOf(".") >= 0
        ? file.name.slice(file.name.lastIndexOf(".")).toLowerCase()
        : isPdf
          ? ".pdf"
          : ".jpg";
    const path = `${tenantId}/supplier-invoices/${invoiceId}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}${ext}`;
    const { error: uploadError } = await supabase.storage
      .from("supplier-invoice-attachments")
      .upload(path, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type,
      });
    if (uploadError) {
      toast.error(copy.vatAttachmentUploadFailed);
      return false;
    }

    const res = await attachSupplierInvoiceVatEvidence({
      invoiceId,
      storagePath: path,
    });
    if (!res.success) {
      toast.error(res.error ?? copy.vatAttachmentUploadFailed);
      return false;
    }

    return true;
  }

  async function handleCreateInvoice(values: SupplierInvoiceFormValues) {
    const selectedGrn =
      values.grnId !== "none"
        ? (grns.find((option) => option.optionKey === values.grnId) ?? null)
        : null;
    const resolvedSupplierId =
      selectedGrn?.supplierId ?? Number(values.supplierId || 0);
    const pendingFile = pendingCreateVatFile;
    const res = await createSupplierInvoice({
      supplierId: resolvedSupplierId,
      grnId: selectedGrn?.id ?? null,
      poId: selectedGrn?.poId ?? null,
      invoiceNumber: values.invoiceNumber.trim(),
      invoiceDate: values.invoiceDate,
      vatBreakdown: buildSupplierInvoiceVatBreakdown(values),
    });

    if (res.success && res.data) {
      const created = res.data as { id: number };
      setPendingCreateVatFile(null);

      if (pendingFile && canAttachVatEvidence) {
        const attached = await uploadAndAttachVatEvidence(
          created.id,
          pendingFile,
        );
        await reloadInvoices(created.id);
        if (!attached) {
          toast.error(copy.vatAttachmentCreateFailed);
        } else {
          toast.success(copy.vatAttachmentUploaded);
        }
      } else {
        await reloadInvoices(created.id);
        if (canAttachVatEvidence) {
          toast.message(copy.vatAttachmentRemindAfterCreate);
        }
      }
    }

    return res;
  }

  async function handleRecordPayment(values: SupplierPaymentFormValues) {
    if (!selectedInvoice) {
      return { success: false, error: copy.noPaymentInvoice };
    }

    if (!selectedInvoice.vatInvoiceAttachmentPath) {
      return { success: false, error: copy.paymentBlockedNoVatAttachment };
    }

    const amount = Number(values.amount || 0);
    if (amount > selectedOutstandingAmount) {
      return { success: false, error: copy.paymentTooLarge };
    }

    const idempotencyKey = resolveSupplierPaymentIntentKey(
      paymentIntentKeyRef.current,
      () => crypto.randomUUID(),
    );
    paymentIntentKeyRef.current = idempotencyKey;

    try {
      const res = await recordSupplierPayment({
        invoiceId: selectedInvoice.id,
        idempotencyKey,
        amount,
        paymentMethod: values.paymentMethod,
        referenceNote: values.referenceNote?.trim() || undefined,
      });

      if (res.success) {
        await reloadInvoices(selectedInvoice.id);
      }

      return res;
    } catch {
      return { success: false, error: copy.paymentRetrySameIntent };
    }
  }

  async function handleVatAttachmentUpload(file: File) {
    if (!selectedInvoice) return;

    setVatUploading(true);
    try {
      const attached = await uploadAndAttachVatEvidence(
        selectedInvoice.id,
        file,
      );
      if (!attached) return;

      toast.success(copy.vatAttachmentUploaded);
      await reloadInvoices(selectedInvoice.id);
    } finally {
      setVatUploading(false);
    }
  }

  async function handleOpenVatAttachment() {
    const path = selectedInvoice?.vatInvoiceAttachmentPath;
    if (!path) return;

    const supabase = createClient();
    const { data, error } = await supabase.storage
      .from("supplier-invoice-attachments")
      .createSignedUrl(path, 60 * 10);
    if (error || !data?.signedUrl) {
      toast.error(copy.vatAttachmentOpenFailed);
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  function openSupplierPaymentDialog() {
    if (!selectedInvoice?.vatInvoiceAttachmentPath) {
      toast.error(copy.paymentBlockedNoVatAttachment);
      return;
    }
    paymentIntentKeyRef.current = crypto.randomUUID();
    setPaymentOpen(true);
  }

  function handlePaymentOpenChange(open: boolean) {
    if (open && paymentIntentKeyRef.current == null) {
      paymentIntentKeyRef.current = crypto.randomUUID();
    }
    if (!open) {
      paymentIntentKeyRef.current = null;
    }
    setPaymentOpen(open);
  }

  function handleCreateOpenChange(open: boolean) {
    if (!open) {
      setPendingCreateVatFile(null);
    }
    setCreateOpen(open);
  }

  function handleRecomputeMatching() {
    if (!selectedInvoice) return;

    startTransition(async () => {
      const res = await recomputeInvoiceMatching(selectedInvoice.id);
      if (!res.success) {
        toast.error(res.error ?? copy.recomputeMatchingFailed);
        return;
      }
      toast.success(copy.recomputeMatchingSuccess);
      await reloadInvoices(selectedInvoice.id);
    });
  }

  const renderInvoiceGroupCard = (group: SupplierInvoiceGroup) => {
    const primaryInvoice = getPrimaryInvoice(group);
    const isActive =
      detailOpen &&
      selectedInvoice != null &&
      group.id === getSupplierInvoiceGroupId(selectedInvoice, viewMode);

    return (
      <InteractiveCard
        minHeight="mobile"
        padding="default"
        className={cn(
          "flex-col items-stretch gap-3 text-left",
          isActive && "border-primary/20 bg-primary/10 ring-2 ring-primary/20",
        )}
        render={
          <button
            type="button"
            onClick={() => {
              if (primaryInvoice) openInvoiceDetail(primaryInvoice.id);
            }}
            aria-pressed={isActive}
          />
        }
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <p className="truncate text-sm font-semibold">{group.title}</p>
            <p className="truncate text-sm text-muted-foreground">
              {group.subtitle}
            </p>
            {viewMode !== "supplier" && group.invoices.length > 0 ? (
              <p className="truncate font-mono text-xs text-muted-foreground">
                {copy.invoiceCodesPreview(
                  group.invoices.map((invoice) => invoice.code),
                )}
              </p>
            ) : null}
            {viewMode === "supplier" ? (
              <p className="font-mono text-xs text-muted-foreground tabular-nums">
                {copy.invoiceCountHeader}: {group.invoiceCount}
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            {group.overdueCount > 0 ? (
              <Badge variant="outline" className="border-destructive/20">
                {copy.overdueGroupSummary(group.overdueCount)}
              </Badge>
            ) : null}
            {group.missingVatCount > 0 ? (
              <Badge variant="outline" className="border-warning/20">
                {copy.vatMissingGroupSummary(group.missingVatCount)}
              </Badge>
            ) : null}
          </div>
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
            <span className="text-muted-foreground">{copy.paidAmount}</span>
            <span className="font-mono">
              {messages.inventory.common.currencyCompact(
                formatVND(group.paidAmount),
              )}
            </span>
          </div>
          {group.creditAppliedAmount > 0 ? (
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">
                {copy.supplierCredit}
              </span>
              <span className="font-mono">
                {messages.inventory.common.currencyCompact(
                  formatVND(group.creditAppliedAmount),
                )}
              </span>
            </div>
          ) : null}
        </div>

        <span className="mt-4 text-sm font-medium text-primary">
          {isActive ? copy.analyzing : copy.groupDetailAction}
        </span>
      </InteractiveCard>
    );
  };

  const getSupplierInvoiceGroupRowActions = (
    group: SupplierInvoiceGroup,
  ): RowActionItem[] => {
    const primaryInvoice = getPrimaryInvoice(group);
    return [
      {
        key: "view",
        label: copy.groupDetailAction,
        icon: <IconEye data-icon="inline-start" />,
        disabled: primaryInvoice == null,
        onSelect: () => {
          if (primaryInvoice) openInvoiceDetail(primaryInvoice.id);
        },
      },
    ];
  };

  const invoiceGroupColumns: DataTableColumn<SupplierInvoiceGroup>[] = [
    {
      key: "group",
      header: viewMode === "supplier" ? copy.supplierGroup : copy.poGroup,
      className: "min-w-56",
      render: (group) => (
        <div className="flex min-w-0 flex-col gap-1">
          <p className="truncate text-foreground">{group.title}</p>
          <p className="text-xs text-muted-foreground">{group.subtitle}</p>
          <div className="flex flex-wrap gap-1">
            {group.overdueCount > 0 ? (
              <Badge
                variant="outline"
                className="w-fit border-destructive/20 text-xs"
              >
                {copy.overdueGroupSummary(group.overdueCount)}
              </Badge>
            ) : null}
            {group.missingVatCount > 0 ? (
              <Badge
                variant="outline"
                className="w-fit border-warning/20 text-xs"
              >
                {copy.vatMissingGroupSummary(group.missingVatCount)}
              </Badge>
            ) : null}
          </div>
        </div>
      ),
    },
    {
      key: "invoiceCount",
      header: copy.invoiceCountHeader,
      className:
        viewMode === "supplier" ? "min-w-20 text-right" : "min-w-40",
      render: (group) =>
        viewMode === "supplier" ? (
          <span className="font-mono text-sm tabular-nums">
            {group.invoiceCount}
          </span>
        ) : (
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-sm text-muted-foreground">
              {copy.invoiceGroupSummary(group.invoiceCount)}
            </span>
            {group.invoices.length > 0 ? (
              <span className="truncate font-mono text-xs text-muted-foreground">
                {copy.invoiceCodesPreview(
                  group.invoices.map((invoice) => invoice.code),
                )}
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
        <div className="flex flex-col items-end gap-1 text-right">
          <span className="font-mono text-sm tabular-nums">
            {messages.inventory.common.currencyCompact(
              formatVND(group.paidAmount),
            )}
          </span>
          {group.creditAppliedAmount > 0 ? (
            <span className="text-xs text-muted-foreground">
              {copy.supplierCredit}:{" "}
              <span className="font-mono tabular-nums">
                {messages.inventory.common.currencyCompact(
                  formatVND(group.creditAppliedAmount),
                )}
              </span>
            </span>
          ) : null}
        </div>
      ),
    },
    {
      key: "outstanding",
      header: copy.outstandingPayable,
      className: "min-w-40 text-right",
      render: (group) => (
        <span className="font-mono text-sm tabular-nums">
          {messages.inventory.common.currencyCompact(
            formatVND(group.outstandingAmount),
          )}
        </span>
      ),
    },
    {
      key: "action",
      header: "",
      className: "w-12 text-right",
      render: (group) => {
        const items = getSupplierInvoiceGroupRowActions(group);

        return (
          <div
            className="flex justify-end"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
          >
            <RowActionsMenu
              items={items}
              label={`${copy.groupDetailAction}: ${group.title}`}
              triggerSize={controlSize === "touch" ? "icon-touch" : "icon"}
            />
          </div>
        );
      },
    },
  ];

  const viewModeActions = (
    <div className="flex flex-wrap gap-2">
      <Select
        value={viewMode}
        onValueChange={(value) =>
          replaceListParam("view", value === "supplier" ? null : value)
        }
      >
        <SelectTrigger
          size={controlSize}
          className={
            controlSize === "touch"
              ? "w-full"
              : inventoryListFilterSelectClassName
          }
          aria-label={copy.groupByAria}
        >
          <SelectValue placeholder={copy.groupByLabel} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem
            value="supplier"
            size={controlSize === "touch" ? "touch" : "default"}
          >
            {copy.viewBySupplier}
          </SelectItem>
          <SelectItem
            value="po"
            size={controlSize === "touch" ? "touch" : "default"}
          >
            {copy.viewByPo}
          </SelectItem>
        </SelectContent>
      </Select>
      <Button
        type="button"
        size={controlSize}
        variant={showOnlyOverdue ? "default" : "outline"}
        onClick={() =>
          replaceListParam("overdue", showOnlyOverdue ? null : "1")
        }
        aria-pressed={showOnlyOverdue}
      >
        <IconAlertTriangle data-icon="inline-start" />
        {copy.overdueOnly}
      </Button>
      <Button
        type="button"
        size={controlSize}
        variant={showOnlyMissingVat ? "default" : "outline"}
        onClick={() =>
          replaceListParam("vat", showOnlyMissingVat ? null : "missing")
        }
        aria-pressed={showOnlyMissingVat}
        aria-label={copy.vatMissingOnlyAria}
      >
        <IconReceipt data-icon="inline-start" />
        {copy.vatMissingOnly}
      </Button>
    </div>
  );

  const activeGroupId = selectedGroupId;
  const selectedAgingLabel = selectedInvoice
    ? getInvoiceAgingLabel(selectedInvoice, copy)
    : null;
  const selectedLastPayment = selectedInvoice?.lastPayment ?? null;
  const missingVatAttachment =
    selectedInvoice != null && !selectedInvoice.vatInvoiceAttachmentPath;
  const canShowPayAction =
    canPaySupplier && selectedInvoice != null && selectedOutstandingAmount > 0;
  const payIsPrimary =
    canShowPayAction &&
    selectedInvoice != null &&
    selectedInvoice.vatInvoiceAttachmentPath != null;
  const uploadIsPrimary =
    canAttachVatEvidence &&
    missingVatAttachment &&
    selectedOutstandingAmount > 0;
  const showMatchProblem =
    selectedInvoice != null &&
    (selectedMissingMatchingEvidence ||
      (selectedInvoice.variance !== null && selectedInvoice.variance > 0));
  const vatSummaryLabel =
    selectedInvoice != null && selectedInvoice.vatBreakdown.length > 0
      ? selectedInvoice.vatBreakdown
          .map((line) =>
            copy.vatBucketSummary(
              formatPercent(line.vatRate, 0),
              messages.inventory.common.currencyCompact(
                formatVND(line.taxableAmount),
              ),
            ),
          )
          .join(" · ")
      : null;

  const detailTitle =
    selectedInvoice != null ? selectedInvoice.code : copy.noInvoiceSelected;

  const detailSubtitle =
    selectedInvoice != null
      ? [
          selectedInvoice.supplierName,
          selectedAgingLabel,
          selectedGroup != null && selectedGroup.invoiceCount > 1
            ? copy.invoiceGroupSummary(selectedGroup.invoiceCount)
            : null,
        ]
          .filter(Boolean)
          .join(" · ")
      : null;

  return (
    <AppPage width="xwide">
      <AppPageHeader
        title={copy.title}
        description={description}
        actions={
          <Button
            type="button"
            size="touch"
            onClick={() => setCreateOpen(true)}
          >
            {copy.createAction}
          </Button>
        }
      />

      <AppListFrame
            title={
              viewMode === "supplier" ? copy.viewBySupplier : copy.viewByPo
            }
            headerHint={copy.groupCount(allInvoiceGroups.length, totalCount)}
            toolbar={
              <AppToolbar
                variant="inline"
                className="[&>[data-slot=toolbar-group]:first-child]:min-w-64"
                search={
                  <InputGroup size={controlSize} className="min-w-0 flex-1">
                    <InputGroupAddon>
                      <IconSearch />
                    </InputGroupAddon>
                    <InputGroupInput
                      type="search"
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder={copy.searchPlaceholder}
                      aria-label={copy.searchPlaceholder}
                    />
                  </InputGroup>
                }
                filters={
                  <>
                    <Combobox
                      value={supplierFilter}
                      onValueChange={(value) =>
                        replaceListParam(
                          "supplierId",
                          value === ALL_FILTER_VALUE ? null : value,
                        )
                      }
                      options={[
                        { value: ALL_FILTER_VALUE, label: copy.allSuppliers },
                        ...supplierOptions,
                      ]}
                      placeholder={copy.supplierPlaceholder}
                      searchPlaceholder={copy.supplierSearchPlaceholder}
                      aria-label={copy.supplierFilterAria}
                      size={controlSize}
                      triggerClassName={
                        controlSize === "touch"
                          ? "w-full"
                          : inventoryListFilterSelectClassName
                      }
                    />

                    <Select
                      value={matchStatusFilter}
                      onValueChange={(value) =>
                        replaceListParam(
                          "matchStatus",
                          value === ALL_FILTER_VALUE ? null : value,
                        )
                      }
                    >
                      <SelectTrigger
                        size={controlSize}
                        className={
                          controlSize === "touch"
                            ? "w-full"
                            : inventoryListFilterSelectClassName
                        }
                      >
                        <SelectValue placeholder={copy.matchingPlaceholder} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem
                          value={ALL_FILTER_VALUE}
                          size={controlSize === "touch" ? "touch" : "default"}
                        >
                          {copy.allMatching}
                        </SelectItem>
                        {MATCH_FILTER_OPTIONS.map((option) => (
                          <SelectItem
                            key={option.value}
                            value={option.value}
                            size={controlSize === "touch" ? "touch" : "default"}
                          >
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Select
                      value={paymentStatusFilter}
                      onValueChange={(value) =>
                        replaceListParam(
                          "paymentStatus",
                          value === ALL_FILTER_VALUE ? null : value,
                        )
                      }
                    >
                      <SelectTrigger
                        size={controlSize}
                        className={
                          controlSize === "touch"
                            ? "w-full"
                            : inventoryListFilterSelectClassName
                        }
                      >
                        <SelectValue placeholder={copy.paymentPlaceholder} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem
                          value={ALL_FILTER_VALUE}
                          size={controlSize === "touch" ? "touch" : "default"}
                        >
                          {copy.allPayments}
                        </SelectItem>
                        {PAYMENT_FILTER_OPTIONS.map((option) => (
                          <SelectItem
                            key={option.value}
                            value={option.value}
                            size={controlSize === "touch" ? "touch" : "default"}
                          >
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </>
                }
                actions={viewModeActions}
              />
            }
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
                if (primaryInvoice) openInvoiceDetail(primaryInvoice.id);
              }}
              getRowAriaLabel={(group) =>
                `${copy.groupDetailAction}: ${group.title}`
              }
              getRowDataState={(group) =>
                group.id === activeGroupId && detailOpen
                  ? "selected"
                  : undefined
              }
              renderRowContextMenu={(group) => (
                <RowActionsContextMenuItems
                  items={getSupplierInvoiceGroupRowActions(group)}
                />
              )}
              mobileCardRender={renderInvoiceGroupCard}
            />
            {hasMore ? (
              <div className="flex justify-center p-3">
                <Button
                  type="button"
                  variant="outline"
                  size="touch"
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                >
                  {copy.loadMore}
                </Button>
              </div>
            ) : null}
          </AppListFrame>

      <Sheet open={detailOpen} onOpenChange={handleDetailOpenChange}>
        <SheetContent
          side="right"
          size="lg"
          className="w-full gap-1 p-0 sm:max-w-xl"
        >
          <SheetHeader>
            <SheetTitle className="font-mono">{detailTitle}</SheetTitle>
            {detailSubtitle ? (
              <SheetDescription>{detailSubtitle}</SheetDescription>
            ) : null}
          </SheetHeader>

          {selectedInvoice ? (
            <>
              <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-3 py-4 sm:px-4">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge
                    domain="inventory"
                    value={getDisplayMatchStatus(selectedInvoice)}
                  />
                  <StatusBadge
                    domain="inventory"
                    value={selectedInvoice.paymentStatus}
                  />
                </div>

                {invoicesInSelectedGroup.length > 1 ? (
                  <Select
                    value={String(selectedInvoice.id)}
                    onValueChange={(value) => openInvoiceDetail(Number(value))}
                  >
                    <SelectTrigger
                      size={controlSize}
                      className="w-full"
                      aria-label={copy.selectInvoiceInGroupAria}
                    >
                      <SelectValue placeholder={copy.selectInvoiceInGroup} />
                    </SelectTrigger>
                    <SelectContent>
                      {invoicesInSelectedGroup.map((invoice) => (
                        <SelectItem
                          key={invoice.id}
                          value={String(invoice.id)}
                          size={controlSize === "touch" ? "touch" : "default"}
                        >
                          <span className="font-mono">{invoice.code}</span>
                          {" · "}
                          {messages.inventory.common.currencyCompact(
                            formatVND(
                              getSupplierInvoiceOutstandingAmount(invoice),
                            ),
                          )}
                          {isSupplierInvoiceMissingVatEvidence(invoice) ? (
                            <span className="text-warning">
                              {" · "}
                              {copy.vatAttachmentMissing}
                            </span>
                          ) : null}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : null}

                <Item variant="outline" size="sm" className="items-start">
                  <ItemContent className="gap-1">
                    <ItemDescription className="line-clamp-none">
                      {copy.outstandingPayable}
                    </ItemDescription>
                    <ItemTitle
                      size="heading"
                      className={cn(
                        "line-clamp-none font-mono text-2xl font-semibold tabular-nums tracking-tight",
                        isInvoiceOverdue(selectedInvoice) &&
                          selectedOutstandingAmount > 0 &&
                          "text-destructive",
                      )}
                    >
                      {messages.inventory.common.currencyCompact(
                        formatVND(selectedOutstandingAmount),
                      )}
                    </ItemTitle>
                    <ItemDescription className="line-clamp-none">
                      {copy.totalInvoice}{" "}
                      {messages.inventory.common.currencyCompact(
                        formatVND(selectedInvoice.amount),
                      )}
                      {" · "}
                      {copy.paidAmount}{" "}
                      {messages.inventory.common.currencyCompact(
                        formatVND(selectedInvoice.paidAmount),
                      )}
                      {selectedInvoice.creditAppliedAmount > 0
                        ? ` · ${copy.supplierCredit} ${messages.inventory.common.currencyCompact(
                            formatVND(selectedInvoice.creditAppliedAmount),
                          )}`
                        : null}
                    </ItemDescription>
                  </ItemContent>
                </Item>

                {missingVatAttachment ? (
                  <Item variant="outline" size="sm" className="items-start">
                    <ItemContent className="gap-1">
                      <ItemTitle size="heading" className="line-clamp-none">
                        {copy.vatAttachmentMissing}
                      </ItemTitle>
                      <ItemDescription className="line-clamp-none">
                        {canShowPayAction
                          ? copy.paymentBlockedNoVatAttachment
                          : copy.vatAttachmentHint}
                      </ItemDescription>
                    </ItemContent>
                    {canAttachVatEvidence ? (
                      <ItemActions>
                        <Button
                          variant={uploadIsPrimary ? "default" : "outline"}
                          size={controlSize}
                          className="relative"
                          disabled={vatUploading || isPending}
                          render={<label />}
                        >
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp,application/pdf"
                            className="absolute inset-0 cursor-pointer opacity-0"
                            disabled={vatUploading || isPending}
                            onChange={(event) => {
                              const file = event.target.files?.[0];
                              event.target.value = "";
                              if (file) void handleVatAttachmentUpload(file);
                            }}
                          />
                          {vatUploading ? (
                            <Spinner className="size-4" />
                          ) : (
                            <IconUpload className="size-4" />
                          )}
                          {copy.vatAttachmentUpload}
                        </Button>
                      </ItemActions>
                    ) : null}
                  </Item>
                ) : (
                  <Item variant="outline" size="sm">
                    <ItemContent>
                      <ItemTitle size="heading" className="line-clamp-none">
                        {copy.vatAttachmentReady}
                      </ItemTitle>
                    </ItemContent>
                    <ItemActions>
                      <Button
                        type="button"
                        variant="outline"
                        size={controlSize}
                        onClick={() => void handleOpenVatAttachment()}
                      >
                        {copy.vatAttachmentOpen}
                      </Button>
                    </ItemActions>
                  </Item>
                )}

                <ItemGroup className="grid grid-cols-2 gap-2">
                  <DetailFact
                    label={copy.invoiceDate}
                    value={formatDate(selectedInvoice.invoiceDate)}
                  />
                  <DetailFact
                    label={copy.dueDate}
                    value={formatDate(selectedInvoice.dueDate)}
                    valueClassName={
                      isInvoiceOverdue(selectedInvoice)
                        ? "text-destructive"
                        : undefined
                    }
                  />
                  {vatSummaryLabel ? (
                    <DetailFact
                      label={copy.vat}
                      value={
                        <span className="flex flex-col gap-1">
                          <span>{vatSummaryLabel}</span>
                          <span className="font-mono tabular-nums">
                            {messages.inventory.common.currencyCompact(
                              formatVND(selectedInvoice.vatAmount),
                            )}
                          </span>
                        </span>
                      }
                    />
                  ) : null}
                  <DetailFact
                    label={copy.aging}
                    value={selectedAgingLabel}
                    valueClassName={
                      isInvoiceOverdue(selectedInvoice)
                        ? "text-destructive"
                        : undefined
                    }
                  />
                  <DetailFact
                    label={copy.linkedGrn}
                    value={
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
                      )
                    }
                  />
                  <DetailFact
                    label={copy.linkedPo}
                    value={
                      selectedInvoice.poCode && selectedInvoice.poId != null ? (
                        <span className="font-mono">
                          {selectedInvoice.poCode}
                        </span>
                      ) : (
                        copy.notLinked
                      )
                    }
                  />
                  {selectedLastPayment ? (
                    <DetailFact
                      className="col-span-2"
                      label={copy.lastPayment}
                      value={copy.lastPaymentSummary(
                        formatDate(selectedLastPayment.paymentDate),
                        getPaymentMethodLabel(
                          selectedLastPayment.paymentMethod,
                          copy,
                        ),
                        messages.inventory.common.currencyCompact(
                          formatVND(selectedLastPayment.amount),
                        ),
                      )}
                    />
                  ) : null}
                </ItemGroup>

                {showMatchProblem ? (
                  selectedMissingMatchingEvidence ? (
                    <Alert className="border-warning/20 bg-warning/10 text-warning">
                      <IconAlertTriangle />
                      <AlertTitle>{copy.missingGrnTitle}</AlertTitle>
                      <AlertDescription className="text-muted-foreground">
                        {copy.missingGrnDescription}
                      </AlertDescription>
                    </Alert>
                  ) : (
                    <Alert variant="destructive">
                      <IconAlertTriangle />
                      <AlertTitle>
                        {copy.varianceTitle(
                          formatPercent(selectedInvoice.variance ?? 0, 3),
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
                  )
                ) : null}
              </div>

              <SheetFooter>
                <div className="flex flex-wrap gap-2">
                  {canShowPayAction ? (
                    <Button
                      type="button"
                      size="touch"
                      className="flex-1"
                      variant={payIsPrimary ? "default" : "outline"}
                      onClick={openSupplierPaymentDialog}
                      disabled={isPending || missingVatAttachment}
                    >
                      {copy.payAction}
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    size="touch"
                    className={canShowPayAction ? "flex-1" : "w-full"}
                    variant="outline"
                    onClick={handleRecomputeMatching}
                    disabled={isPending}
                  >
                    {copy.recomputeMatching}
                  </Button>
                </div>
              </SheetFooter>
            </>
          ) : (
            <div className="px-3 py-4 sm:px-4">
              <AppEmptyState
                compact
                title={copy.noAnalysisTitle}
                description={copy.noAnalysisDescription}
              />
            </div>
          )}
        </SheetContent>
      </Sheet>

      <FormDialog
        open={createOpen}
        onOpenChange={handleCreateOpenChange}
        schema={supplierInvoiceSchema}
        defaultValues={createDefaultValues}
        entityKey="new-supplier-invoice"
        title={copy.createAction}
        description={copy.createDescription}
        submitLabel={copy.saveInvoice}
        cancelLabel={ACTIONS_VI.cancel}
        successMessage={STATES_VI.saved}
        contentClassName="sm:max-w-2xl"
        onSubmit={handleCreateInvoice}
      >
        {(form) => (
          <SupplierInvoiceCreateFields
            key={`create-fields-${preselectGrnId ?? "none"}`}
            form={form}
            suppliers={suppliers}
            grns={grns}
            copy={copy}
            canAttachVatEvidence={canAttachVatEvidence}
            pendingVatFile={pendingCreateVatFile}
            onPendingVatFileChange={setPendingCreateVatFile}
          />
        )}
      </FormDialog>

      <FormDialog
        open={paymentOpen}
        onOpenChange={handlePaymentOpenChange}
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
