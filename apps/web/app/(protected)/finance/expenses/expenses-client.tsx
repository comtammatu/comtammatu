"use client";

import { useEffect, useMemo, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useFieldArray, useForm, type UseFormReturn } from "react-hook-form";
import { z } from "zod";
import {
  Banknote as IconBanknote,
  Copy as IconCopy,
  Landmark as IconLandmark,
  Pencil as IconPencil,
  Plus as IconPlus,
  RotateCcw as IconRotateCcw,
  Trash2 as IconTrash,
  TriangleAlert as IconAlertTriangle,
} from "lucide-react";
import {
  formatCount,
  formatAccountingVND,
  formatCompactVND,
  formatPercent,
} from "@comtammatu/shared/format";
import {
  addMoney,
  calculateVatAmount,
  hasMaximumScale,
  minorUnitsToCanonical,
  parseMoneyToMinorUnits,
} from "@comtammatu/shared/money";
import { formatVNBusinessDate } from "@comtammatu/shared/time";
import { ACTIONS_VI, FORM_VI } from "@comtammatu/shared/messages";
import { EXPENSE_PAYMENT_STATE_LABELS_VI } from "@comtammatu/shared/labels";
import { Button } from "@comtammatu/ui/components/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemHeader,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { confirm } from "@comtammatu/ui/components/confirm-dialog";
import { toast } from "@comtammatu/ui/components/sonner";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { useIsMobile } from "@comtammatu/ui/hooks/use-mobile";
import type { ActionResult } from "@comtammatu/shared/types";
import {
  RowActionsContextMenuItems,
  RowActionsMenu,
  type RowActionItem,
} from "@/components/row-actions-menu";
import { KpiCard } from "@/components/kpi/kpi-card";
import { StatusBadge } from "@/components/status-badge";
import { AppListFrame, AppPageHeader, KpiRow } from "@/components/surface";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import {
  AppDialog,
  BusinessDateField,
  FormDialog,
  PhotoUploadInput,
  SelectField,
  TextareaField,
} from "@/components/form";
import { messages } from "@lib/messages";
import { useDocumentOverlayUrl } from "@lib/navigation/use-document-overlay-url";
import { FilterBar } from "../components/filter-bar";
import { FinanceAmountCell } from "../components/finance-amount-cell";
import {
  FinanceMoneyBlockFields,
  FinanceMoneySummary,
  moneyLabels,
} from "../components/finance-money-block";
import {
  EXPENSE_CATEGORIES_BY_GROUP,
  EXPENSE_PAYMENT_METHODS,
  canCorrectExpensePaymentMethod,
  classifyExpensePaymentState,
  expenseNeedsAction,
  type ExpenseCategory,
  type ExpensePaymentMethod,
  type ExpensePaymentState,
} from "../_lib/expense-categories";
import type { FinanceParams } from "../_lib/finance-params";
import {
  EXPENSE_VAT_RATES,
  expenseGrossFromBreakdown,
  resolveExpenseVatAmount,
  type ExpenseVatRate,
} from "../_lib/expense-vat";
import {
  EXPENSE_LIST_STATE_PARAM,
  type ExpenseListStateFilter,
} from "./expense-list-state";
import {
  createExpense,
  deleteExpense,
  transitionExpensePayment,
  updateExpense,
  type ExpenseRow,
} from "../expense-actions";

const copy = messages.finance.expenses;
const TENANT_LEVEL_BRANCH_VALUE = "__tenant__";
const EXPENSE_OVERLAY_KEYS = ["expenseId", "mode"] as const;

const optionalMoneySchema = z.string().refine(
  (value) => {
    if (!value.trim()) return true;
    return (
      /^(?:0|[1-9]\d{0,12})(?:\.\d{1,2})?$/.test(value) &&
      hasMaximumScale(value, 2) &&
      parseMoneyToMinorUnits(value) >= 0n
    );
  },
  { error: FORM_VI.required },
);

interface Branch {
  id: number;
  name: string;
}

interface ExpenseListSummary {
  operatingTotal: string;
  operatingCount: number;
  needsActionTotal: string;
  needsActionCount: number;
}

interface Props {
  params: FinanceParams;
  branches: Branch[];
  rows: ExpenseRow[];
  summary: ExpenseListSummary;
  stateFilter: ExpenseListStateFilter | null;
  todayBusinessDate: string;
  canManageExpenses: boolean;
  tenantId: number;
}

const expenseFormLineSchema = z.object({
  taxableAmount: optionalMoneySchema.refine(
    (value) => !!value && parseMoneyToMinorUnits(value) > 0n,
    { error: FORM_VI.required },
  ),
  vatRate: z.enum(["0", "5", "8", "10"]),
  vatAmount: optionalMoneySchema,
});

const expenseFormSchema = z
  .object({
    expenseDate: z.string().min(1, { error: "Chọn ngày phát sinh" }),
    branchId: z.string(),
    category: z.string().min(1, { error: "Chọn khoản chi" }),
    paymentMethod: z.string().min(1, { error: "Chọn phương thức thanh toán" }),
    note: z.string().trim().min(5, FORM_VI.required).max(500),
    invoiceAttachmentUrl: z.string().optional(),
    lines: z.array(expenseFormLineSchema).min(1).max(EXPENSE_VAT_RATES.length),
  })
  .superRefine((data, ctx) => {
    const rates = new Set<string>();
    data.lines.forEach((line, index) => {
      if (rates.has(line.vatRate)) {
        ctx.addIssue({
          code: "custom",
          message: "Mỗi mức thuế suất chỉ được nhập một lần.",
          path: ["lines", index, "vatRate"],
        });
      }
      rates.add(line.vatRate);

      if (!line.vatAmount) return;
      const vatAmount = parseMoneyToMinorUnits(line.vatAmount);
      if (vatAmount > parseMoneyToMinorUnits(line.taxableAmount)) {
        ctx.addIssue({
          code: "custom",
          message: "Thuế GTGT không được lớn hơn tiền chưa thuế.",
          path: ["lines", index, "vatAmount"],
        });
      }
      if (line.vatRate === "0" && vatAmount !== 0n) {
        ctx.addIssue({
          code: "custom",
          message: "Thuế suất 0% phải có thuế GTGT bằng 0.",
          path: ["lines", index, "vatAmount"],
        });
      }
    });
  });

type ExpenseFormValues = z.infer<typeof expenseFormSchema>;

function buildExpenseVatBreakdown(values: ExpenseFormValues) {
  return values.lines.flatMap((line) => {
    if (
      !line.taxableAmount ||
      parseMoneyToMinorUnits(line.taxableAmount) <= 0n
    ) {
      return [];
    }
    const taxableAmount = minorUnitsToCanonical(
      parseMoneyToMinorUnits(line.taxableAmount),
    );
    const vatRate = Number(line.vatRate) as ExpenseVatRate;
    const vatAmount = resolveExpenseVatAmount(
      taxableAmount,
      vatRate,
      line.vatAmount.trim(),
    );

    return [{ vatRate, taxableAmount, vatAmount }];
  });
}

function expenseCategoryGroups(currentCategory: string) {
  const operatingOptions = EXPENSE_CATEGORIES_BY_GROUP.operating.map(
    (value) => ({
      value,
      label: copy.categoryLabels[value],
    }),
  );
  const isOperating =
    currentCategory !== "" &&
    (EXPENSE_CATEGORIES_BY_GROUP.operating as readonly string[]).includes(
      currentCategory,
    );
  const extraOptions =
    currentCategory && !isOperating
      ? [
          {
            value: currentCategory,
            label:
              (copy.categoryLabels as Record<string, string>)[
                currentCategory
              ] ?? currentCategory,
          },
        ]
      : [];
  const options = [
    ...operatingOptions,
    ...extraOptions.filter(
      (option) =>
        !operatingOptions.some((existing) => existing.value === option.value),
    ),
  ];
  return [{ label: copy.categoryGroupLabels.operating, options }];
}

const METHOD_OPTIONS = EXPENSE_PAYMENT_METHODS.map((value) => ({
  value,
  label: copy.paymentMethodLabels[value],
}));

const VAT_RATE_OPTIONS = EXPENSE_VAT_RATES.map((rate) => ({
  value: String(rate),
  label: formatPercent(rate, 0),
}));

const EMPTY_EXPENSE_LINE: ExpenseFormValues["lines"][number] = {
  taxableAmount: "",
  vatRate: "0",
  vatAmount: "",
};

function ExpenseFormFields({
  form,
  branchOptions,
  tenantId,
  isTouchLayout,
  paymentMethodReadOnly = false,
  readOnly = false,
  transferContent = null,
  paymentState = null,
  onCopyTransferContent,
}: {
  form: UseFormReturn<ExpenseFormValues>;
  branchOptions: readonly { value: string; label: string }[];
  tenantId: number;
  isTouchLayout: boolean;
  paymentMethodReadOnly?: boolean;
  readOnly?: boolean;
  transferContent?: string | null;
  paymentState?: ExpensePaymentState | null;
  onCopyTransferContent?: (content: string) => void;
}) {
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "lines",
  });
  const lines = form.watch("lines");
  const category = form.watch("category");
  const vatBreakdown = buildExpenseVatBreakdown(form.getValues());
  const subtotal = addMoney(vatBreakdown.map((line) => line.taxableAmount));
  const vatAmount = addMoney(vatBreakdown.map((line) => line.vatAmount));
  const grossTotal = expenseGrossFromBreakdown(vatBreakdown);
  const showPaymentMethodAsText = readOnly || paymentMethodReadOnly;

  return (
    <>
      {paymentState ? (
        <StatusBadge domain="expense-payment" value={paymentState} />
      ) : null}
      <div className="grid gap-4 md:grid-cols-2">
        <BusinessDateField
          control={form.control}
          name="expenseDate"
          label={copy.form.date}
          required
          disabled={readOnly}
        />
        <SelectField
          control={form.control}
          name="branchId"
          label={copy.form.branch}
          options={branchOptions}
          placeholder={copy.form.branchTenantLevel}
          disabled={readOnly}
        />
        <SelectField
          control={form.control}
          name="category"
          label={copy.form.category}
          groups={expenseCategoryGroups(category)}
          placeholder={copy.form.categoryPlaceholder}
          required
          disabled={readOnly}
        />
        {showPaymentMethodAsText ? (
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium">{copy.form.paymentSection}</p>
            <p>
              {
                copy.paymentMethodLabels[
                  form.watch("paymentMethod") as ExpensePaymentMethod
                ]
              }
            </p>
          </div>
        ) : (
          <SelectField
            control={form.control}
            name="paymentMethod"
            label={copy.form.paymentSection}
            options={METHOD_OPTIONS}
            placeholder={copy.form.methodPlaceholder}
            required
          />
        )}
        <div className="md:col-span-2">
          <TextareaField
            control={form.control}
            name="note"
            label={copy.form.note}
            placeholder={copy.form.notePlaceholder}
            required
            disabled={readOnly}
          />
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <div>
          <p className="text-sm font-medium">{copy.form.vatSection}</p>
          <p className="text-xs text-muted-foreground">
            {copy.form.vatSectionHint}
          </p>
        </div>
        {fields.map((field, index) => {
          const selectedRate = lines[index]?.vatRate;
          const rateOptions = VAT_RATE_OPTIONS.map((option) => ({
            ...option,
            disabled:
              option.value !== selectedRate &&
              lines.some((line) => line.vatRate === option.value),
          }));
          return (
            <Item
              key={field.id}
              variant="outline"
              className="flex flex-col gap-3 p-4"
            >
              <FinanceMoneyBlockFields
                control={form.control}
                taxableName={`lines.${index}.taxableAmount`}
                vatRateName={`lines.${index}.vatRate`}
                vatAmountName={`lines.${index}.vatAmount`}
                vatRateOptions={rateOptions}
                readOnly={readOnly}
                onRecalculateVat={
                  readOnly
                    ? undefined
                    : () => {
                        const taxable = form.getValues(
                          `lines.${index}.taxableAmount`,
                        );
                        const rate = Number(
                          form.getValues(`lines.${index}.vatRate`),
                        ) as ExpenseVatRate;
                        if (!taxable?.trim()) return;
                        form.setValue(
                          `lines.${index}.vatAmount`,
                          calculateVatAmount(taxable, rate),
                          { shouldDirty: true },
                        );
                      }
                }
              />
              {!readOnly && fields.length > 1 ? (
                <Button
                  type="button"
                  variant="outline"
                  size={isTouchLayout ? "touch" : "default"}
                  className="self-start"
                  onClick={() => remove(index)}
                >
                  <IconTrash data-icon="inline-start" />
                  {copy.form.removeLine}
                </Button>
              ) : null}
            </Item>
          );
        })}
        {!readOnly ? (
          <Button
            type="button"
            variant="outline"
            size={isTouchLayout ? "touch" : "default"}
            className="self-start"
            disabled={fields.length >= EXPENSE_VAT_RATES.length}
            onClick={() => {
              const nextRate = EXPENSE_VAT_RATES.find(
                (rate) => !lines.some((line) => line.vatRate === String(rate)),
              );
              append({
                ...EMPTY_EXPENSE_LINE,
                vatRate: String(
                  nextRate ?? 0,
                ) as ExpenseFormValues["lines"][number]["vatRate"],
              });
            }}
          >
            <IconPlus data-icon="inline-start" />
            {copy.form.addLine}
          </Button>
        ) : null}
        <FinanceMoneySummary
          rows={[
            { label: moneyLabels.subtotalExVat, value: subtotal },
            { label: moneyLabels.vatAmount, value: vatAmount },
            {
              label: moneyLabels.totalInclVat,
              value: grossTotal,
              emphasize: true,
            },
          ]}
        />
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">{copy.form.attachment}</p>
        <p className="text-xs text-muted-foreground">
          {copy.form.attachmentHint}
        </p>
        <PhotoUploadInput
          tenantId={tenantId}
          folder="expenses/pending"
          value={form.watch("invoiceAttachmentUrl") || null}
          onChange={(url) =>
            form.setValue("invoiceAttachmentUrl", url ?? "", {
              shouldDirty: true,
            })
          }
          acceptTypes="image+pdf"
          previewSize={isTouchLayout ? "touch" : "default"}
          disabled={readOnly}
        />
      </div>
      {transferContent ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">{copy.form.transferContent}</p>
          <Item variant="muted" className="flex-col items-stretch gap-3 p-4">
            <code className="block break-all font-mono text-base font-semibold tabular-nums tracking-wide">
              {transferContent}
            </code>
            {onCopyTransferContent ? (
              <Button
                size={isTouchLayout ? "touch" : "default"}
                variant="outline"
                className="w-full"
                onClick={() => onCopyTransferContent(transferContent)}
              >
                <IconCopy data-icon="inline-start" />
                {copy.transferInstruction.copy}
              </Button>
            ) : null}
          </Item>
        </div>
      ) : null}
    </>
  );
}

function expenseToFormValues(expense: ExpenseRow): ExpenseFormValues {
  return {
    expenseDate: expense.expense_date,
    branchId:
      expense.branch_id == null
        ? TENANT_LEVEL_BRANCH_VALUE
        : String(expense.branch_id),
    category: expense.category,
    paymentMethod: expensePaymentMethod(expense) as ExpensePaymentMethod,
    note: expense.note ?? "",
    invoiceAttachmentUrl: expense.invoice_attachment_url ?? "",
    lines:
      expense.vat_breakdown.length > 0
        ? expense.vat_breakdown.map((line) => ({
            taxableAmount: minorUnitsToCanonical(
              parseMoneyToMinorUnits(String(line.taxableAmount)),
            ),
            vatRate: String(
              line.vatRate,
            ) as ExpenseFormValues["lines"][number]["vatRate"],
            vatAmount: minorUnitsToCanonical(
              parseMoneyToMinorUnits(String(line.vatAmount)),
            ),
          }))
        : [EMPTY_EXPENSE_LINE],
  };
}

function ExpenseViewDialog({
  expense,
  branchOptions,
  tenantId,
  isTouchLayout,
  onClose,
  onCopyTransferContent,
}: {
  expense: ExpenseRow | null;
  branchOptions: readonly { value: string; label: string }[];
  tenantId: number;
  isTouchLayout: boolean;
  onClose: () => void;
  onCopyTransferContent: (content: string) => void;
}) {
  const form = useForm<ExpenseFormValues>({
    defaultValues: expense ? expenseToFormValues(expense) : undefined,
  });

  useEffect(() => {
    if (expense) form.reset(expenseToFormValues(expense));
  }, [expense, form]);

  return (
    <AppDialog
      open={expense != null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={copy.form.viewTitle}
      description={
        expense
          ? `${formatVNBusinessDate(expense.expense_date)} · ${
              EXPENSE_PAYMENT_STATE_LABELS_VI[
                classifyExpensePaymentState(expense)
              ]
            }`
          : undefined
      }
      variant="document"
      footer={
        <Button type="button" variant="outline" onClick={onClose}>
          {ACTIONS_VI.close}
        </Button>
      }
    >
      {expense ? (
        <ExpenseFormFields
          form={form}
          branchOptions={branchOptions}
          tenantId={tenantId}
          isTouchLayout={isTouchLayout}
          readOnly
          paymentMethodReadOnly
          transferContent={expense.transfer_content}
          paymentState={classifyExpensePaymentState(expense)}
          onCopyTransferContent={onCopyTransferContent}
        />
      ) : null}
    </AppDialog>
  );
}

function expenseDetail(row: ExpenseRow): string {
  return [
    row.vendor_name,
    row.note,
    row.transfer_content
      ? copy.transferInstruction.detail(row.transfer_content)
      : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function expensePaymentMethod(row: ExpenseRow): string {
  return row.transfer_content ? "transfer" : row.payment_method;
}

function canDeleteExpense(row: ExpenseRow): boolean {
  return (
    row.category !== "bank_deposit" &&
    row.transfer_content == null &&
    row.matchedEventIds.length === 0
  );
}

export function ExpensesClient({
  params,
  branches,
  rows,
  summary,
  stateFilter,
  todayBusinessDate,
  canManageExpenses,
  tenantId,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const overlay = useDocumentOverlayUrl(EXPENSE_OVERLAY_KEYS);
  const isTouchLayout = useIsMobile(1024);
  const showOnlyNeedsAction = stateFilter === "pending";
  const visibleRows = useMemo(
    () => (showOnlyNeedsAction ? rows.filter(expenseNeedsAction) : rows),
    [rows, showOnlyNeedsAction],
  );
  const [isMutating, startMutation] = useTransition();

  const mode = overlay.get("mode");
  const expenseIdRaw = overlay.get("expenseId");
  const parsedExpenseId = expenseIdRaw ? Number(expenseIdRaw) : null;
  const expenseId =
    parsedExpenseId != null &&
    Number.isInteger(parsedExpenseId) &&
    parsedExpenseId > 0
      ? parsedExpenseId
      : null;
  const selectedExpense = useMemo(
    () =>
      expenseId != null
        ? (rows.find((row) => row.id === expenseId) ?? null)
        : null,
    [rows, expenseId],
  );
  const createOpen = mode === "create";
  const viewOpen = mode === "view" && selectedExpense != null;
  const editOpen = mode === "edit" && selectedExpense != null;
  const formDialogOpen = canManageExpenses && (createOpen || editOpen);
  const viewingExpense = viewOpen ? selectedExpense : null;
  const editingExpense = editOpen ? selectedExpense : null;

  const { clearOverlay, patchOverlay } = overlay;

  useEffect(() => {
    if (mode == null || mode === "create") return;
    if (expenseId != null && selectedExpense == null) {
      clearOverlay();
    }
  }, [mode, expenseId, selectedExpense, clearOverlay]);

  const branchNames = new Map(branches.map((b) => [b.id, b.name]));
  const branchLabel = (branchId: number | null) =>
    branchId != null
      ? (branchNames.get(branchId) ?? `#${branchId}`)
      : copy.tenantLevel;

  function openExpenseDocument(row: ExpenseRow) {
    patchOverlay({ expenseId: row.id, mode: "view" }, "push");
  }

  function closeExpenseDocument() {
    clearOverlay();
  }

  function toggleNeedsActionFilter() {
    const next = new URLSearchParams(searchParams.toString());
    if (showOnlyNeedsAction) next.delete(EXPENSE_LIST_STATE_PARAM);
    else next.set(EXPENSE_LIST_STATE_PARAM, "pending");
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, {
      scroll: false,
    });
  }

  function categoryLabel(category: string) {
    return (
      (copy.categoryLabels as Record<string, string>)[category] ?? category
    );
  }

  function methodLabel(row: ExpenseRow) {
    const method = expensePaymentMethod(row);
    return (
      (copy.paymentMethodLabels as Record<string, string>)[method] ?? method
    );
  }

  const branchOptions = [
    { value: TENANT_LEVEL_BRANCH_VALUE, label: copy.form.branchTenantLevel },
    ...branches.map((b) => ({ value: String(b.id), label: b.name })),
  ];

  const defaultValues: ExpenseFormValues = {
    expenseDate: todayBusinessDate,
    branchId:
      params.branch != null ? String(params.branch) : TENANT_LEVEL_BRANCH_VALUE,
    category: "",
    paymentMethod: "cash",
    note: "",
    invoiceAttachmentUrl: "",
    lines: [EMPTY_EXPENSE_LINE],
  };

  const formDefaultValues: ExpenseFormValues = editingExpense
    ? expenseToFormValues(editingExpense)
    : defaultValues;

  const editingPaymentState = editingExpense
    ? classifyExpensePaymentState(editingExpense)
    : null;

  async function onSubmit(values: ExpenseFormValues): Promise<ActionResult> {
    const branchId =
      !values.branchId || values.branchId === TENANT_LEVEL_BRANCH_VALUE
        ? null
        : Number(values.branchId);
    const vatBreakdown = buildExpenseVatBreakdown(values);
    const attachment = values.invoiceAttachmentUrl?.trim();
    const nextMethod = values.paymentMethod as ExpensePaymentMethod;

    if (!editingExpense) {
      const result = await createExpense({
        branchId,
        expenseDate: values.expenseDate,
        category: values.category as ExpenseCategory,
        vatBreakdown,
        paymentMethod: nextMethod,
        note: values.note,
        invoiceAttachmentUrl: attachment || undefined,
      });
      if (result.success) router.refresh();
      return result;
    }

    const result = await updateExpense({
      expenseId: editingExpense.id,
      branchId,
      expenseDate: values.expenseDate,
      category: values.category as ExpenseCategory,
      vatBreakdown,
      note: values.note,
      invoiceAttachmentUrl: attachment || undefined,
    });
    if (!result.success) return result;

    const previousMethod = expensePaymentMethod(
      editingExpense,
    ) as ExpensePaymentMethod;
    if (
      nextMethod !== previousMethod &&
      canCorrectExpensePaymentMethod(editingExpense)
    ) {
      const transition = await transitionExpensePayment({
        expenseId: editingExpense.id,
        targetMethod: nextMethod,
      });
      if (!transition.success) {
        return {
          success: false,
          error: transition.error ?? copy.actions.updateFailed,
        };
      }
    }

    router.refresh();
    return result;
  }

  function onCreateSuccess(_result: ActionResult) {
    toast.success(editingExpense ? copy.form.editSuccess : copy.form.success);
    closeExpenseDocument();
  }

  function onEdit(row: ExpenseRow) {
    patchOverlay({ expenseId: row.id, mode: "edit" }, "replace");
  }

  function openCreateExpense() {
    patchOverlay({ expenseId: null, mode: "create" }, "push");
  }

  async function copyTransferContent(content: string) {
    try {
      await navigator.clipboard.writeText(content);
      toast.success(copy.transferInstruction.copied);
    } catch {
      toast.error(copy.transferInstruction.copyFailed);
    }
  }

  async function onDelete(row: ExpenseRow) {
    const ok = await confirm({
      title: copy.table.deleteTitle,
      description: copy.table.deleteConfirm(formatAccountingVND(row.amount)),
      confirmText: copy.table.deleteCta,
      cancelText: copy.table.deleteCancel,
      variant: "destructive",
    });
    if (!ok) return;
    startMutation(async () => {
      const result = await deleteExpense({ expenseId: row.id });
      if (result.success) {
        toast.success(copy.table.deleteSuccess);
        if (row.id === expenseId) closeExpenseDocument();
        router.refresh();
      } else {
        toast.error(result.error ?? copy.table.deleteFailed);
      }
    });
  }

  function runPaymentTransition(
    row: ExpenseRow,
    targetMethod: ExpensePaymentMethod,
  ) {
    startMutation(async () => {
      const result = await transitionExpensePayment({
        expenseId: row.id,
        targetMethod,
      });
      if (!result.success) {
        toast.error(result.error ?? copy.actions.updateFailed);
        return;
      }

      if (targetMethod === "cash") {
        toast.success(copy.actions.cashSuccess);
      } else if (targetMethod === "transfer") {
        toast.success(copy.actions.transferSuccess);
      } else {
        toast.success(copy.actions.cancelTransferSuccess);
      }
      closeExpenseDocument();
      router.refresh();
    });
  }

  async function onPayCash(row: ExpenseRow) {
    const ok = await confirm({
      title: copy.actions.cashTitle,
      description: copy.actions.cashConfirm(formatAccountingVND(row.amount)),
      confirmText: copy.actions.cashCta,
      cancelText: copy.actions.keepUnpaid,
    });
    if (ok) runPaymentTransition(row, "cash");
  }

  async function onPayTransfer(row: ExpenseRow) {
    const ok = await confirm({
      title: copy.actions.transferTitle,
      description: copy.actions.transferConfirm(
        formatAccountingVND(row.amount),
      ),
      confirmText: copy.actions.transferCta,
      cancelText: copy.actions.keepUnpaid,
    });
    if (ok) runPaymentTransition(row, "transfer");
  }

  async function onCancelTransfer(row: ExpenseRow) {
    const ok = await confirm({
      title: copy.actions.cancelTransferTitle,
      description: copy.actions.cancelTransferConfirm(
        row.transfer_content ?? "—",
      ),
      confirmText: copy.actions.cancelTransferCta,
      cancelText: copy.actions.keepTransfer,
    });
    if (ok) runPaymentTransition(row, "unpaid");
  }

  function getExpenseRowActions(row: ExpenseRow): RowActionItem[] {
    const paymentState = classifyExpensePaymentState(row);
    if (
      paymentState === "transfer_matched" ||
      row.category === "bank_deposit"
    ) {
      return [];
    }

    if (paymentState === "unpaid") {
      return [
        {
          key: "cash",
          label: copy.actions.cash,
          icon: <IconBanknote className="size-4" />,
          onSelect: () => void onPayCash(row),
          disabled: isMutating,
        },
        {
          key: "transfer",
          label: copy.actions.transfer,
          icon: <IconLandmark className="size-4" />,
          onSelect: () => void onPayTransfer(row),
          disabled: isMutating,
        },
        ...(canDeleteExpense(row)
          ? [
              {
                key: "edit",
                label: copy.table.edit,
                icon: <IconPencil className="size-4" />,
                onSelect: () => onEdit(row),
                disabled: isMutating,
                separatorBefore: true,
              } satisfies RowActionItem,
              {
                key: "delete",
                label: copy.table.delete,
                icon: <IconTrash className="size-4" />,
                onSelect: () => void onDelete(row),
                disabled: isMutating,
                destructive: true,
              } satisfies RowActionItem,
            ]
          : []),
      ];
    }

    if (paymentState === "transfer_needs_match" && row.transfer_content) {
      return [
        {
          key: "copy",
          label: copy.transferInstruction.copy,
          icon: <IconCopy className="size-4" />,
          onSelect: () => void copyTransferContent(row.transfer_content!),
        },
        {
          key: "cancel-transfer",
          label: copy.actions.cancelTransfer,
          icon: <IconRotateCcw className="size-4" />,
          onSelect: () => void onCancelTransfer(row),
          disabled: isMutating,
        },
      ];
    }

    if (row.transfer_content) {
      return [
        {
          key: "copy",
          label: copy.transferInstruction.copy,
          icon: <IconCopy className="size-4" />,
          onSelect: () => void copyTransferContent(row.transfer_content!),
        },
      ];
    }

    return canDeleteExpense(row)
      ? [
          {
            key: "edit",
            label: copy.table.edit,
            icon: <IconPencil className="size-4" />,
            onSelect: () => onEdit(row),
            disabled: isMutating,
          } satisfies RowActionItem,
          {
            key: "delete",
            label: copy.table.delete,
            icon: <IconTrash className="size-4" />,
            onSelect: () => void onDelete(row),
            disabled: isMutating,
            destructive: true,
          },
        ]
      : [];
  }

  const columns: DataTableColumn<ExpenseRow>[] = [
    {
      key: "date",
      header: copy.table.date,
      className: "w-28 font-mono tabular-nums",
      render: (row) => formatVNBusinessDate(row.expense_date),
    },
    {
      key: "category",
      header: copy.table.category,
      render: (row) => categoryLabel(row.category),
    },
    {
      key: "branch",
      header: copy.table.branch,
      className: "text-muted-foreground",
      render: (row) => branchLabel(row.branch_id),
    },
    {
      key: "method",
      header: copy.table.method,
      render: (row) => methodLabel(row),
    },
    {
      key: "subtotal",
      header: moneyLabels.subtotalExVat,
      className: "text-right",
      render: (row) => (
        <FinanceAmountCell amount={row.subtotal} basis="exVat" />
      ),
    },
    {
      key: "vat",
      header: copy.table.vat,
      className: "text-right",
      render: (row) => <FinanceAmountCell amount={row.vat_amount} />,
    },
    {
      key: "amount",
      header: moneyLabels.totalInclVat,
      className: "text-right",
      render: (row) => (
        <FinanceAmountCell amount={row.amount} basis="inclVat" />
      ),
    },
    {
      key: "paymentState",
      header: copy.table.paymentState,
      render: (row) => (
        <StatusBadge
          domain="expense-payment"
          value={classifyExpensePaymentState(row)}
        />
      ),
    },
    {
      key: "detail",
      header: copy.table.detail,
      className: "max-w-48 truncate text-muted-foreground",
      render: (row) => expenseDetail(row) || "—",
    },
    ...(canManageExpenses
      ? [
          {
            key: "actions",
            header: "",
            className: "w-12",
            render: (row: ExpenseRow) => {
              const items = getExpenseRowActions(row);
              return items.length > 0 ? (
                <div
                  onClick={(event) => event.stopPropagation()}
                  onKeyDown={(event) => event.stopPropagation()}
                >
                  <RowActionsMenu
                    items={items}
                    label={copy.table.actions}
                    triggerSize="icon-sm"
                  />
                </div>
              ) : null;
            },
          } satisfies DataTableColumn<ExpenseRow>,
        ]
      : []),
  ];

  return (
    <>
      <AppPageHeader
        title={copy.page.title}
        description={copy.page.description}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size={isTouchLayout ? "touch" : "default"}
              variant={showOnlyNeedsAction ? "default" : "outline"}
              onClick={toggleNeedsActionFilter}
              aria-pressed={showOnlyNeedsAction}
            >
              <IconAlertTriangle data-icon="inline-start" />
              {copy.needsActionFilter}
            </Button>
            {canManageExpenses ? (
              <Button
                size={isTouchLayout ? "touch" : "default"}
                onClick={openCreateExpense}
              >
                <IconPlus data-icon="inline-start" />
                {copy.add}
              </Button>
            ) : null}
          </div>
        }
      />

      <KpiRow density="compact">
        <KpiCard
          label={copy.totalLabel}
          value={formatAccountingVND(summary.operatingTotal)}
          shortValue={formatCompactVND(summary.operatingTotal)}
          valueLabel={`${copy.totalLabel}: ${formatAccountingVND(summary.operatingTotal)}`}
          hint={copy.totalHint(formatCount(summary.operatingCount))}
          tone="primary"
          density="compact"
        />
        <KpiCard
          label={copy.needsActionLabel}
          value={formatAccountingVND(summary.needsActionTotal)}
          shortValue={formatCompactVND(summary.needsActionTotal)}
          valueLabel={`${copy.needsActionLabel}: ${formatAccountingVND(summary.needsActionTotal)}`}
          hint={copy.needsActionHint(formatCount(summary.needsActionCount))}
          tone={summary.needsActionCount > 0 ? "warning" : "neutral"}
          density="compact"
        />
      </KpiRow>

      <AppListFrame
        title={copy.listTitle}
        toolbar={
          <FilterBar
            params={params}
            branches={branches}
            basePath="/finance/expenses"
            locationFilter
            hide={["compare", "granularity"]}
          />
        }
      >
        <DataTable
          columns={columns}
          data={visibleRows}
          pageSize={50}
          getRowKey={(row) => row.id}
          onRowClick={openExpenseDocument}
          getRowAriaLabel={(row) =>
            copy.form.openAria(categoryLabel(row.category))
          }
          getRowDataState={(row) =>
            row.id === expenseId ? "selected" : undefined
          }
          renderRowContextMenu={(row) => {
            if (!canManageExpenses) return null;
            const items = getExpenseRowActions(row);
            return items.length > 0 ? (
              <RowActionsContextMenuItems items={items} />
            ) : null;
          }}
          emptyMode="no-data"
          emptyTitle={
            showOnlyNeedsAction ? copy.empty.clearedTitle : copy.empty.title
          }
          emptyDescription={
            showOnlyNeedsAction
              ? copy.empty.clearedDescription
              : copy.empty.description
          }
          mobileCardRender={(row) => {
            const detail = expenseDetail(row);
            const actionItems = getExpenseRowActions(row);
            return (
              <Item
                variant="outline"
                role="button"
                tabIndex={0}
                aria-label={copy.form.openAria(categoryLabel(row.category))}
                className="cursor-pointer"
                onClick={() => openExpenseDocument(row)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    openExpenseDocument(row);
                  }
                }}
              >
                <ItemHeader>
                  <ItemContent>
                    <ItemTitle>{categoryLabel(row.category)}</ItemTitle>
                    <ItemDescription>
                      {formatVNBusinessDate(row.expense_date)} ·{" "}
                      {branchLabel(row.branch_id)} · {methodLabel(row)}
                    </ItemDescription>
                  </ItemContent>
                  <div className="flex shrink-0 items-center gap-2">
                    <StatusBadge
                      domain="expense-payment"
                      value={classifyExpensePaymentState(row)}
                    />
                    {canManageExpenses && actionItems.length > 0 ? (
                      <ItemActions
                        onClick={(event) => event.stopPropagation()}
                        onKeyDown={(event) => event.stopPropagation()}
                      >
                        <RowActionsMenu
                          items={actionItems}
                          label={copy.table.actions}
                          triggerSize="icon-touch"
                        />
                      </ItemActions>
                    ) : null}
                  </div>
                </ItemHeader>
                <ItemFooter className="items-end gap-2">
                  <ItemDescription className="min-w-0 flex-1">
                    {detail || "—"}
                  </ItemDescription>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="shrink-0 whitespace-nowrap font-mono text-sm font-semibold tabular-nums">
                      {formatAccountingVND(row.amount)}
                    </span>
                  </div>
                </ItemFooter>
              </Item>
            );
          }}
        />
      </AppListFrame>

      {canManageExpenses ? (
        <FormDialog
          open={formDialogOpen}
          onOpenChange={(open) => {
            if (!open) closeExpenseDocument();
          }}
          title={editingExpense ? copy.form.editTitle : copy.form.title}
          description={
            editingExpense && editingPaymentState
              ? EXPENSE_PAYMENT_STATE_LABELS_VI[editingPaymentState]
              : undefined
          }
          schema={expenseFormSchema}
          defaultValues={formDefaultValues}
          entityKey={editingExpense?.id ?? "create"}
          onSubmit={onSubmit}
          onSuccess={onCreateSuccess}
          submitLabel={editingExpense ? copy.form.editSubmit : copy.form.submit}
          variant="document"
          renderFooter={
            editingExpense &&
            (editingPaymentState === "unpaid" ||
              editingPaymentState === "transfer_needs_match")
              ? ({
                  formId,
                  isPending,
                  requestClose,
                  submitLabel,
                  actionSize,
                  cancelLabel,
                }) => (
                  <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      size={actionSize}
                      onClick={requestClose}
                      disabled={isPending || isMutating}
                    >
                      {cancelLabel}
                    </Button>
                    {editingPaymentState === "unpaid" ? (
                      <>
                        <Button
                          type="button"
                          variant="outline"
                          size={actionSize}
                          disabled={isPending || isMutating}
                          onClick={() => void onPayCash(editingExpense)}
                        >
                          {isMutating ? <Spinner /> : null}
                          <IconBanknote data-icon="inline-start" />
                          {copy.actions.cash}
                        </Button>
                        <Button
                          type="button"
                          size={actionSize}
                          disabled={isPending || isMutating}
                          onClick={() => void onPayTransfer(editingExpense)}
                        >
                          {isMutating ? <Spinner /> : null}
                          <IconLandmark data-icon="inline-start" />
                          {copy.actions.transfer}
                        </Button>
                      </>
                    ) : null}
                    {editingPaymentState === "transfer_needs_match" &&
                    editingExpense.transfer_content ? (
                      <>
                        <Button
                          type="button"
                          variant="outline"
                          size={actionSize}
                          disabled={isPending || isMutating}
                          onClick={() =>
                            void copyTransferContent(
                              editingExpense.transfer_content!,
                            )
                          }
                        >
                          <IconCopy data-icon="inline-start" />
                          {copy.transferInstruction.copy}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size={actionSize}
                          disabled={isPending || isMutating}
                          onClick={() => void onCancelTransfer(editingExpense)}
                        >
                          {isMutating ? <Spinner /> : null}
                          <IconRotateCcw data-icon="inline-start" />
                          {copy.actions.cancelTransfer}
                        </Button>
                      </>
                    ) : null}
                    <Button
                      type="submit"
                      form={formId}
                      variant="outline"
                      size={actionSize}
                      disabled={isPending || isMutating}
                    >
                      {isPending ? <Spinner /> : null}
                      {submitLabel}
                    </Button>
                  </div>
                )
              : undefined
          }
        >
          {(form) => {
            const canEditPaymentMethod =
              editingExpense == null ||
              canCorrectExpensePaymentMethod(editingExpense);
            return (
              <ExpenseFormFields
                form={form}
                branchOptions={branchOptions}
                tenantId={tenantId}
                isTouchLayout={isTouchLayout}
                paymentMethodReadOnly={!canEditPaymentMethod}
                transferContent={editingExpense?.transfer_content}
                paymentState={editingPaymentState}
                onCopyTransferContent={(content) =>
                  void copyTransferContent(content)
                }
              />
            );
          }}
        </FormDialog>
      ) : null}

      <ExpenseViewDialog
        expense={viewingExpense}
        branchOptions={branchOptions}
        tenantId={tenantId}
        isTouchLayout={isTouchLayout}
        onClose={closeExpenseDocument}
        onCopyTransferContent={(content) => void copyTransferContent(content)}
      />
    </>
  );
}
