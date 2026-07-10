"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { Plus as IconPlus, Trash2 as IconTrash } from "lucide-react";
import { formatVND } from "@comtammatu/shared/format";
import { formatVNBusinessDate } from "@comtammatu/shared/time";
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
import type { ActionResult } from "@comtammatu/shared/types";
import { KpiCard } from "@/components/kpi/kpi-card";
import { StatusBadge } from "@/components/status-badge";
import { AppSection, KpiRow } from "@/components/surface";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import {
  BusinessDateField,
  FormDialog,
  MoneyVndField,
  SelectField,
  TextField,
  TextareaField,
} from "@/components/form";
import { messages } from "@lib/messages";
import { FilterBar } from "../components/filter-bar";
import {
  EXPENSE_CATEGORIES_BY_GROUP,
  EXPENSE_CATEGORY_GROUP,
  EXPENSE_CATEGORY_GROUPS,
  EXPENSE_PAYMENT_METHODS,
  classifyExpensePaymentState,
  type ExpenseCategory,
  type ExpensePaymentMethod,
} from "../_lib/expense-categories";
import type { FinanceParams } from "../_lib/finance-params";
import {
  createExpense,
  deleteExpense,
  type ExpenseRow,
} from "../expense-actions";

const copy = messages.finance.expenses;
const TENANT_LEVEL_BRANCH_VALUE = "__tenant__";
interface Branch {
  id: number;
  name: string;
}

interface Props {
  params: FinanceParams;
  branches: Branch[];
  rows: ExpenseRow[];
  totalAmount: number;
  actualFoodCost: number;
  resolvedStart: string;
  resolvedEnd: string;
  todayBusinessDate: string;
  canManageExpenses: boolean;
}

const expenseFormSchema = z.object({
  expenseDate: z.string().min(1, { error: "Chọn ngày chi" }),
  branchId: z.string(),
  category: z.string().min(1, { error: "Chọn khoản mục" }),
  amount: z
    .string()
    .min(1, { error: "Nhập số tiền" })
    .refine((v) => Number(v) > 0, { error: "Số tiền phải lớn hơn 0" }),
  paymentMethod: z.string().min(1, { error: "Chọn phương thức" }),
  vendorName: z.string().trim().max(200).optional(),
  note: z.string().trim().max(500).optional(),
});

type ExpenseFormValues = z.infer<typeof expenseFormSchema>;

const EXPENSE_FORM_CATEGORY_GROUPS = EXPENSE_CATEGORY_GROUPS.filter(
  (group) => group !== "materials",
);

const CATEGORY_GROUPS = EXPENSE_FORM_CATEGORY_GROUPS.map((group) => ({
  label: copy.categoryGroupLabels[group],
  options: EXPENSE_CATEGORIES_BY_GROUP[group].map((value) => ({
    value,
    label: copy.categoryLabels[value],
  })),
}));

const METHOD_OPTIONS = EXPENSE_PAYMENT_METHODS.map((value) => ({
  value,
  label: copy.paymentMethodLabels[value],
}));

function expenseDetail(row: ExpenseRow): string {
  return [row.vendor_name, row.note].filter(Boolean).join(" · ");
}

export function ExpensesClient({
  params,
  branches,
  rows,
  totalAmount,
  actualFoodCost,
  resolvedStart,
  resolvedEnd,
  todayBusinessDate,
  canManageExpenses,
}: Props) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isDeleting, startDelete] = useTransition();

  const branchNames = new Map(branches.map((b) => [b.id, b.name]));
  const branchLabel = (branchId: number | null) =>
    branchId != null
      ? (branchNames.get(branchId) ?? `#${branchId}`)
      : copy.tenantLevel;

  const branchOptions = [
    { value: TENANT_LEVEL_BRANCH_VALUE, label: copy.form.branchTenantLevel },
    ...branches.map((b) => ({ value: String(b.id), label: b.name })),
  ];

  // "Giá vốn món" (materials group) is read-only from actual consumption, not
  // manual expense rows — it mirrors the finance cockpit and stays out of the
  // expense total / operating expense to avoid double-counting against gross profit.
  const materialsGroup = EXPENSE_CATEGORY_GROUP.cogs_manual;
  const groupSummary = EXPENSE_CATEGORY_GROUPS.map((group) => {
    const fromConsumption = group === materialsGroup;
    const groupRows = rows.filter(
      (r) => EXPENSE_CATEGORY_GROUP[r.category as ExpenseCategory] === group,
    );
    return {
      group,
      label: copy.categoryGroupLabels[group],
      total: fromConsumption
        ? actualFoodCost
        : groupRows.reduce((sum, r) => sum + r.amount, 0),
      hint: fromConsumption
        ? copy.foodCostReadonlyHint
        : copy.totalHint(String(groupRows.length)),
    };
  });

  const defaultValues: ExpenseFormValues = {
    expenseDate: todayBusinessDate,
    branchId:
      params.branch != null ? String(params.branch) : TENANT_LEVEL_BRANCH_VALUE,
    category: "",
    amount: "",
    paymentMethod: "cash",
    vendorName: "",
    note: "",
  };

  async function onSubmit(values: ExpenseFormValues): Promise<ActionResult> {
    const branchId =
      !values.branchId || values.branchId === TENANT_LEVEL_BRANCH_VALUE
        ? null
        : Number(values.branchId);

    const result = await createExpense({
      branchId,
      expenseDate: values.expenseDate,
      category: values.category as ExpenseCategory,
      amount: Number(values.amount),
      paymentMethod: values.paymentMethod as ExpensePaymentMethod,
      vendorName: values.vendorName || undefined,
      note: values.note || undefined,
    });
    if (result.success) {
      router.refresh();
    }
    return result;
  }

  async function onDelete(row: ExpenseRow) {
    const ok = await confirm({
      title: copy.table.deleteTitle,
      description: copy.table.deleteConfirm(formatVND(row.amount)),
      confirmText: copy.table.deleteCta,
      cancelText: copy.table.deleteCancel,
      variant: "destructive",
    });
    if (!ok) return;
    startDelete(async () => {
      const result = await deleteExpense({ expenseId: row.id });
      if (result.success) {
        toast.success(copy.table.deleteSuccess);
        router.refresh();
      } else {
        toast.error(result.error ?? copy.table.deleteFailed);
      }
    });
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
      render: (row) =>
        (copy.categoryLabels as Record<string, string>)[row.category] ??
        row.category,
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
      render: (row) =>
        (copy.paymentMethodLabels as Record<string, string>)[
          row.payment_method
        ] ?? row.payment_method,
    },
    {
      key: "payment_state",
      header: copy.table.paymentState,
      className: "w-32",
      render: (row) => (
        <StatusBadge
          domain="expense-payment"
          value={classifyExpensePaymentState(row)}
        />
      ),
    },
    {
      key: "amount",
      header: copy.table.amount,
      className: "text-right font-mono tabular-nums",
      render: (row) => formatVND(row.amount),
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
            render: (row: ExpenseRow) => (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onDelete(row)}
                disabled={isDeleting}
                aria-label={copy.table.delete}
              >
                <IconTrash className="size-4 text-destructive" />
              </Button>
            ),
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
        hide={["compare", "payment", "granularity"]}
      />

      {canManageExpenses ? (
        <div className="flex items-center justify-end">
          <Button onClick={() => setDialogOpen(true)}>
            <IconPlus data-icon="inline-start" />
            {copy.add}
          </Button>
        </div>
      ) : null}

      <KpiRow density="compact" className="sm:grid-cols-3">
        <KpiCard
          label={copy.totalLabel}
          value={formatVND(totalAmount)}
          hint={`${copy.totalHint(String(rows.length))} · ${formatVNBusinessDate(resolvedStart)} → ${formatVNBusinessDate(resolvedEnd)}`}
          tone="primary"
        />
        {groupSummary.map((g) => (
          <KpiCard
            key={g.group}
            label={g.label}
            value={formatVND(g.total)}
            hint={g.hint}
          />
        ))}
      </KpiRow>

      <AppSection contentFlush contentScroll>
        <DataTable
          columns={columns}
          data={rows}
          getRowKey={(row) => row.id}
          emptyMode="no-data"
          emptyTitle={copy.empty.title}
          emptyDescription={copy.empty.description}
          mobileCardRender={(row) => {
            const detail = expenseDetail(row);
            return (
              <Item variant="outline">
                <ItemHeader>
                  <ItemContent>
                    <ItemTitle>
                      {(copy.categoryLabels as Record<string, string>)[
                        row.category
                      ] ?? row.category}
                    </ItemTitle>
                    <ItemDescription>
                      {formatVNBusinessDate(row.expense_date)} ·{" "}
                      {branchLabel(row.branch_id)}
                    </ItemDescription>
                  </ItemContent>
                  {canManageExpenses ? (
                    <ItemActions>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onDelete(row)}
                        disabled={isDeleting}
                        aria-label={copy.table.delete}
                      >
                        <IconTrash className="size-4 text-destructive" />
                      </Button>
                    </ItemActions>
                  ) : null}
                </ItemHeader>
                <ItemFooter>
                  <ItemDescription>{detail || "—"}</ItemDescription>
                  <div className="flex shrink-0 items-center gap-2">
                    <StatusBadge
                      domain="expense-payment"
                      value={classifyExpensePaymentState(row)}
                    />
                    <span className="font-mono text-sm font-semibold tabular-nums">
                      {formatVND(row.amount)}
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
          onOpenChange={setDialogOpen}
          title={copy.form.title}
          schema={expenseFormSchema}
          defaultValues={defaultValues}
          onSubmit={onSubmit}
          successMessage={copy.form.success}
          submitLabel={copy.form.submit}
        >
          {(form) => (
            <>
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
                groups={CATEGORY_GROUPS}
                placeholder={copy.form.categoryPlaceholder}
                required
              />
              <MoneyVndField
                control={form.control}
                name="amount"
                label={copy.form.amount}
                required
              />
              <SelectField
                control={form.control}
                name="paymentMethod"
                label={copy.form.method}
                options={METHOD_OPTIONS}
                placeholder={copy.form.methodPlaceholder}
                required
              />
              <TextField
                control={form.control}
                name="vendorName"
                label={copy.form.vendor}
                placeholder={copy.form.vendorPlaceholder}
              />
              <TextareaField
                control={form.control}
                name="note"
                label={copy.form.note}
                placeholder={copy.form.notePlaceholder}
              />
            </>
          )}
        </FormDialog>
      ) : null}
    </>
  );
}
