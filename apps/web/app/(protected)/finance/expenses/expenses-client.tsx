"use client";

import { useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useFieldArray, type UseFormReturn } from "react-hook-form";
import { z } from "zod";
import {
  Banknote as IconBanknote,
  Copy as IconCopy,
  ExternalLink as IconExternalLink,
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
  hasMaximumScale,
  minorUnitsToCanonical,
  parseMoneyToMinorUnits,
} from "@comtammatu/shared/money";
import { formatVNBusinessDate } from "@comtammatu/shared/time";
import { ACTIONS_VI, FORM_VI } from "@comtammatu/shared/messages";
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
import { NoteCallout } from "@comtammatu/ui/components/note-callout";
import { confirm } from "@comtammatu/ui/components/confirm-dialog";
import { toast } from "@comtammatu/ui/components/sonner";
import { useIsMobile } from "@comtammatu/ui/hooks/use-mobile";
import type { ActionResult } from "@comtammatu/shared/types";
import {
  RowActionsMenu,
  type RowActionItem,
} from "@/components/row-actions-menu";
import { KpiCard } from "@/components/kpi/kpi-card";
import { StatusBadge } from "@/components/status-badge";
import { AppSection, DescriptionList, KpiRow } from "@/components/surface";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import {
  AppDialog,
  BusinessDateField,
  FormDialog,
  MoneyVndField,
  PhotoUploadInput,
  SelectField,
  TextareaField,
} from "@/components/form";
import { messages } from "@lib/messages";
import { FilterBar } from "../components/filter-bar";
import {
  EXPENSE_PAYMENT_METHODS,
  canCorrectExpensePaymentMethod,
  classifyExpensePaymentState,
  expenseNeedsAction,
  type ExpenseCategory,
  type ExpensePaymentMethod,
} from "../_lib/expense-categories";
import type { FinanceParams } from "../_lib/finance-params";
import {
  EXPENSE_VAT_RATES,
  expenseTaxableFromGross,
  resolveExpenseVatAmountFromGross,
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
  totalAmount: optionalMoneySchema.refine(
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
      if (vatAmount > parseMoneyToMinorUnits(line.totalAmount)) {
        ctx.addIssue({
          code: "custom",
          message: "Thuế GTGT không được lớn hơn tổng tiền.",
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
    if (!line.totalAmount || parseMoneyToMinorUnits(line.totalAmount) <= 0n) {
      return [];
    }
    const grossAmount = minorUnitsToCanonical(
      parseMoneyToMinorUnits(line.totalAmount),
    );
    const vatRate = Number(line.vatRate) as ExpenseVatRate;
    const vatAmount = resolveExpenseVatAmountFromGross(
      grossAmount,
      vatRate,
      line.vatAmount.trim(),
    );

    return [
      {
        vatRate,
        taxableAmount: expenseTaxableFromGross(grossAmount, vatAmount),
        vatAmount,
      },
    ];
  });
}

const EXPENSE_FORM_CATEGORIES = [
  "rent",
  "salary",
  "utilities",
  "other",
] as const satisfies readonly ExpenseCategory[];

const CATEGORY_OPTIONS = EXPENSE_FORM_CATEGORIES.map((value) => ({
  value,
  label: copy.categoryLabels[value],
}));

const METHOD_OPTIONS = EXPENSE_PAYMENT_METHODS.map((value) => ({
  value,
  label: copy.paymentMethodLabels[value],
}));

const VAT_RATE_OPTIONS = EXPENSE_VAT_RATES.map((rate) => ({
  value: String(rate),
  label: formatPercent(rate, 0),
}));

const EMPTY_EXPENSE_LINE: ExpenseFormValues["lines"][number] = {
  totalAmount: "",
  vatRate: "0",
  vatAmount: "",
};

function ExpenseFormFields({
  form,
  branchOptions,
  tenantId,
  isTouchLayout,
  paymentMethodReadOnly = false,
  editingPaymentMethod = false,
}: {
  form: UseFormReturn<ExpenseFormValues>;
  branchOptions: readonly { value: string; label: string }[];
  tenantId: number;
  isTouchLayout: boolean;
  paymentMethodReadOnly?: boolean;
  editingPaymentMethod?: boolean;
}) {
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "lines",
  });
  const lines = form.watch("lines");
  const vatBreakdown = buildExpenseVatBreakdown(form.getValues());
  const subtotal = addMoney(vatBreakdown.map((line) => line.taxableAmount));
  const vatAmount = addMoney(vatBreakdown.map((line) => line.vatAmount));
  const totalAmount = addMoney(lines.map((line) => line.totalAmount || "0"));

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2">
        <BusinessDateField
          control={form.control}
          name="expenseDate"
          label={copy.form.date}
          required
        />
        <SelectField
          control={form.control}
          name="branchId"
          label={copy.form.branch}
          options={branchOptions}
          placeholder={copy.form.branchTenantLevel}
        />
        <SelectField
          control={form.control}
          name="category"
          label={copy.form.category}
          options={CATEGORY_OPTIONS}
          placeholder={copy.form.categoryPlaceholder}
          required
        />
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">{copy.form.paymentSection}</p>
          {paymentMethodReadOnly ? (
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium">{copy.form.method}</p>
              <p>
                {
                  copy.paymentMethodLabels[
                    form.watch("paymentMethod") as ExpensePaymentMethod
                  ]
                }
              </p>
              <p className="text-xs text-muted-foreground">
                {copy.form.methodEditHint}
              </p>
            </div>
          ) : (
            <SelectField
              control={form.control}
              name="paymentMethod"
              label={copy.form.method}
              options={METHOD_OPTIONS}
              placeholder={copy.form.methodPlaceholder}
              description={
                editingPaymentMethod
                  ? copy.form.methodCorrectHint
                  : copy.form.methodHints[
                      form.watch("paymentMethod") as ExpensePaymentMethod
                    ]
              }
              required
            />
          )}
        </div>
        <div className="md:col-span-2">
          <TextareaField
            control={form.control}
            name="note"
            label={copy.form.note}
            placeholder={copy.form.notePlaceholder}
            required
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
              className="grid items-end gap-3 md:grid-cols-[minmax(0,1fr)_10rem_minmax(0,1fr)_auto]"
            >
              <MoneyVndField
                control={form.control}
                name={`lines.${index}.totalAmount`}
                label={copy.form.lineTotal}
                placeholder="0"
                required
              />
              <SelectField
                control={form.control}
                name={`lines.${index}.vatRate`}
                label={copy.form.lineVatRate}
                options={rateOptions}
                required
              />
              <MoneyVndField
                control={form.control}
                name={`lines.${index}.vatAmount`}
                label={copy.form.lineVatAmount}
                placeholder={copy.form.vatAutoPlaceholder}
              />
              {fields.length > 1 ? (
                <Button
                  type="button"
                  variant="outline"
                  size={isTouchLayout ? "touch" : "default"}
                  className="self-end"
                  onClick={() => remove(index)}
                >
                  <IconTrash data-icon="inline-start" />
                  {copy.form.removeLine}
                </Button>
              ) : null}
            </Item>
          );
        })}
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
        <NoteCallout tone="muted">
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">
              {copy.form.subtotalLabel}
            </span>
            <span className="font-mono tabular-nums">
              {formatAccountingVND(subtotal)}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">
              {copy.form.vatTotalLabel}
            </span>
            <span className="font-mono tabular-nums">
              {formatAccountingVND(vatAmount)}
            </span>
          </div>
          <div className="mt-1 flex items-center justify-between gap-3 border-t pt-2 font-medium">
            <span>{copy.form.grossLabel}</span>
            <span className="font-mono tabular-nums">
              {formatAccountingVND(totalAmount)}
            </span>
          </div>
        </NoteCallout>
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
        />
      </div>
    </>
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
  const isTouchLayout = useIsMobile(1024);
  const showOnlyNeedsAction = stateFilter === "pending";
  const visibleRows = useMemo(
    () => (showOnlyNeedsAction ? rows.filter(expenseNeedsAction) : rows),
    [rows, showOnlyNeedsAction],
  );
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<ExpenseRow | null>(null);
  const [selectedExpenseId, setSelectedExpenseId] = useState<number | null>(
    null,
  );
  const [isMutating, startMutation] = useTransition();

  const branchNames = new Map(branches.map((b) => [b.id, b.name]));
  const branchLabel = (branchId: number | null) =>
    branchId != null
      ? (branchNames.get(branchId) ?? `#${branchId}`)
      : copy.tenantLevel;

  const selectedExpense =
    selectedExpenseId == null
      ? null
      : (rows.find((row) => row.id === selectedExpenseId) ?? null);

  function openDetail(row: ExpenseRow) {
    setSelectedExpenseId(row.id);
  }

  function closeDetail() {
    setSelectedExpenseId(null);
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
    ? {
        expenseDate: editingExpense.expense_date,
        branchId:
          editingExpense.branch_id == null
            ? TENANT_LEVEL_BRANCH_VALUE
            : String(editingExpense.branch_id),
        category: editingExpense.category,
        paymentMethod: expensePaymentMethod(
          editingExpense,
        ) as ExpensePaymentMethod,
        note: editingExpense.note ?? "",
        invoiceAttachmentUrl: editingExpense.invoice_attachment_url ?? "",
        lines: editingExpense.vat_breakdown.map((line) => ({
          totalAmount: addMoney([
            String(line.taxableAmount),
            String(line.vatAmount),
          ]),
          vatRate: String(
            line.vatRate,
          ) as ExpenseFormValues["lines"][number]["vatRate"],
          vatAmount: minorUnitsToCanonical(
            parseMoneyToMinorUnits(String(line.vatAmount)),
          ),
        })),
      }
    : defaultValues;

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
    toast.success(
      editingExpense ? copy.form.editSuccess : copy.form.success,
    );
  }

  function onEdit(row: ExpenseRow) {
    setEditingExpense(row);
    setDialogOpen(true);
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
      key: "amount",
      header: copy.table.amount,
      className: "text-right font-mono tabular-nums",
      render: (row) => formatAccountingVND(row.amount),
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
      <FilterBar
        params={params}
        branches={branches}
        basePath="/finance/expenses"
        hide={["compare", "granularity"]}
        branchLabel={copy.form.branch}
        branchPlaceholder={copy.form.branchTenantLevel}
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

      <AppSection
        title={copy.listTitle}
        action={
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
                onClick={() => setDialogOpen(true)}
              >
                <IconPlus data-icon="inline-start" />
                {copy.add}
              </Button>
            ) : null}
          </div>
        }
        contentFlush
        contentScroll
      >
        <DataTable
          columns={columns}
          data={visibleRows}
          pageSize={50}
          getRowKey={(row) => row.id}
          onRowClick={openDetail}
          getRowAriaLabel={(row) =>
            copy.detail.viewAria(categoryLabel(row.category))
          }
          getRowDataState={(row) =>
            row.id === selectedExpenseId ? "selected" : undefined
          }
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
                aria-label={copy.detail.viewAria(categoryLabel(row.category))}
                className="cursor-pointer"
                onClick={() => openDetail(row)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    openDetail(row);
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
                </ItemHeader>
                <ItemFooter className="items-end gap-2">
                  <ItemDescription className="min-w-0 flex-1">
                    {detail || "—"}
                  </ItemDescription>
                  <div className="flex shrink-0 items-center gap-2">
                    <span
                      className="shrink-0 whitespace-nowrap font-mono text-sm font-semibold tabular-nums"
                      title={formatAccountingVND(row.amount)}
                    >
                      {formatCompactVND(row.amount)}
                    </span>
                  </div>
                </ItemFooter>
              </Item>
            );
          }}
        />
      </AppSection>

      {canManageExpenses ? (
        <FormDialog
          open={dialogOpen}
          onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) setEditingExpense(null);
          }}
          title={editingExpense ? copy.form.editTitle : copy.form.title}
          schema={expenseFormSchema}
          defaultValues={formDefaultValues}
          entityKey={editingExpense?.id}
          onSubmit={onSubmit}
          onSuccess={onCreateSuccess}
          submitLabel={editingExpense ? copy.form.editSubmit : copy.form.submit}
          variant="document"
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
                editingPaymentMethod={
                  editingExpense != null && canEditPaymentMethod
                }
              />
            );
          }}
        </FormDialog>
      ) : null}

      <AppDialog
        open={selectedExpense != null}
        onOpenChange={(open) => {
          if (!open) closeDetail();
        }}
        title={
          selectedExpense ? (
            <div className="flex flex-wrap items-center gap-2">
              <span>{categoryLabel(selectedExpense.category)}</span>
              <StatusBadge
                domain="expense-payment"
                value={classifyExpensePaymentState(selectedExpense)}
              />
            </div>
          ) : (
            copy.detail.title
          )
        }
        description={
          selectedExpense
            ? `${formatVNBusinessDate(selectedExpense.expense_date)} · ${branchLabel(selectedExpense.branch_id)} · ${methodLabel(selectedExpense)}`
            : undefined
        }
        variant="document"
        footer={
          <Button type="button" variant="outline" onClick={closeDetail}>
            {ACTIONS_VI.close}
          </Button>
        }
      >
        {selectedExpense ? (
          <>
            <DescriptionList
              className="sm:grid sm:grid-cols-2 sm:gap-4"
              items={[
                {
                  term: copy.table.amount,
                  description: (
                    <span className="font-mono tabular-nums font-semibold">
                      {formatAccountingVND(selectedExpense.amount)}
                    </span>
                  ),
                },
                {
                  term: copy.detail.subtotal,
                  description: (
                    <span className="font-mono tabular-nums">
                      {formatAccountingVND(selectedExpense.subtotal)}
                    </span>
                  ),
                },
                {
                  term: copy.table.vat,
                  description: (
                    <span className="font-mono tabular-nums">
                      {formatAccountingVND(selectedExpense.vat_amount)}
                    </span>
                  ),
                },
                {
                  term: copy.detail.vendor,
                  description:
                    selectedExpense.vendor_name?.trim() ||
                    copy.detail.emptyValue,
                },
                {
                  term: copy.form.note,
                  description:
                    selectedExpense.note?.trim() || copy.detail.emptyValue,
                },
                {
                  term: copy.table.attachment,
                  description: selectedExpense.invoice_attachment_url ? (
                    <a
                      href={selectedExpense.invoice_attachment_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
                    >
                      <IconExternalLink className="size-3.5" aria-hidden />
                      {copy.table.attachmentOpen}
                    </a>
                  ) : (
                    copy.detail.attachmentMissing
                  ),
                },
              ]}
            />

            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium">{copy.detail.vatBreakdown}</p>
              <NoteCallout tone="muted">
                {selectedExpense.vat_breakdown.map((line) => (
                  <div
                    key={line.vatRate}
                    className="mb-2 flex items-center justify-between gap-3 last:mb-0"
                  >
                    <span className="text-muted-foreground">
                      {copy.detail.vatLine(
                        formatPercent(line.vatRate, 0),
                        formatAccountingVND(line.taxableAmount),
                        formatAccountingVND(line.vatAmount),
                      )}
                    </span>
                  </div>
                ))}
              </NoteCallout>
            </div>

            {selectedExpense.transfer_content ? (
              <div className="flex flex-col gap-2">
                <p className="text-sm font-medium">
                  {copy.detail.transferContent}
                </p>
                <Item
                  variant="muted"
                  className="flex-col items-stretch gap-3 p-4"
                >
                  <code className="block break-all font-mono text-base font-semibold tabular-nums tracking-wide">
                    {selectedExpense.transfer_content}
                  </code>
                  <Button
                    size={isTouchLayout ? "touch" : "default"}
                    variant="outline"
                    className="w-full"
                    onClick={() =>
                      void copyTransferContent(
                        selectedExpense.transfer_content!,
                      )
                    }
                  >
                    <IconCopy data-icon="inline-start" />
                    {copy.transferInstruction.copy}
                  </Button>
                </Item>
              </div>
            ) : null}
          </>
        ) : null}
      </AppDialog>
    </>
  );
}
