"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { Plus as IconPlus, Trash2 as IconTrash } from "lucide-react";
import { formatVND } from "@comtammatu/shared/format";
import { Button } from "@comtammatu/ui/components/button";
import { Card, CardContent } from "@comtammatu/ui/components/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@comtammatu/ui/components/table";
import { confirm } from "@comtammatu/ui/components/confirm-dialog";
import { toast } from "@comtammatu/ui/components/sonner";
import type { ActionResult } from "@comtammatu/shared/types";
import { KpiCard } from "@/components/kpi/kpi-card";
import { TableEmptyStateRow } from "@/components/table-empty-state-row";
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
  EXPENSE_CATEGORY_VALUES,
  EXPENSE_PAYMENT_METHODS,
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

interface Branch {
  id: number;
  name: string;
}

interface Props {
  params: FinanceParams;
  branches: Branch[];
  rows: ExpenseRow[];
  totalAmount: number;
  resolvedStart: string;
  resolvedEnd: string;
  todayBusinessDate: string;
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

const CATEGORY_OPTIONS = EXPENSE_CATEGORY_VALUES.map((value) => ({
  value,
  label: copy.categoryLabels[value],
}));

const METHOD_OPTIONS = EXPENSE_PAYMENT_METHODS.map((value) => ({
  value,
  label: copy.paymentMethodLabels[value],
}));

export function ExpensesClient({
  params,
  branches,
  rows,
  totalAmount,
  resolvedStart,
  resolvedEnd,
  todayBusinessDate,
}: Props) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isDeleting, startDelete] = useTransition();

  const branchNames = new Map(branches.map((b) => [b.id, b.name]));

  const branchOptions = [
    { value: "", label: copy.form.branchTenantLevel },
    ...branches.map((b) => ({ value: String(b.id), label: b.name })),
  ];

  const defaultValues: ExpenseFormValues = {
    expenseDate: todayBusinessDate,
    branchId: params.branch != null ? String(params.branch) : "",
    category: "",
    amount: "",
    paymentMethod: "cash",
    vendorName: "",
    note: "",
  };

  async function onSubmit(values: ExpenseFormValues): Promise<ActionResult> {
    const result = await createExpense({
      branchId: values.branchId ? Number(values.branchId) : null,
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

  return (
    <div className="space-y-4">
      <FilterBar
        params={params}
        branches={branches}
        basePath="/finance/expenses"
        hide={["compare", "payment", "granularity"]}
      />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <KpiCard
          label={copy.totalLabel}
          value={formatVND(totalAmount)}
          hint={`${copy.totalHint(String(rows.length))} · ${resolvedStart} → ${resolvedEnd}`}
          tone="primary"
        />
        <Button onClick={() => setDialogOpen(true)}>
          <IconPlus data-icon="inline-start" />
          {copy.add}
        </Button>
      </div>

      <Card className="overflow-hidden">
        <CardContent scroll>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-28">{copy.table.date}</TableHead>
                <TableHead>{copy.table.category}</TableHead>
                <TableHead>{copy.table.branch}</TableHead>
                <TableHead>{copy.table.method}</TableHead>
                <TableHead className="text-right">{copy.table.amount}</TableHead>
                <TableHead>{copy.table.detail}</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableEmptyStateRow
                  colSpan={7}
                  mode="no-data"
                  title={copy.empty.title}
                  description={copy.empty.description}
                />
              ) : (
                rows.map((row) => {
                  const detail = [row.vendor_name, row.note]
                    .filter(Boolean)
                    .join(" · ");
                  return (
                    <TableRow key={row.id}>
                      <TableCell className="font-mono tabular-nums">
                        {row.expense_date}
                      </TableCell>
                      <TableCell>
                        {copy.categoryLabels[row.category as ExpenseCategory] ??
                          row.category}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {row.branch_id != null
                          ? (branchNames.get(row.branch_id) ??
                            `#${row.branch_id}`)
                          : copy.tenantLevel}
                      </TableCell>
                      <TableCell>
                        {copy.paymentMethodLabels[
                          row.payment_method as ExpensePaymentMethod
                        ] ?? row.payment_method}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {formatVND(row.amount)}
                      </TableCell>
                      <TableCell className="max-w-48 truncate text-muted-foreground">
                        {detail || "—"}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onDelete(row)}
                          disabled={isDeleting}
                          aria-label={copy.table.delete}
                        >
                          <IconTrash className="size-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

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
              options={CATEGORY_OPTIONS}
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
    </div>
  );
}
