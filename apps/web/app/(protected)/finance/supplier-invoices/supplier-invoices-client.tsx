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
  ListFilter as IconFilter,
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
  InputGroupText,
} from "@comtammatu/ui/components/input-group";
import { NoteCallout } from "@comtammatu/ui/components/note-callout";
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@comtammatu/ui/components/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { toast } from "@comtammatu/ui/components/sonner";
import { ReasonConfirmDialog } from "@comtammatu/ui/components/reason-confirm-dialog";
import { Tabs, TabsList, TabsTrigger } from "@comtammatu/ui/components/tabs";
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
  MoneyVndInput,
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
  attachSupplierInvoiceVatEvidence,
  acceptSupplierInvoiceDiscrepancy,
  allocateSupplierAdvance,
  createSupplierCreditAllocated,
  createSupplierInvoice,
  confirmSupplierInvoice,
  fetchSupplierInvoicesPage,
  getSupplierInvoiceValuationSummary,
  recordSupplierPayment,
  recomputeInvoiceMatching,
  verifyServiceSupplierInvoice,
  type SupplierAdvanceSummary,
  type SupplierInvoiceCursor,
  type SupplierInvoiceValuationSummary,
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

import {
  formatAccountingVND as formatVND,
  formatPercent,
} from "@comtammatu/shared/format";
import {
  addMoney,
  canonicalizeMoney,
  hasMaximumScale,
  minorUnitsToCanonical,
  parseMoneyToMinorUnits,
} from "@comtammatu/shared/money";
import { messages } from "@lib/messages";

import { ACTIONS_VI, FORM_VI, STATES_VI } from "@comtammatu/shared/messages";
import {
  diffVNDateDays,
  formatVNDate,
  getVNDateString,
} from "@comtammatu/shared/time";
import {
  calculateSupplierInvoiceGrossLineTotal,
  calculateSupplierInvoiceNetLineTotal,
  resolveSupplierInvoiceVatAmount,
  summarizeSupplierInvoiceMoney,
  type SupplierInvoiceVatMode,
  type SupplierInvoiceVatRate,
} from "../_lib/supplier-invoice-money";
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
  lines: Array<{
    grnItemId: number;
    purchaseOrderItemId: number;
    ingredientId: number;
    ingredientName: string;
    unitId: number;
    unitLabel: string;
    availableQuantity: number;
  }>;
};

type SupplierInvoiceMode =
  "view" | "create" | "edit" | "pay" | "credit" | "advance";

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

const optionalMoneySchema = z.string().refine(
  (value) => {
    if (!value.trim()) return true;
    return (
      /^(?:0|[1-9]\d{0,12})(?:\.\d{1,2})?$/.test(value) &&
      hasMaximumScale(value, 2) &&
      parseMoneyToMinorUnits(value) >= 0n
    );
  },
  { error: messages.inventory.supplierInvoices.invalidAmount },
);

const positiveMoneySchema = optionalMoneySchema.refine(
  (value) => {
    try {
      return !!value && parseMoneyToMinorUnits(value) > 0n;
    } catch {
      return false;
    }
  },
  { error: FORM_VI.required },
);

function canonicalMoney(value: string | number): string {
  return canonicalizeMoney(value || 0);
}

function minimumMinorUnits(values: readonly bigint[]): bigint {
  return values.reduce(
    (minimum, value) => (value < minimum ? value : minimum),
    values[0] ?? 0n,
  );
}

function allocateSupplierMoney(
  requestedAmount: string,
  invoices: readonly SupplierInvoiceRow[],
) {
  let remaining = parseMoneyToMinorUnits(canonicalMoney(requestedAmount));
  return invoices.flatMap((invoice) => {
    if (remaining <= 0n) return [];
    const outstanding = parseMoneyToMinorUnits(
      canonicalMoney(getSupplierInvoiceOutstandingAmount(invoice)),
    );
    const allocated = minimumMinorUnits([remaining, outstanding]);
    remaining -= allocated;
    return allocated > 0n
      ? [{ invoiceId: invoice.id, amount: minorUnitsToCanonical(allocated) }]
      : [];
  });
}

const supplierInvoiceSchema = z
  .object({
    invoiceKind: z.enum(["goods", "service"]),
    grnId: z.string(),
    supplierId: z.string().min(1, { error: FORM_VI.required }),
    invoiceDate: z.string().min(1, { error: FORM_VI.required }),
    invoiceVatRate: z.preprocess(
      Number,
      z.union([z.literal(0), z.literal(5), z.literal(8), z.literal(10)]),
    ),
    documentDiscount: optionalMoneySchema,
    lines: z
      .array(
        z.object({
          key: z.string(),
          ingredientId: z.number().int().positive().nullable(),
          description: z.string().trim().min(1),
          quantity: z.number().positive(),
          unitId: z.number().int().positive().nullable(),
          unitLabel: z.string(),
          unitPrice: optionalMoneySchema,
          grossLineTotal: optionalMoneySchema,
          lineDiscount: optionalMoneySchema,
          vatRate: z.preprocess(
            Number,
            z.union([z.literal(0), z.literal(5), z.literal(8), z.literal(10)]),
          ),
          vatAmount: optionalMoneySchema,
          vatMode: z.enum(["auto", "manual"]),
          allocations: z.array(
            z.object({
              grnId: z.number().int().positive(),
              poId: z.number().int().positive(),
              purchaseOrderItemId: z.number().int().positive(),
              quantity: z.number().positive(),
            }),
          ),
        }),
      )
      .min(1, FORM_VI.required),
  })
  .superRefine((data, ctx) => {
    if (data.invoiceKind === "goods" && data.grnId === "none") {
      ctx.addIssue({
        code: "custom",
        message: messages.inventory.supplierInvoices.goodsReceiptRequired,
        path: ["grnId"],
      });
    }
    data.lines.forEach((line, index) => {
      if (data.invoiceKind === "goods" && line.allocations.length === 0) {
        ctx.addIssue({
          code: "custom",
          message: "Dòng hàng hóa chưa được phân bổ tới phiếu nhập.",
          path: ["lines", index],
        });
      }
      if (!line.unitPrice) {
        ctx.addIssue({
          code: "custom",
          message: FORM_VI.required,
          path: ["lines", index, "unitPrice"],
        });
      }
      if (!line.vatAmount) {
        ctx.addIssue({
          code: "custom",
          message: FORM_VI.required,
          path: ["lines", index, "vatAmount"],
        });
      }
      const grossLineTotal =
        line.grossLineTotal
          ? canonicalMoney(line.grossLineTotal)
          : calculateSupplierInvoiceGrossLineTotal(
              calculateSupplierInvoiceNetLineTotal(
                String(line.quantity),
                line.unitPrice,
                line.lineDiscount,
              ),
              line.vatAmount,
            );
      if (
        line.vatAmount &&
        parseMoneyToMinorUnits(canonicalMoney(line.vatAmount)) >
          parseMoneyToMinorUnits(grossLineTotal)
      ) {
        ctx.addIssue({
          code: "custom",
          message: messages.inventory.supplierInvoices.vatExceedsGross,
          path: ["lines", index, "vatAmount"],
        });
      }
    });
  });

type SupplierInvoiceFormValues = z.infer<typeof supplierInvoiceSchema>;

const supplierPaymentSchema = z.object({
  amount: positiveMoneySchema,
  paymentMethod: z.enum(["cash", "bank_transfer"]),
  referenceNote: z.string().trim().optional(),
});

type SupplierPaymentFormValues = z.infer<typeof supplierPaymentSchema>;

const supplierAdvanceSchema = z.object({
  paymentId: z.string().min(1, { error: FORM_VI.required }),
  amount: positiveMoneySchema,
});

type SupplierAdvanceFormValues = z.infer<typeof supplierAdvanceSchema>;

const supplierCreditSchema = z.object({
  creditNumber: z.string().trim().min(1, FORM_VI.required),
  amount: positiveMoneySchema,
  notes: z
    .string()
    .trim()
    .min(5, "Lý do giảm công nợ phải có ít nhất 5 ký tự")
    .max(500),
});

type SupplierCreditFormValues = z.infer<typeof supplierCreditSchema>;

function createSupplierInvoiceDefaultValues(
  preselectGrnOptionKey?: string | null,
): SupplierInvoiceFormValues {
  return {
    invoiceKind: "goods",
    grnId: preselectGrnOptionKey ?? "none",
    supplierId: "",
    invoiceDate: getVNDateString(),
    invoiceVatRate: 8,
    documentDiscount: "",
    lines: [],
  };
}

function editSupplierInvoiceDefaultValues(
  invoice: SupplierInvoiceRow,
  grns: GrnOption[],
): SupplierInvoiceFormValues {
  const selectedGrnKeys = [
    ...new Set(
      invoice.receiptAllocations.flatMap((allocation) => {
        const option = grns.find(
          (candidate) =>
            candidate.id === allocation.grnId &&
            candidate.supplierId === invoice.supplierId,
        );
        return option ? [option.optionKey] : [];
      }),
    ),
  ];
  return {
    invoiceKind: invoice.invoiceKind,
    grnId: selectedGrnKeys.length > 0 ? selectedGrnKeys.join(",") : "none",
    supplierId: String(invoice.supplierId),
    invoiceDate: invoice.invoiceDate ?? getVNDateString(),
    invoiceVatRate: (invoice.invoiceLines[0]?.vatRate ??
      8) as SupplierInvoiceVatRate,
    documentDiscount: canonicalMoney(invoice.documentDiscountAmount),
    lines: invoice.invoiceLines.map((line) => ({
      key:
        line.ingredientId != null && line.unitId != null
          ? `${line.ingredientId}:${line.unitId}`
          : `service:${line.id}`,
      ingredientId: line.ingredientId,
      description: line.description,
      quantity: line.quantity,
      unitId: line.unitId,
      unitLabel: line.unitLabel,
      unitPrice: canonicalMoney(line.unitPrice),
      grossLineTotal: canonicalMoney(line.grossLineTotal),
      lineDiscount: canonicalMoney(line.lineDiscount),
      vatRate: line.vatRate as SupplierInvoiceVatRate,
      vatAmount: canonicalMoney(line.vatAmount),
      vatMode: "manual" as SupplierInvoiceVatMode,
      allocations: line.allocations,
    })),
  };
}

function createSupplierPaymentDefaultValues(
  invoice?: SupplierInvoiceRow | null,
  outstanding?: string,
): SupplierPaymentFormValues {
  return {
    amount: invoice
      ? (outstanding ??
        canonicalMoney(getSupplierInvoiceOutstandingAmount(invoice)))
      : "",
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
  return (
    invoice.invoiceKind === "goods" && invoice.receiptAllocations.length === 0
  );
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
  const invoiceKind = form.watch("invoiceKind");
  const grnId = form.watch("grnId");
  const invoiceVatRate = form.watch("invoiceVatRate");
  const formValues = form.watch();
  const selectedGrnKeys =
    grnId === "none" ? [] : grnId.split(",").filter(Boolean);
  const selectedGrns = grns.filter((option) =>
    selectedGrnKeys.includes(option.optionKey),
  );
  const selectedGrn = selectedGrns[0] ?? null;
  const invoiceLines = formValues.lines ?? [];
  const calculatedLines = invoiceLines.map((line) => {
    const unitPrice = canonicalMoney(line.unitPrice);
    const netLineTotal = calculateSupplierInvoiceNetLineTotal(
      String(line.quantity),
      line.unitPrice,
      line.lineDiscount,
    );
    const resolvedVatAmount = resolveSupplierInvoiceVatAmount(
      netLineTotal,
      line.vatRate as SupplierInvoiceVatRate,
      line.vatMode,
      line.vatAmount,
    );
    return {
      grossLineTotal: calculateSupplierInvoiceGrossLineTotal(
        netLineTotal,
        resolvedVatAmount,
      ),
      unitPrice,
      vatAmount: resolvedVatAmount,
      netLineTotal,
    };
  });
  const { subtotal, vatAmount, totalAmount } = summarizeSupplierInvoiceMoney(
    calculatedLines,
    formValues.documentDiscount,
  );

  useEffect(() => {
    if (invoiceKind !== "service") return;
    if (form.getValues("grnId") !== "none") {
      form.setValue("grnId", "none", {
        shouldDirty: true,
        shouldValidate: true,
      });
    }
    const current = form.getValues("lines");
    if (current.length === 1 && current[0]?.ingredientId == null) return;
    form.setValue(
      "lines",
      [
        {
          key: crypto.randomUUID(),
          ingredientId: null,
          description: "Dịch vụ",
          quantity: 1,
          unitId: null,
          unitLabel: "Lần",
          unitPrice: "",
          grossLineTotal: "",
          lineDiscount: "",
          vatRate: form.getValues("invoiceVatRate"),
          vatAmount: "0.00",
          vatMode: "auto",
          allocations: [],
        },
      ],
      { shouldDirty: true, shouldValidate: true },
    );
  }, [form, invoiceKind]);

  useEffect(() => {
    if (!selectedGrn || invoiceKind !== "goods") return;

    const nextSupplierId = String(selectedGrn.supplierId);
    if (form.getValues("supplierId") !== nextSupplierId) {
      form.setValue("supplierId", nextSupplierId, {
        shouldDirty: true,
        shouldValidate: true,
      });
    }
    const vatRate = form.getValues("invoiceVatRate");
    const currentByKey = new Map(
      form.getValues("lines").map((line) => [line.key, line]),
    );
    const grouped = new Map<
      string,
      SupplierInvoiceFormValues["lines"][number]
    >();
    for (const receipt of selectedGrns) {
      if (receipt.poId == null) continue;
      for (const line of receipt.lines) {
        const key = `${line.ingredientId}:${line.unitId}`;
        const existing = grouped.get(key);
        const preserved = currentByKey.get(key);
        const allocation = {
          grnId: receipt.id,
          poId: receipt.poId,
          purchaseOrderItemId: line.purchaseOrderItemId,
          quantity: line.availableQuantity,
        };
        if (existing) {
          existing.quantity += line.availableQuantity;
          existing.allocations.push(allocation);
        } else {
          grouped.set(key, {
            key,
            ingredientId: line.ingredientId,
            description: line.ingredientName,
            quantity: line.availableQuantity,
            unitId: line.unitId,
            unitLabel: line.unitLabel,
            unitPrice: preserved?.unitPrice ?? "",
            grossLineTotal: preserved?.grossLineTotal ?? "",
            lineDiscount: preserved?.lineDiscount ?? "",
            vatRate,
            vatAmount: "0.00",
            vatMode: "auto",
            allocations: [allocation],
          });
        }
      }
    }
    form.setValue("lines", [...grouped.values()], {
      shouldDirty: true,
      shouldValidate: true,
    });
  }, [form, grnId, invoiceKind, selectedGrn?.supplierId]);

  const supplierOptions = useMemo(
    () =>
      suppliers.map((option) => ({
        value: String(option.id),
        label: option.name,
      })),
    [suppliers],
  );

  function toggleGrn(option: GrnOption) {
    const isSelected = selectedGrnKeys.includes(option.optionKey);
    const next = isSelected
      ? selectedGrnKeys.filter((key) => key !== option.optionKey)
      : [
          ...selectedGrnKeys.filter((key) => {
            const current = grns.find(
              (candidate) => candidate.optionKey === key,
            );
            return current?.supplierId === option.supplierId;
          }),
          option.optionKey,
        ];
    form.setValue("grnId", next.length > 0 ? next.join(",") : "none", {
      shouldDirty: true,
      shouldValidate: true,
    });
  }

  function patchInvoiceLine(
    index: number,
    patch: Partial<SupplierInvoiceFormValues["lines"][number]>,
  ) {
    const next = form
      .getValues("lines")
      .map((line, lineIndex) =>
        lineIndex === index ? { ...line, ...patch } : line,
      );
    form.setValue("lines", next, {
      shouldDirty: true,
      shouldValidate: true,
    });
  }

  function applyInvoiceVatRate(rate: SupplierInvoiceVatRate) {
    const next = form.getValues("lines").map((line, index) => {
      const netLineTotal = calculatedLines[index]?.netLineTotal ?? "0.00";
      const vatAmount = resolveSupplierInvoiceVatAmount(
        netLineTotal,
        rate,
        "auto",
        "",
      );
      return {
        ...line,
        vatRate: rate,
        vatAmount,
        grossLineTotal: calculateSupplierInvoiceGrossLineTotal(
          netLineTotal,
          vatAmount,
        ),
        vatMode: "auto" as const,
      };
    });
    form.setValue("invoiceVatRate", rate, {
      shouldDirty: true,
      shouldValidate: true,
    });
    form.setValue("lines", next, { shouldDirty: true, shouldValidate: true });
  }

  return (
    <>
      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium">{copy.documentSection}</p>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="flex min-w-0 flex-col gap-3">
            <SelectField
              control={form.control}
              name="invoiceKind"
              label={copy.invoiceKind}
              options={[
                { value: "goods", label: copy.invoiceKinds.goods },
                { value: "service", label: copy.invoiceKinds.service },
              ]}
              required
            />
            {invoiceKind === "goods" ? (
              <div className="flex flex-col gap-2">
                <p className="text-sm font-medium">{copy.linkedGrn}</p>
                <p className="text-xs text-muted-foreground">
                  {copy.grnSelectionHint}
                </p>
                <div className="grid max-h-48 gap-2 overflow-y-auto sm:grid-cols-2">
                  {grns.map((option) => {
                    const isSelected = selectedGrnKeys.includes(
                      option.optionKey,
                    );
                    const disabled =
                      selectedGrn != null &&
                      selectedGrn.supplierId !== option.supplierId;
                    return (
                      <Button
                        key={option.optionKey}
                        type="button"
                        variant={isSelected ? "secondary" : "outline"}
                        className="h-auto justify-start py-2 text-left"
                        disabled={disabled}
                        aria-pressed={isSelected}
                        onClick={() => toggleGrn(option)}
                      >
                        <span>
                          <span className="block font-mono">{option.code}</span>
                          <span className="block text-xs text-muted-foreground">
                            {option.supplierName}
                          </span>
                        </span>
                      </Button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <NoteCallout tone="muted">{copy.serviceInvoiceHint}</NoteCallout>
            )}
            {invoiceKind === "goods" && selectedGrn ? (
              <NoteCallout tone="muted">
                <div className="flex flex-col gap-1 text-sm">
                  <span>
                    {selectedGrns.map((receipt) => receipt.code).join(" · ")} ·{" "}
                    {selectedGrn.supplierName}
                  </span>
                  {selectedGrns.every(
                    (receipt) => receipt.netAcceptedAmount != null,
                  ) ? (
                    <span className="text-muted-foreground">
                      {copy.grnNetAcceptedLabel}:{" "}
                      <span className="font-mono tabular-nums text-foreground">
                        {messages.inventory.common.currencyCompact(
                          formatVND(
                            selectedGrns.reduce(
                              (sum, receipt) =>
                                sum + (receipt.netAcceptedAmount ?? 0),
                              0,
                            ),
                          ),
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
          </div>
          <div className="flex min-w-0 flex-col gap-3">
            <BusinessDateField
              control={form.control}
              name="invoiceDate"
              label={copy.invoiceDate}
              required
            />
            <label className="flex flex-col gap-2 text-sm font-medium">
              {copy.invoiceTaxRateLabel}
              <Select
                value={String(invoiceVatRate)}
                onValueChange={(value) =>
                  applyInvoiceVatRate(Number(value) as SupplierInvoiceVatRate)
                }
              >
                <SelectTrigger size="field">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[0, 5, 8, 10].map((rate) => (
                    <SelectItem key={rate} value={String(rate)}>
                      {formatPercent(rate, 0)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium">{copy.invoiceLines}</p>
        {invoiceLines.length === 0 ? (
          <NoteCallout tone="muted">{copy.chooseReceiptsForLines}</NoteCallout>
        ) : (
          invoiceLines.map((line, index) => {
            const calculatedLine = calculatedLines[index] ?? {
              grossLineTotal: "0.00",
              unitPrice: "0.00",
              vatAmount: "0.00",
              netLineTotal: "0.00",
            };
            return (
              <Item
                key={line.key}
                variant="outline"
                className="flex-col items-stretch p-3"
              >
                <div className="mb-3">
                  <div>
                    <p className="font-medium">{line.description}</p>
                    <p className="text-sm text-muted-foreground">
                      {line.quantity} {line.unitLabel}
                    </p>
                  </div>
                </div>
                {invoiceKind === "service" ? (
                  <TextField
                    control={form.control}
                    name={`lines.${index}.description`}
                    label={copy.serviceDescription}
                    required
                  />
                ) : null}
                <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(9rem,1fr)_minmax(7rem,1fr)_7rem_minmax(9rem,1fr)_minmax(9rem,1fr)]">
                  <label className="flex flex-col gap-2 text-sm font-medium">
                    {copy.unitPriceLabel}
                    <MoneyVndInput
                      controlSize="field"
                      value={calculatedLine.unitPrice}
                      onValueChange={(value) => {
                        const netLineTotal =
                          calculateSupplierInvoiceNetLineTotal(
                            String(line.quantity),
                            value,
                            line.lineDiscount,
                          );
                        const vatAmount = resolveSupplierInvoiceVatAmount(
                          netLineTotal,
                          line.vatRate as SupplierInvoiceVatRate,
                          "auto",
                          "",
                        );
                        patchInvoiceLine(index, {
                          unitPrice: value,
                          grossLineTotal: calculateSupplierInvoiceGrossLineTotal(
                            netLineTotal,
                            vatAmount,
                          ),
                          vatAmount,
                          vatMode: "auto",
                        });
                      }}
                      aria-label={copy.unitPriceAria(line.description)}
                    />
                  </label>
                  <label className="flex flex-col gap-2 text-sm font-medium">
                    {copy.lineDiscountLabel}
                    <MoneyVndInput
                      controlSize="field"
                      value={line.lineDiscount}
                      onValueChange={(value) => {
                        const netLineTotal = calculateSupplierInvoiceNetLineTotal(
                          String(line.quantity),
                          line.unitPrice,
                          value,
                        );
                        const vatAmount = resolveSupplierInvoiceVatAmount(
                          netLineTotal,
                          line.vatRate as SupplierInvoiceVatRate,
                          "auto",
                          "",
                        );
                        patchInvoiceLine(index, {
                          lineDiscount: value,
                          grossLineTotal: calculateSupplierInvoiceGrossLineTotal(
                            netLineTotal,
                            vatAmount,
                          ),
                          vatAmount,
                          vatMode: "auto",
                        });
                      }}
                      aria-label={copy.lineDiscountAria(line.description)}
                    />
                  </label>
                  <label className="flex flex-col gap-2 text-sm font-medium">
                    {copy.taxRateLabel}
                    <Select
                      value={String(line.vatRate)}
                      onValueChange={(value) => {
                        const rate = Number(value) as SupplierInvoiceVatRate;
                        const vatAmount = resolveSupplierInvoiceVatAmount(
                          calculatedLine.netLineTotal,
                          rate,
                          "auto",
                          "",
                        );
                        patchInvoiceLine(index, {
                          vatRate: rate,
                          vatAmount,
                          grossLineTotal: calculateSupplierInvoiceGrossLineTotal(
                            calculatedLine.netLineTotal,
                            vatAmount,
                          ),
                          vatMode: "auto",
                        });
                      }}
                    >
                      <SelectTrigger size="field">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[0, 5, 8, 10].map((rate) => (
                          <SelectItem key={rate} value={String(rate)}>
                            {formatPercent(rate, 0)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </label>
                  <label className="flex flex-col gap-2 text-sm font-medium">
                    {copy.vatAmountLabel}
                    <MoneyVndInput
                      controlSize="field"
                      value={line.vatAmount}
                      readOnly
                      aria-label={copy.vatAmountAria(line.description)}
                    />
                  </label>
                  <label className="flex flex-col gap-2 text-sm font-medium">
                    {copy.grossLineTotalLabel}
                    <MoneyVndInput
                      controlSize="field"
                      value={calculatedLine.grossLineTotal}
                      readOnly
                      aria-label={copy.grossLineTotalAria(line.description)}
                    />
                  </label>
                </div>
                <div className="mt-3 flex items-baseline justify-end gap-2 border-t pt-3 text-sm">
                  <span className="text-muted-foreground">
                    {copy.netLineTotal}
                  </span>
                  <span className="font-mono font-semibold tabular-nums">
                    {messages.inventory.common.currencyCompact(
                      formatVND(calculatedLine.netLineTotal),
                    )}
                  </span>
                </div>
              </Item>
            );
          })
        )}
        <MoneyVndField
          control={form.control}
          name="documentDiscount"
          label={copy.documentDiscount}
          placeholder="0"
        />
        <NoteCallout tone="muted">
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">{copy.beforeVat}</span>
            <span className="font-mono tabular-nums">
              {messages.inventory.common.currencyCompact(formatVND(subtotal))}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">{copy.vat}</span>
            <span className="font-mono tabular-nums">
              {messages.inventory.common.currencyCompact(formatVND(vatAmount))}
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between gap-3">
            <span className="text-muted-foreground">{FORM_VI.totalAmount}</span>
            <span className="font-mono font-semibold tabular-nums">
              {messages.inventory.common.currencyCompact(
                formatVND(totalAmount),
              )}
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
  outstanding: string;
}) {
  const amount = canonicalMoney(form.watch("amount"));
  const amountMinorUnits = parseMoneyToMinorUnits(amount);
  const outstandingMinorUnits = parseMoneyToMinorUnits(outstanding);
  const allocatedAmount = minorUnitsToCanonical(
    minimumMinorUnits([amountMinorUnits, outstandingMinorUnits]),
  );
  const advanceAmount = minorUnitsToCanonical(
    amountMinorUnits > outstandingMinorUnits
      ? amountMinorUnits - outstandingMinorUnits
      : 0n,
  );
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
      <NoteCallout
        tone={parseMoneyToMinorUnits(advanceAmount) > 0n ? "warning" : "muted"}
      >
        <div className="flex flex-col gap-1 text-sm">
          <span>{copy.paymentTotalPreview(formatVND(amount))}</span>
          <span>
            {copy.paymentAllocatedPreview(formatVND(allocatedAmount))}
          </span>
          <span>{copy.paymentAdvancePreview(formatVND(advanceAmount))}</span>
        </div>
      </NoteCallout>
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

function SupplierAdvanceFields({
  form,
  advances,
  outstanding,
  copy,
}: {
  form: UseFormReturn<
    SupplierAdvanceFormValues,
    unknown,
    SupplierAdvanceFormValues
  >;
  advances: SupplierAdvanceSummary[];
  outstanding: string;
  copy: typeof messages.inventory.supplierInvoices;
}) {
  const paymentId = Number(form.watch("paymentId") || 0);
  const selected = advances.find((advance) => advance.paymentId === paymentId);
  const amount = parseMoneyToMinorUnits(canonicalMoney(form.watch("amount")));
  const allocated = minorUnitsToCanonical(
    minimumMinorUnits([
      amount,
      parseMoneyToMinorUnits(canonicalMoney(selected?.advanceAmount ?? 0)),
      parseMoneyToMinorUnits(outstanding),
    ]),
  );

  return (
    <>
      <SelectField
        control={form.control}
        name="paymentId"
        label={copy.advanceSource}
        options={advances.map((advance) => ({
          value: String(advance.paymentId),
          label: copy.advanceSourceOption(
            formatDate(advance.paymentDate),
            formatVND(advance.advanceAmount),
          ),
        }))}
        required
      />
      <MoneyVndField
        control={form.control}
        name="amount"
        label={copy.advanceAllocationAmount}
        required
      />
      <NoteCallout tone="muted">
        {copy.advanceAllocationPreview(formatVND(allocated))}
      </NoteCallout>
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
  initialAdvances,
  initialTotalCount,
  filters,
  branchId,
  tenantId,
  grnBasePath = "/inventory/grn",
  description,
  canCreateInvoice = false,
  canPaySupplier = false,
  canAttachVatEvidence = false,
  canAcceptDiscrepancy = false,
}: {
  invoices: SupplierInvoiceRow[];
  suppliers: SupplierOption[];
  grns: GrnOption[];
  initialHasMore?: boolean;
  initialNextCursor?: SupplierInvoiceCursor | null;
  initialGroups: SupplierInvoiceAggregateGroup[];
  initialAdvances: SupplierAdvanceSummary[];
  initialTotalCount: number;
  filters: SupplierInvoiceListFilters;
  branchId?: number;
  tenantId: number;
  grnBasePath?: string;
  description?: string;
  canCreateInvoice?: boolean;
  canPaySupplier?: boolean;
  canAttachVatEvidence?: boolean;
  canAcceptDiscrepancy?: boolean;
}) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const invoiceIdParam = searchParams.get("invoiceId");
  const grnIdParam = searchParams.get("grnId");
  const modeParam = searchParams.get("mode");
  const preselectInvoiceId = invoiceIdParam ? Number(invoiceIdParam) : null;
  const preselectGrnId = grnIdParam ? Number(grnIdParam) : null;
  const requestedMode: SupplierInvoiceMode | null =
    modeParam === "view" ||
    modeParam === "create" ||
    modeParam === "edit" ||
    modeParam === "pay" ||
    modeParam === "credit" ||
    modeParam === "advance"
      ? modeParam
      : null;
  const invoiceMode: SupplierInvoiceMode | null =
    requestedMode === "create"
      ? "create"
      : preselectInvoiceId != null
        ? requestedMode === "edit" ||
          requestedMode === "pay" ||
          requestedMode === "credit" ||
          requestedMode === "advance"
          ? requestedMode
          : "view"
        : preselectGrnId != null
          ? "create"
          : null;

  const [rows, setRows] = useState(invoices);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [nextCursor, setNextCursor] = useState<SupplierInvoiceCursor | null>(
    initialNextCursor,
  );
  const [aggregateGroups, setAggregateGroups] = useState(initialGroups);
  const [advances, setAdvances] = useState(initialAdvances);
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
  const activeFilterCount = [
    filters.query,
    filters.supplierId,
    filters.matchStatus,
    filters.paymentStatus,
    filters.overdueOnly,
    filters.vatEvidence,
  ].filter(Boolean).length;
  const selectedInvoiceId = preselectInvoiceId;
  const detailOpen =
    selectedInvoiceId != null &&
    (invoiceMode === "view" ||
      (invoiceMode === "pay" && !canPaySupplier) ||
      (invoiceMode === "credit" && !canAcceptDiscrepancy) ||
      (invoiceMode === "advance" && !canPaySupplier));
  const createOpen =
    (invoiceMode === "create" || invoiceMode === "edit") && canCreateInvoice;
  const paymentOpen =
    invoiceMode === "pay" && selectedInvoiceId != null && canPaySupplier;
  const creditOpen =
    invoiceMode === "credit" &&
    selectedInvoiceId != null &&
    canAcceptDiscrepancy;
  const advanceOpen =
    invoiceMode === "advance" && selectedInvoiceId != null && canPaySupplier;
  const [acceptDiscrepancyOpen, setAcceptDiscrepancyOpen] = useState(false);
  const [acceptDiscrepancyReason, setAcceptDiscrepancyReason] = useState("");
  const [serviceVerificationOpen, setServiceVerificationOpen] = useState(false);
  const [serviceVerificationReason, setServiceVerificationReason] =
    useState("");
  const [vatUploading, setVatUploading] = useState(false);
  const [pendingCreateVatFile, setPendingCreateVatFile] = useState<File | null>(
    null,
  );
  const paymentIntentKeyRef = useRef<string | null>(null);
  const advanceIntentKeyRef = useRef<string | null>(null);
  const invoiceSaveIntentKeyRef = useRef<string | null>(null);
  const invoiceConfirmIntentKeyRef = useRef<string | null>(null);
  const createdInvoiceIdRef = useRef<number | null>(null);
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

  useEffect(() => {
    invoiceConfirmIntentKeyRef.current = null;
  }, [selectedInvoiceId]);
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
    setAdvances(initialAdvances);
    setTotalCount(initialTotalCount);
    setSearch(filters.query);
  }, [
    filters.query,
    initialGroups,
    initialAdvances,
    initialHasMore,
    initialNextCursor,
    initialTotalCount,
    invoices,
    listKey,
    preselectInvoiceId,
  ]);

  const updateListParams = useCallback(
    (
      updates: Record<string, string | null>,
      history: "push" | "replace" = "replace",
    ) => {
      const next = new URLSearchParams(searchParams.toString());
      if (!Object.hasOwn(updates, "q")) {
        const pendingQuery = search.trim().slice(0, 200);
        if (pendingQuery) next.set("q", pendingQuery);
        else next.delete("q");
      }
      for (const [key, value] of Object.entries(updates)) {
        if (value == null || value === "") next.delete(key);
        else next.set(key, value);
      }
      const query = next.toString();
      startTransition(() => {
        const href = query ? `${pathname}?${query}` : pathname;
        if (history === "push") {
          router.push(href, { scroll: false });
        } else {
          router.replace(href, { scroll: false });
        }
      });
    },
    [pathname, router, search, searchParams, startTransition],
  );

  const replaceListParam = useCallback(
    (key: string, value: string | null) => {
      updateListParams({ [key]: value });
    },
    [updateListParams],
  );

  const openInvoiceDetail = useCallback(
    (invoiceId: number, history: "push" | "replace" = "push") => {
      updateListParams(
        {
          mode: "view",
          invoiceId: String(invoiceId),
          grnId: null,
        },
        history,
      );
    },
    [updateListParams],
  );

  function handleDetailOpenChange(open: boolean) {
    if (!open) {
      updateListParams({ mode: null, invoiceId: null, grnId: null });
    }
  }

  function openCreateDialog() {
    if (!canCreateInvoice) return;
    createdInvoiceIdRef.current = null;
    invoiceSaveIntentKeyRef.current = null;
    updateListParams({ mode: "create", invoiceId: null, grnId: null }, "push");
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
  const [valuationSummary, setValuationSummary] =
    useState<SupplierInvoiceValuationSummary | null>(null);
  const [valuationSummaryLoading, setValuationSummaryLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setValuationSummary(null);
    if (
      selectedInvoice == null ||
      selectedInvoice.documentStatus !== "confirmed"
    ) {
      setValuationSummaryLoading(false);
      return;
    }
    setValuationSummaryLoading(true);
    void getSupplierInvoiceValuationSummary(selectedInvoice.id).then(
      (result) => {
        if (cancelled) return;
        setValuationSummary(result.success ? (result.data ?? null) : null);
        setValuationSummaryLoading(false);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [selectedInvoice?.documentStatus, selectedInvoice?.id]);
  const invoiceFormDefaultValues = useMemo(
    () =>
      invoiceMode === "edit" && selectedInvoice
        ? editSupplierInvoiceDefaultValues(selectedInvoice, grns)
        : createDefaultValues,
    [createDefaultValues, grns, invoiceMode, selectedInvoice],
  );
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
  const payableInvoicesInSelectedGroup = useMemo(
    () =>
      invoicesInSelectedGroup.filter(
        (invoice) =>
          invoice.documentStatus === "confirmed" &&
          invoice.matchStatus === "matched" &&
          invoice.vatInvoiceAttachmentPath != null &&
          getSupplierInvoiceOutstandingAmount(invoice) > 0,
      ),
    [invoicesInSelectedGroup],
  );
  const paymentOutstandingAmount = addMoney(
    payableInvoicesInSelectedGroup.map((invoice) =>
      canonicalMoney(getSupplierInvoiceOutstandingAmount(invoice)),
    ),
  );
  const paymentDefaultValues = useMemo(
    () =>
      createSupplierPaymentDefaultValues(
        selectedInvoice,
        paymentOutstandingAmount,
      ),
    [selectedInvoice?.id, paymentOutstandingAmount],
  );
  const selectedSupplierAdvances = useMemo(
    () =>
      selectedInvoice == null
        ? []
        : advances.filter(
            (advance) => advance.supplierId === selectedInvoice.supplierId,
          ),
    [advances, selectedInvoice],
  );
  const selectedSupplierAdvanceAmount = addMoney(
    selectedSupplierAdvances.map((advance) => advance.advanceAmount),
  );
  const advanceDefaultValues = useMemo<SupplierAdvanceFormValues>(
    () => ({
      paymentId: String(selectedSupplierAdvances[0]?.paymentId ?? ""),
      amount: minorUnitsToCanonical(
        minimumMinorUnits([
          parseMoneyToMinorUnits(selectedSupplierAdvanceAmount),
          parseMoneyToMinorUnits(paymentOutstandingAmount),
        ]),
      ),
    }),
    [
      paymentOutstandingAmount,
      selectedSupplierAdvanceAmount,
      selectedSupplierAdvances,
    ],
  );
  const creditDefaultValues = useMemo(
    () => ({
      creditNumber: "",
      amount: addMoney(
        invoicesInSelectedGroup.map((invoice) =>
          canonicalMoney(getSupplierInvoiceOutstandingAmount(invoice)),
        ),
      ),
      notes: "",
    }),
    [invoicesInSelectedGroup],
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
    if (!again.success || !again.data) return false;

    const {
      items,
      hasMore: more,
      nextCursor: cursor,
      groups: nextGroups,
      totalCount: nextTotalCount,
      advances: nextAdvances,
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
        return false;
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
    setAdvances(nextAdvances);
    setTotalCount(nextTotalCount);
    return true;
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
          advances: nextAdvances,
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
        setAdvances(nextAdvances);
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
    const selectedGrns =
      values.grnId === "none"
        ? []
        : grns.filter((option) =>
            values.grnId.split(",").includes(option.optionKey),
          );
    const selectedGrn = selectedGrns[0] ?? null;
    if (
      values.invoiceKind === "goods" &&
      selectedGrns.some((receipt) => receipt.poId == null)
    ) {
      return { success: false, error: copy.missingPoForReceipt };
    }
    const resolvedSupplierId =
      selectedGrn?.supplierId ?? Number(values.supplierId || 0);
    const pendingFile = pendingCreateVatFile;
    invoiceSaveIntentKeyRef.current ??= crypto.randomUUID();
    const res = await createSupplierInvoice({
      invoiceId:
        invoiceMode === "edit" ? (selectedInvoice?.id ?? undefined) : undefined,
      invoiceKind: values.invoiceKind,
      supplierId: resolvedSupplierId,
      invoiceDate: values.invoiceDate,
      documentDiscountAmount: canonicalMoney(values.documentDiscount),
      idempotencyKey: invoiceSaveIntentKeyRef.current,
      lines: values.lines.map((line) => {
        const quantity = String(line.quantity);
        const lineDiscount = canonicalMoney(line.lineDiscount);
        const unitPrice = canonicalMoney(line.unitPrice);
        const netLineTotal = calculateSupplierInvoiceNetLineTotal(
          quantity,
          line.unitPrice,
          lineDiscount,
        );
        const vatAmount = resolveSupplierInvoiceVatAmount(
          netLineTotal,
          line.vatRate as SupplierInvoiceVatRate,
          line.vatMode,
          line.vatAmount,
        );
        const grossLineTotal = calculateSupplierInvoiceGrossLineTotal(
          netLineTotal,
          vatAmount,
        );
        return {
          lineKey: line.key,
          ingredientId: line.ingredientId,
          description: line.description,
          quantity,
          unitId: line.unitId,
          unitPrice,
          grossLineTotal,
          lineDiscount,
          vatRate: line.vatRate,
          vatAmount,
          lineTotal: netLineTotal,
          allocations: line.allocations.map((allocation) => ({
            ...allocation,
            quantity: String(allocation.quantity),
          })),
        };
      }),
    });

    if (res.success && res.data) {
      const created = res.data as { id: number };
      invoiceSaveIntentKeyRef.current = null;
      setPendingCreateVatFile(null);

      if (pendingFile && canAttachVatEvidence) {
        const attached = await uploadAndAttachVatEvidence(
          created.id,
          pendingFile,
        );
        if (!attached) {
          toast.error(copy.vatAttachmentCreateFailed);
        } else {
          toast.success(copy.vatAttachmentUploaded);
        }
      } else if (canAttachVatEvidence) {
        toast.message(copy.vatAttachmentRemindAfterCreate);
      }

      if (await reloadInvoices(created.id)) {
        createdInvoiceIdRef.current = created.id;
      }
    }

    return res;
  }

  async function handleConfirmInvoice() {
    if (!selectedInvoice) return;
    invoiceConfirmIntentKeyRef.current ??= crypto.randomUUID();
    const result = await confirmSupplierInvoice({
      invoiceId: selectedInvoice.id,
      idempotencyKey: invoiceConfirmIntentKeyRef.current,
    });
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    invoiceConfirmIntentKeyRef.current = null;
    const valuation = result.data?.valuation;
    if (valuation?.warning) {
      toast.warning(copy.valuation.warningToast);
    } else {
      toast.success(copy.valuation.confirmedToast);
    }
    setValuationSummary(valuation ?? null);
    await reloadInvoices(selectedInvoice.id);
  }

  async function handleRecordPayment(values: SupplierPaymentFormValues) {
    if (!selectedInvoice) {
      return { success: false, error: copy.noPaymentInvoice };
    }

    if (!selectedInvoice.vatInvoiceAttachmentPath) {
      return { success: false, error: copy.paymentBlockedNoVatAttachment };
    }

    const amount = canonicalMoney(values.amount);
    const allocations = allocateSupplierMoney(
      amount,
      payableInvoicesInSelectedGroup,
    );
    if (allocations.length === 0) {
      return { success: false, error: copy.noPaymentInvoice };
    }

    const idempotencyKey = resolveSupplierPaymentIntentKey(
      paymentIntentKeyRef.current,
      () => crypto.randomUUID(),
    );
    paymentIntentKeyRef.current = idempotencyKey;

    try {
      const res = await recordSupplierPayment({
        invoiceId: selectedInvoice.id,
        supplierId: selectedInvoice.supplierId,
        allocations,
        idempotencyKey,
        amount,
        paymentMethod: values.paymentMethod,
        referenceNote: values.referenceNote?.trim() || undefined,
      });

      if (res.success) {
        if (
          res.data?.advanceAmount &&
          parseMoneyToMinorUnits(res.data.advanceAmount) > 0n
        ) {
          toast.message(
            copy.paymentAdvanceRecorded(formatVND(res.data!.advanceAmount)),
          );
        }
        await reloadInvoices(selectedInvoice.id);
      }

      return res;
    } catch {
      return { success: false, error: copy.paymentRetrySameIntent };
    }
  }

  async function handleCreateCredit(values: SupplierCreditFormValues) {
    if (!selectedInvoice) {
      return { success: false, error: "Không tìm thấy hóa đơn NCC." };
    }
    const amount = canonicalMoney(values.amount);
    const allocations = allocateSupplierMoney(amount, invoicesInSelectedGroup);
    if (allocations.length === 0) {
      return { success: false, error: "Không còn công nợ để phân bổ." };
    }
    const result = await createSupplierCreditAllocated({
      supplierId: selectedInvoice.supplierId,
      creditNumber: values.creditNumber,
      amount,
      notes: values.notes,
      allocations,
    });
    if (result.success) await reloadInvoices(selectedInvoice.id);
    return result;
  }

  async function handleAllocateAdvance(values: SupplierAdvanceFormValues) {
    if (!selectedInvoice) {
      return { success: false, error: copy.noPaymentInvoice };
    }
    const selectedAdvance = selectedSupplierAdvances.find(
      (advance) => advance.paymentId === Number(values.paymentId),
    );
    if (!selectedAdvance) {
      return { success: false, error: copy.advanceNotFound };
    }
    const requestedAmount = canonicalMoney(values.amount);
    if (
      parseMoneyToMinorUnits(requestedAmount) >
      parseMoneyToMinorUnits(canonicalMoney(selectedAdvance.advanceAmount))
    ) {
      return { success: false, error: copy.advanceExceedsBalance };
    }

    const allocations = allocateSupplierMoney(
      requestedAmount,
      payableInvoicesInSelectedGroup,
    );
    if (allocations.length === 0) {
      return { success: false, error: copy.noPaymentInvoice };
    }

    const idempotencyKey = resolveSupplierPaymentIntentKey(
      advanceIntentKeyRef.current,
      () => crypto.randomUUID(),
    );
    advanceIntentKeyRef.current = idempotencyKey;
    const result = await allocateSupplierAdvance({
      paymentId: selectedAdvance.paymentId,
      idempotencyKey,
      allocations,
    });
    if (result.success) await reloadInvoices(selectedInvoice.id);
    return result;
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
    updateListParams({ mode: "pay" });
  }

  function handlePaymentOpenChange(open: boolean) {
    if (open && paymentIntentKeyRef.current == null) {
      paymentIntentKeyRef.current = crypto.randomUUID();
    }
    if (!open) {
      paymentIntentKeyRef.current = null;
      updateListParams({ mode: "view" });
    }
  }

  function handleCreateOpenChange(open: boolean) {
    if (open && invoiceMode !== "edit") {
      openCreateDialog();
      return;
    }
    if (!open) {
      setPendingCreateVatFile(null);
    }
    const createdInvoiceId = createdInvoiceIdRef.current;
    createdInvoiceIdRef.current = null;
    if (createdInvoiceId != null) {
      openInvoiceDetail(createdInvoiceId, "replace");
      return;
    }
    updateListParams({ mode: null, invoiceId: null, grnId: null });
  }

  function openEditInvoiceDialog() {
    if (!selectedInvoice || selectedInvoice.documentStatus !== "draft") return;
    invoiceSaveIntentKeyRef.current = null;
    updateListParams({ mode: "edit", invoiceId: String(selectedInvoice.id) });
  }

  function openSupplierCreditDialog() {
    updateListParams({ mode: "credit" });
  }

  function handleCreditOpenChange(open: boolean) {
    if (!open) updateListParams({ mode: "view" });
  }

  function openSupplierAdvanceDialog() {
    advanceIntentKeyRef.current = crypto.randomUUID();
    updateListParams({ mode: "advance" });
  }

  function handleAdvanceOpenChange(open: boolean) {
    if (open && advanceIntentKeyRef.current == null) {
      advanceIntentKeyRef.current = crypto.randomUUID();
    }
    if (!open) {
      advanceIntentKeyRef.current = null;
      updateListParams({ mode: "view" });
    }
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

  function handleAcceptDiscrepancy() {
    if (!selectedInvoice) return;
    startTransition(async () => {
      const result = await acceptSupplierInvoiceDiscrepancy({
        invoiceId: selectedInvoice.id,
        reason: acceptDiscrepancyReason,
      });
      if (!result.success) {
        toast.error(result.error ?? copy.acceptDiscrepancyFailed);
        return;
      }
      toast.success(copy.acceptDiscrepancySuccess);
      setAcceptDiscrepancyOpen(false);
      setAcceptDiscrepancyReason("");
      await reloadInvoices(selectedInvoice.id);
    });
  }

  function handleVerifyServiceInvoice() {
    if (!selectedInvoice) return;
    startTransition(async () => {
      const result = await verifyServiceSupplierInvoice({
        invoiceId: selectedInvoice.id,
        reason: serviceVerificationReason,
      });
      if (!result.success) {
        toast.error(result.error ?? copy.serviceVerificationFailed);
        return;
      }
      toast.success(copy.serviceVerificationSuccess);
      setServiceVerificationOpen(false);
      setServiceVerificationReason("");
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
            {viewMode === "po" ? (
              <p className="truncate text-sm text-muted-foreground">
                {group.subtitle}
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
          {viewMode === "supplier" ? (
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">{copy.paidAmount}</span>
              <span className="font-mono">
                {messages.inventory.common.currencyCompact(
                  formatVND(group.paidAmount),
                )}
              </span>
            </div>
          ) : null}
          {viewMode === "supplier" && group.creditAppliedAmount > 0 ? (
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
          {viewMode === "po" ? (
            <p className="text-xs text-muted-foreground">
              {copy.supplier}: {group.supplierName}
            </p>
          ) : null}
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
    ...(viewMode === "po"
      ? [
          {
            key: "invoiceCount",
            header: copy.relatedInvoicesHeader,
            className: "min-w-40",
            render: (group: SupplierInvoiceGroup) => (
              <div className="flex min-w-0 flex-col gap-1">
                <span className="text-sm text-muted-foreground">
                  {copy.invoiceGroupSummary(group.invoiceCount)}
                </span>
              </div>
            ),
          },
        ]
      : []),
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
    ...(viewMode === "supplier"
      ? [
          {
            key: "paid",
            header: copy.paidAmount,
            className: "min-w-36 text-right",
            render: (group: SupplierInvoiceGroup) => (
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
        ]
      : []),
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

  const viewModeTabs = (
    <Tabs
      value={viewMode}
      onValueChange={(value) =>
        replaceListParam("view", value === "supplier" ? null : value)
      }
      aria-label={copy.groupByAria}
    >
      <TabsList
        variant="toolbar"
        size={controlSize === "touch" ? "touch" : "default"}
        className="w-full sm:w-fit"
        aria-label={copy.groupByLabel}
      >
        <TabsTrigger value="supplier">{copy.viewBySupplier}</TabsTrigger>
        <TabsTrigger value="po">{copy.viewByPo}</TabsTrigger>
      </TabsList>
    </Tabs>
  );

  const filterPopover = (
    <Popover>
      <PopoverTrigger
        render={
          <Button type="button" variant="outline" size={controlSize}>
            <IconFilter data-icon="inline-start" />
            {copy.filterAction}
            {activeFilterCount > 0 ? (
              <Badge variant="secondary" className="ml-1 rounded-full px-1.5">
                {activeFilterCount}
              </Badge>
            ) : null}
          </Button>
        }
      />
      <PopoverContent align="end" className="w-[min(20rem,calc(100vw-2rem))]">
        <PopoverHeader>
          <PopoverTitle>{copy.filterAction}</PopoverTitle>
          <p className="text-muted-foreground">{copy.filterHint}</p>
        </PopoverHeader>
        <div className="flex flex-col gap-2">
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
            triggerClassName="w-full"
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
            <SelectTrigger size={controlSize} className="w-full">
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
            <SelectTrigger size={controlSize} className="w-full">
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

          <Button
            type="button"
            size={controlSize}
            variant={showOnlyOverdue ? "default" : "outline"}
            className="justify-start"
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
            className="justify-start"
            onClick={() =>
              replaceListParam("vat", showOnlyMissingVat ? null : "missing")
            }
            aria-pressed={showOnlyMissingVat}
            aria-label={copy.vatMissingOnlyAria}
          >
            <IconReceipt data-icon="inline-start" />
            {copy.vatMissingOnly}
          </Button>
          {activeFilterCount > 0 ? (
            <Button
              type="button"
              size={controlSize}
              variant="ghost"
              className="justify-start"
              onClick={() =>
                updateListParams({
                  q: null,
                  supplierId: null,
                  matchStatus: null,
                  paymentStatus: null,
                  overdue: null,
                  vat: null,
                })
              }
            >
              {copy.clearFilters}
            </Button>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );

  const activeGroupId = selectedGroupId;
  const selectedAgingLabel = selectedInvoice
    ? getInvoiceAgingLabel(selectedInvoice, copy)
    : null;
  const selectedLastPayment = selectedInvoice?.lastPayment ?? null;
  const missingVatAttachment =
    selectedInvoice != null && !selectedInvoice.vatInvoiceAttachmentPath;
  const canShowPayAction =
    canPaySupplier &&
    selectedInvoice != null &&
    selectedInvoice.documentStatus === "confirmed" &&
    selectedInvoice.matchStatus === "matched" &&
    selectedOutstandingAmount > 0;
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
    (selectedInvoice.matchStatus === "pending" ||
      selectedInvoice.matchStatus === "discrepancy");
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
    selectedInvoice != null ? copy.invoiceDetailTitle : copy.noInvoiceSelected;

  const detailSubtitle =
    selectedInvoice != null
      ? [selectedInvoice.supplierName, selectedAgingLabel]
          .filter(Boolean)
          .join(" · ")
      : null;

  return (
    <AppPage width="xwide">
      <AppPageHeader
        title={copy.title}
        description={description}
        actions={
          canCreateInvoice ? (
            <Button type="button" size="touch" onClick={openCreateDialog}>
              {copy.createAction}
            </Button>
          ) : undefined
        }
      />

      <AppListFrame
        toolbar={
          <AppToolbar
            variant="inline"
            className="items-stretch sm:items-center [&>[data-slot=toolbar-group]:first-child]:min-w-0 sm:[&>[data-slot=toolbar-group]:first-child]:min-w-64"
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
                <InputGroupAddon align="inline-end">
                  <InputGroupText>
                    {copy.groupCount(allInvoiceGroups.length, totalCount)}
                  </InputGroupText>
                </InputGroupAddon>
              </InputGroup>
            }
            filters={
              <>
                {viewModeTabs}
                {filterPopover}
              </>
            }
          />
        }
      >
        <DataTable
          columns={invoiceGroupColumns}
          data={invoiceGroups}
          getRowKey={(group) => group.id}
          pageSize={50}
          emptyTitle={
            showEmptyResults ? copy.emptyMatchedTitle : copy.emptyInitialTitle
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
            group.id === activeGroupId && detailOpen ? "selected" : undefined
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
                          {formatDate(invoice.invoiceDate)}
                          {invoice.grnCode ? ` · ${invoice.grnCode}` : ""}
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

                {parseMoneyToMinorUnits(selectedSupplierAdvanceAmount) > 0n ? (
                  <Item variant="outline" size="sm" className="items-start">
                    <ItemContent className="gap-1">
                      <ItemDescription className="line-clamp-none">
                        {copy.supplierAdvance}
                      </ItemDescription>
                      <ItemTitle
                        size="heading"
                        className="line-clamp-none font-mono tabular-nums"
                      >
                        {messages.inventory.common.currencyCompact(
                          formatVND(selectedSupplierAdvanceAmount),
                        )}
                      </ItemTitle>
                      <ItemDescription className="line-clamp-none">
                        {copy.supplierAdvanceDescription}
                      </ItemDescription>
                    </ItemContent>
                  </Item>
                ) : null}

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
                    label={copy.invoiceKind}
                    value={copy.invoiceKinds[selectedInvoice.invoiceKind]}
                  />
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
                    value={selectedInvoice.grnCode ?? copy.notLinked}
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
                  <DetailFact
                    label={copy.matchingExpectedAmount}
                    value={
                      selectedInvoice.matchingExpectedAmount != null
                        ? messages.inventory.common.currencyCompact(
                            formatVND(selectedInvoice.matchingExpectedAmount),
                          )
                        : copy.notAvailable
                    }
                  />
                  <DetailFact
                    label={copy.matchingReceivedAmount}
                    value={
                      selectedInvoice.matchingReceivedAmount != null
                        ? messages.inventory.common.currencyCompact(
                            formatVND(selectedInvoice.matchingReceivedAmount),
                          )
                        : copy.notAvailable
                    }
                  />
                  {selectedInvoice.matchingDifferenceAmount != null ? (
                    <DetailFact
                      label={copy.matchingDifferenceAmount}
                      value={messages.inventory.common.currencyCompact(
                        formatVND(selectedInvoice.matchingDifferenceAmount),
                      )}
                      valueClassName={
                        Math.abs(selectedInvoice.matchingDifferenceAmount) > 1
                          ? "text-destructive"
                          : undefined
                      }
                    />
                  ) : null}
                  {selectedInvoice.serviceVerificationReason ? (
                    <DetailFact
                      className="col-span-2"
                      label={copy.serviceVerificationReason}
                      value={selectedInvoice.serviceVerificationReason}
                    />
                  ) : null}
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

                {selectedInvoice.invoiceLines.length > 0 ? (
                  <ItemGroup className="grid gap-2">
                    {selectedInvoice.invoiceLines.map((line) => (
                      <Item key={line.id} variant="outline" size="sm">
                        <ItemContent className="gap-1">
                          <ItemTitle size="heading">
                            {line.ingredientName}
                          </ItemTitle>
                          <ItemDescription className="line-clamp-none">
                            {copy.invoiceLineMeta(
                              String(line.quantity),
                              line.unitLabel,
                              messages.inventory.common.currencyCompact(
                                formatVND(line.unitPrice),
                              ),
                              line.lineDiscount > 0
                                ? messages.inventory.common.currencyCompact(
                                    formatVND(line.lineDiscount),
                                  )
                                : null,
                              formatPercent(line.vatRate, 0),
                            )}
                          </ItemDescription>
                        </ItemContent>
                        <ItemActions>
                          <span className="font-mono font-semibold tabular-nums">
                            {messages.inventory.common.currencyCompact(
                              formatVND(line.grossLineTotal),
                            )}
                          </span>
                        </ItemActions>
                      </Item>
                    ))}
                  </ItemGroup>
                ) : null}

                {selectedInvoice.receiptAllocations.length > 0 ? (
                  <ItemGroup className="grid gap-2">
                    {selectedInvoice.receiptAllocations.map((allocation) => (
                      <Item
                        key={`${allocation.grnId}:${allocation.poId}`}
                        variant="outline"
                        size="sm"
                      >
                        <ItemContent className="gap-1">
                          <ItemTitle size="heading" className="font-mono">
                            {allocation.grnCode}
                          </ItemTitle>
                          <ItemDescription className="line-clamp-none">
                            {allocation.poCode}
                          </ItemDescription>
                        </ItemContent>
                        <ItemActions>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            render={
                              <Link
                                href={`${grnBasePath}?grnId=${allocation.grnId}&mode=view`}
                              />
                            }
                          >
                            {ACTIONS_VI.view}
                          </Button>
                        </ItemActions>
                      </Item>
                    ))}
                  </ItemGroup>
                ) : null}

                {valuationSummaryLoading ? (
                  <Item variant="outline" size="sm">
                    <ItemContent>
                      <ItemTitle size="heading">
                        {copy.valuation.title}
                      </ItemTitle>
                      <ItemDescription>
                        {copy.valuation.loading}
                      </ItemDescription>
                    </ItemContent>
                  </Item>
                ) : valuationSummary ? (
                  <ItemGroup className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <DetailFact
                      className="sm:col-span-2"
                      label={copy.valuation.title}
                      value={copy.valuation.status[valuationSummary.status]}
                      valueClassName={
                        valuationSummary.warning ? "text-warning" : undefined
                      }
                    />
                    <DetailFact
                      label={copy.valuation.provisionalValue}
                      value={formatVND(valuationSummary.provisionalValue)}
                    />
                    <DetailFact
                      label={copy.valuation.finalNetValue}
                      value={formatVND(valuationSummary.finalNetValue)}
                    />
                    <DetailFact
                      label={copy.valuation.inventoryAdjustment}
                      value={formatVND(valuationSummary.inventoryAdjustment)}
                    />
                    <DetailFact
                      label={copy.valuation.productionInventoryAdjustment}
                      value={formatVND(
                        valuationSummary.productionInventoryAdjustment,
                      )}
                    />
                    <DetailFact
                      label={copy.valuation.foodCostVariance}
                      value={formatVND(valuationSummary.foodCostVariance)}
                    />
                    <DetailFact
                      label={copy.valuation.wasteVariance}
                      value={formatVND(valuationSummary.wasteVariance)}
                    />
                    <DetailFact
                      label={copy.valuation.supplierReturnVariance}
                      value={formatVND(valuationSummary.supplierReturnVariance)}
                    />
                    <DetailFact
                      label={copy.valuation.currentPeriodVariance}
                      value={formatVND(valuationSummary.currentPeriodVariance)}
                    />
                  </ItemGroup>
                ) : null}

                {showMatchProblem ? (
                  selectedInvoice.invoiceKind === "service" ? (
                    <Alert className="border-warning/20 bg-warning/10 text-warning">
                      <IconAlertTriangle />
                      <AlertTitle>
                        {copy.serviceVerificationRequired}
                      </AlertTitle>
                      <AlertDescription className="text-muted-foreground">
                        {selectedInvoice.matchingNotes ??
                          copy.serviceVerificationDescription}
                      </AlertDescription>
                    </Alert>
                  ) : selectedMissingMatchingEvidence ? (
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
                        {copy.matchingDifferenceTitle(
                          formatVND(
                            selectedInvoice.matchingDifferenceAmount ?? 0,
                          ),
                        )}
                      </AlertTitle>
                      <AlertDescription>
                        {selectedInvoice.matchingNotes ??
                          copy.matchingDifferenceDescription}
                      </AlertDescription>
                    </Alert>
                  )
                ) : null}
              </div>

              <SheetFooter>
                <div className="flex flex-wrap gap-2">
                  {canAcceptDiscrepancy &&
                  selectedInvoice.documentStatus === "draft" &&
                  selectedInvoice.matchStatus === "matched" ? (
                    <Button
                      type="button"
                      size="touch"
                      className="flex-1"
                      onClick={handleConfirmInvoice}
                      disabled={isPending}
                    >
                      {copy.confirmInvoiceAction}
                    </Button>
                  ) : null}
                  {canCreateInvoice &&
                  selectedInvoice.documentStatus === "draft" ? (
                    <Button
                      type="button"
                      size="touch"
                      variant="outline"
                      onClick={openEditInvoiceDialog}
                      disabled={isPending}
                    >
                      {ACTIONS_VI.edit}
                    </Button>
                  ) : null}
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
                  {canPaySupplier &&
                  parseMoneyToMinorUnits(selectedSupplierAdvanceAmount) > 0n &&
                  parseMoneyToMinorUnits(paymentOutstandingAmount) > 0n ? (
                    <Button
                      type="button"
                      size="touch"
                      variant="outline"
                      onClick={openSupplierAdvanceDialog}
                      disabled={isPending}
                    >
                      {copy.allocateAdvanceAction}
                    </Button>
                  ) : null}
                  {canAcceptDiscrepancy &&
                  selectedInvoice.invoiceKind === "service" &&
                  selectedInvoice.matchStatus === "pending" ? (
                    <Button
                      type="button"
                      size="touch"
                      variant="outline"
                      onClick={() => setServiceVerificationOpen(true)}
                      disabled={isPending}
                    >
                      {copy.verifyServiceAction}
                    </Button>
                  ) : null}
                  {canAcceptDiscrepancy &&
                  selectedInvoice.invoiceKind === "goods" &&
                  selectedInvoice.matchStatus === "discrepancy" ? (
                    <Button
                      type="button"
                      size="touch"
                      variant="outline"
                      onClick={() => setAcceptDiscrepancyOpen(true)}
                      disabled={isPending}
                    >
                      {copy.acceptDiscrepancy}
                    </Button>
                  ) : null}
                  {canAcceptDiscrepancy && selectedOutstandingAmount > 0 ? (
                    <Button
                      type="button"
                      size="touch"
                      variant="outline"
                      onClick={openSupplierCreditDialog}
                      disabled={isPending}
                    >
                      {copy.creditAction}
                    </Button>
                  ) : null}
                  {canAcceptDiscrepancy &&
                  selectedInvoice.invoiceKind === "goods" ? (
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
                  ) : null}
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

      <ReasonConfirmDialog
        open={acceptDiscrepancyOpen}
        onOpenChange={setAcceptDiscrepancyOpen}
        title={copy.acceptDiscrepancy}
        description={copy.acceptDiscrepancyDescription}
        reasonId="supplier-invoice-discrepancy-reason"
        reason={acceptDiscrepancyReason}
        onReasonChange={setAcceptDiscrepancyReason}
        reasonLabel={copy.discrepancyReason}
        reasonPlaceholder={copy.discrepancyReasonPlaceholder}
        reasonMinLength={5}
        cancelLabel={ACTIONS_VI.cancel}
        confirmLabel={copy.acceptDiscrepancy}
        canConfirm={acceptDiscrepancyReason.trim().length >= 5}
        isPending={isPending}
        onConfirm={handleAcceptDiscrepancy}
      />

      <ReasonConfirmDialog
        open={serviceVerificationOpen}
        onOpenChange={setServiceVerificationOpen}
        title={copy.verifyServiceAction}
        description={copy.serviceVerificationDescription}
        reasonId="supplier-service-verification-reason"
        reason={serviceVerificationReason}
        onReasonChange={setServiceVerificationReason}
        reasonLabel={copy.serviceVerificationReason}
        reasonPlaceholder={copy.serviceVerificationReasonPlaceholder}
        reasonMinLength={5}
        cancelLabel={ACTIONS_VI.cancel}
        confirmLabel={copy.verifyServiceAction}
        canConfirm={serviceVerificationReason.trim().length >= 5}
        isPending={isPending}
        onConfirm={handleVerifyServiceInvoice}
      />

      <FormDialog
        open={createOpen}
        onOpenChange={handleCreateOpenChange}
        variant="document"
        schema={supplierInvoiceSchema}
        defaultValues={invoiceFormDefaultValues}
        entityKey={
          invoiceMode === "edit"
            ? `supplier-invoice-${selectedInvoiceId}`
            : "new-supplier-invoice"
        }
        title={invoiceMode === "edit" ? "Sửa hóa đơn NCC" : copy.createAction}
        description={copy.createDescription}
        submitLabel={copy.saveInvoice}
        cancelLabel={ACTIONS_VI.cancel}
        successMessage={STATES_VI.saved}
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
            outstanding={paymentOutstandingAmount}
          />
        )}
      </FormDialog>

      <FormDialog
        open={creditOpen}
        onOpenChange={handleCreditOpenChange}
        schema={supplierCreditSchema}
        defaultValues={creditDefaultValues}
        entityKey={selectedInvoice?.id ?? "supplier-credit"}
        title={copy.creditTitle}
        description={copy.creditDescription}
        submitLabel={copy.creditSubmit}
        cancelLabel={ACTIONS_VI.cancel}
        successMessage={copy.creditSuccess}
        contentClassName="sm:max-w-md"
        onSubmit={handleCreateCredit}
      >
        {(form) => (
          <>
            <TextField
              control={form.control}
              name="creditNumber"
              label="Số phiếu giảm công nợ"
              required
            />
            <MoneyVndField
              control={form.control}
              name="amount"
              label="Số tiền giảm"
              required
            />
            <TextareaField
              control={form.control}
              name="notes"
              label={copy.creditReason}
              placeholder={copy.creditReasonPlaceholder}
              rows={3}
              required
            />
          </>
        )}
      </FormDialog>

      <FormDialog
        open={advanceOpen}
        onOpenChange={handleAdvanceOpenChange}
        schema={supplierAdvanceSchema}
        defaultValues={advanceDefaultValues}
        entityKey={`${selectedInvoice?.supplierId ?? "supplier"}-advance`}
        title={copy.allocateAdvanceTitle}
        description={copy.allocateAdvanceDescription}
        submitLabel={copy.allocateAdvanceAction}
        cancelLabel={ACTIONS_VI.cancel}
        successMessage={copy.allocateAdvanceSuccess}
        contentClassName="sm:max-w-md"
        onSubmit={handleAllocateAdvance}
      >
        {(form) => (
          <SupplierAdvanceFields
            form={form}
            advances={selectedSupplierAdvances}
            outstanding={paymentOutstandingAmount}
            copy={copy}
          />
        )}
      </FormDialog>
    </AppPage>
  );
}
