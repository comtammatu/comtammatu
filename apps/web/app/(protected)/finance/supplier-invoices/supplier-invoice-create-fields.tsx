"use client";

import { useEffect, useMemo } from "react";
import type { UseFormReturn } from "react-hook-form";
import { Trash as IconTrash, Upload as IconUpload } from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import { NoteCallout } from "@comtammatu/ui/components/note-callout";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { toast } from "@comtammatu/ui/components/sonner";
import { Item } from "@comtammatu/ui/components/item";
import {
  BusinessDateField,
  MoneyVndField,
  MoneyVndInput,
  SelectField,
  TextField,
} from "@/components/form";
import { formatAccountingVND as formatVND, formatPercent } from "@comtammatu/shared/format";
import { messages } from "@lib/messages";
import {
  calculateSupplierInvoiceGrossLineTotal,
  calculateSupplierInvoiceNetLineTotal,
  resolveSupplierInvoiceVatAmount,
  summarizeSupplierInvoiceMoney,
  type SupplierInvoiceVatRate,
} from "../_lib/supplier-invoice-money";
import {
  canonicalMoney,
  type GrnOption,
  type SupplierInvoiceFormValues,
  type SupplierOption,
} from "./supplier-invoice-form-schema";

import {
  OWNER_SHELL_BREAKPOINT,
  useIsMobile,
} from "@comtammatu/ui/hooks/use-mobile";
export function SupplierInvoiceCreateFields({
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
  const isTouchLayout = useIsMobile(OWNER_SHELL_BREAKPOINT);

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
            unitPrice:
              preserved?.unitPrice ||
              (line.unitCost != null && line.unitCost > 0
                ? canonicalMoney(String(line.unitCost))
                : ""),
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
            <span className="text-muted-foreground">{copy.vatAmountLabel}</span>
            <span className="font-mono tabular-nums">
              {messages.inventory.common.currencyCompact(formatVND(vatAmount))}
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between gap-3">
            <span className="text-muted-foreground">{copy.totalInvoice}</span>
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
              size={isTouchLayout ? "touch" : "default"}
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
