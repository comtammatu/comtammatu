"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import {
  Banknote as IconBanknote,
  Copy as IconCopy,
  ExternalLink as IconExternalLink,
  Landmark as IconLandmark,
  Plus as IconPlus,
  RotateCcw as IconRotateCcw,
  Trash2 as IconTrash,
} from "lucide-react";
import { formatCount, formatPercent, formatVND } from "@comtammatu/shared/format";
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
import {
  AppSection,
  DescriptionList,
  KpiRow,
} from "@/components/surface";
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
  TextField,
  TextareaField,
} from "@/components/form";
import { messages } from "@lib/messages";
import { FilterBar } from "../components/filter-bar";
import {
  EXPENSE_CATEGORIES_BY_GROUP,
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
  transitionExpensePayment,
  type ExpenseRow,
} from "../expense-actions";

const copy = messages.finance.expenses;
const TENANT_LEVEL_BRANCH_VALUE = "__tenant__";

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
  { error: FORM_VI.required },
);

interface Branch {
  id: number;
  name: string;
}

interface Props {
  params: FinanceParams;
  branches: Branch[];
  rows: ExpenseRow[];
  totalAmount: number;
  todayBusinessDate: string;
  canManageExpenses: boolean;
  tenantId: number;
}

const expenseFormSchema = z
  .object({
    expenseDate: z.string().min(1, { error: "Chọn ngày phát sinh" }),
    branchId: z.string(),
    category: z.string().min(1, { error: "Chọn khoản mục" }),
    paymentMethod: z.string().min(1, { error: "Chọn phương thức" }),
    vendorName: z.string().trim().max(200).optional(),
    note: z.string().trim().max(500).optional(),
    invoiceAttachmentUrl: z.string().optional(),
    vat0Taxable: optionalMoneySchema,
    vat5Taxable: optionalMoneySchema,
    vat5Amount: optionalMoneySchema,
    vat8Taxable: optionalMoneySchema,
    vat8Amount: optionalMoneySchema,
    vat10Taxable: optionalMoneySchema,
    vat10Amount: optionalMoneySchema,
  })
  .refine(
    (data) =>
      VAT_BUCKET_FIELDS.some(
        (bucket) => Number(data[bucket.taxableField] || 0) > 0,
      ),
    {
      error: FORM_VI.required,
      path: ["vat0Taxable"],
    },
  );

type ExpenseFormValues = z.infer<typeof expenseFormSchema>;

function buildExpenseVatBreakdown(values: ExpenseFormValues) {
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

const EXPENSE_FORM_CATEGORY_GROUPS = EXPENSE_CATEGORY_GROUPS.filter(
  (group) => group !== "materials" && group !== "transfer",
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
  label: copy.paymentChoiceLabels[value],
}));

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
  totalAmount,
  todayBusinessDate,
  canManageExpenses,
  tenantId,
}: Props) {
  const router = useRouter();
  const isTouchLayout = useIsMobile(1024);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedExpenseId, setSelectedExpenseId] = useState<number | null>(
    null,
  );
  const [transferInstruction, setTransferInstruction] = useState<string | null>(
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
    vendorName: "",
    note: "",
    invoiceAttachmentUrl: "",
    vat0Taxable: "",
    vat5Taxable: "",
    vat5Amount: "",
    vat8Taxable: "",
    vat8Amount: "",
    vat10Taxable: "",
    vat10Amount: "",
  };

  async function onSubmit(values: ExpenseFormValues): Promise<ActionResult> {
    const branchId =
      !values.branchId || values.branchId === TENANT_LEVEL_BRANCH_VALUE
        ? null
        : Number(values.branchId);
    const vatBreakdown = buildExpenseVatBreakdown(values);
    const attachment = values.invoiceAttachmentUrl?.trim();

    const result = await createExpense({
      branchId,
      expenseDate: values.expenseDate,
      category: values.category as ExpenseCategory,
      vatBreakdown,
      paymentMethod: values.paymentMethod as ExpensePaymentMethod,
      vendorName: values.vendorName || undefined,
      note: values.note || undefined,
      invoiceAttachmentUrl: attachment || undefined,
    });
    if (result.success) {
      router.refresh();
    }
    return result;
  }

  function onCreateSuccess(result: ActionResult) {
    const data = result.data as { transferContent?: string } | undefined;
    if (data?.transferContent) {
      setTransferInstruction(data.transferContent);
      toast.success(copy.transferInstruction.created);
    } else {
      toast.success(copy.form.success);
    }
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
      description: copy.table.deleteConfirm(formatVND(row.amount)),
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

      if (targetMethod === "transfer") {
        const transferContent = result.data?.transferContent;
        if (!transferContent) {
          toast.error(copy.transferInstruction.createFailed);
          return;
        }
        setTransferInstruction(transferContent);
        toast.success(copy.transferInstruction.created);
      } else if (targetMethod === "cash") {
        toast.success(copy.actions.cashSuccess);
      } else {
        toast.success(copy.actions.cancelTransferSuccess);
      }
      router.refresh();
    });
  }

  async function onPayCash(row: ExpenseRow) {
    const ok = await confirm({
      title: copy.actions.cashTitle,
      description: copy.actions.cashConfirm(formatVND(row.amount)),
      confirmText: copy.actions.cashCta,
      cancelText: copy.actions.keepUnpaid,
    });
    if (ok) runPaymentTransition(row, "cash");
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
          label: copy.actions.createTransfer,
          icon: <IconLandmark className="size-4" />,
          onSelect: () => runPaymentTransition(row, "transfer"),
          disabled: isMutating,
        },
        ...(canDeleteExpense(row)
          ? [
              {
                key: "delete",
                label: copy.table.delete,
                icon: <IconTrash className="size-4" />,
                onSelect: () => void onDelete(row),
                disabled: isMutating,
                destructive: true,
                separatorBefore: true,
              } satisfies RowActionItem,
            ]
          : []),
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
        {
          key: "cancel-transfer",
          label: copy.actions.cancelTransfer,
          icon: <IconRotateCcw className="size-4" />,
          onSelect: () => void onCancelTransfer(row),
          disabled: isMutating,
        },
      ];
    }

    return canDeleteExpense(row)
      ? [
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
      key: "vat",
      header: copy.table.vat,
      className: "text-right font-mono tabular-nums text-muted-foreground",
      render: (row) => formatVND(row.vat_amount),
    },
    {
      key: "attachment",
      header: copy.table.attachment,
      className: "w-24",
      render: (row) =>
        row.invoice_attachment_url ? (
          <a
            href={row.invoice_attachment_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm text-primary underline-offset-2 hover:underline"
            onClick={(event) => event.stopPropagation()}
          >
            <IconExternalLink className="size-3.5" aria-hidden />
            {copy.table.attachmentOpen}
          </a>
        ) : (
          "—"
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
      <FilterBar
        params={params}
        branches={branches}
        basePath="/finance/expenses"
        hide={["compare", "granularity"]}
      />

      <KpiRow density="compact">
        <KpiCard
          label={copy.totalLabel}
          value={formatVND(totalAmount)}
          hint={copy.totalHint(formatCount(rows.length))}
          tone="primary"
          density="compact"
        />
      </KpiRow>

      <AppSection
        title={copy.listTitle}
        action={
          canManageExpenses ? (
            <Button
              size={isTouchLayout ? "touch" : "default"}
              onClick={() => setDialogOpen(true)}
            >
              <IconPlus data-icon="inline-start" />
              {copy.add}
            </Button>
          ) : null
        }
        contentFlush
        contentScroll
      >
        <DataTable
          columns={columns}
          data={rows}
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
          emptyTitle={copy.empty.title}
          emptyDescription={copy.empty.description}
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
                {row.vat_amount > 0 || row.invoice_attachment_url ? (
                  <ItemDescription className="px-4 pb-3">
                    {row.vat_amount > 0
                      ? `${copy.table.vat}: ${formatVND(row.vat_amount)}`
                      : null}
                    {row.vat_amount > 0 && row.invoice_attachment_url
                      ? " · "
                      : null}
                    {row.invoice_attachment_url ? (
                      <a
                        href={row.invoice_attachment_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary underline-offset-2 hover:underline"
                        onClick={(event) => event.stopPropagation()}
                      >
                        {copy.table.attachmentOpen}
                      </a>
                    ) : null}
                  </ItemDescription>
                ) : null}
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
          onSuccess={onCreateSuccess}
          submitLabel={copy.form.submit}
          contentClassName="sm:max-w-xl"
        >
          {(form) => {
            const formValues = form.watch();
            const vatBreakdown = buildExpenseVatBreakdown(formValues);
            const subtotal = vatBreakdown.reduce(
              (sum, line) => sum + line.taxableAmount,
              0,
            );
            const vatAmount = vatBreakdown.reduce(
              (sum, line) => sum + line.vatAmount,
              0,
            );
            const totalAmount = subtotal + vatAmount;

            return (
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
                <SelectField
                  control={form.control}
                  name="paymentMethod"
                  label={copy.form.method}
                  options={METHOD_OPTIONS}
                  placeholder={copy.form.methodPlaceholder}
                  description={
                    copy.form.methodHints[
                      form.watch("paymentMethod") as ExpensePaymentMethod
                    ]
                  }
                  required
                />
                <div className="flex flex-col gap-2">
                  <p className="text-sm font-medium">{copy.form.vatSection}</p>
                  <p className="text-xs text-muted-foreground">
                    {copy.form.vatSectionHint}
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {VAT_BUCKET_FIELDS.map((bucket) => {
                      const rate = formatPercent(bucket.rate, 0);
                      return (
                        <div key={bucket.rate} className="contents">
                          <MoneyVndField
                            control={form.control}
                            name={bucket.taxableField}
                            label={copy.form.taxableAtRate(rate)}
                            placeholder={copy.form.taxablePlaceholder}
                          />
                          {bucket.vatField != null ? (
                            <MoneyVndField
                              control={form.control}
                              name={bucket.vatField}
                              label={copy.form.vatAtRate(rate)}
                              placeholder={copy.form.vatAutoPlaceholder}
                            />
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                  <NoteCallout tone="muted">
                    {vatBreakdown.map((line) => (
                      <div
                        key={line.vatRate}
                        className="mb-2 flex items-center justify-between gap-3"
                      >
                        <span className="text-muted-foreground">
                          {copy.form.vatBucketSummary(
                            formatPercent(line.vatRate, 0),
                            formatVND(line.taxableAmount),
                          )}
                        </span>
                        <span className="font-mono tabular-nums">
                          {formatVND(line.vatAmount)}
                        </span>
                      </div>
                    ))}
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">
                        {copy.form.subtotalLabel}
                      </span>
                      <span className="font-mono tabular-nums">
                        {formatVND(subtotal)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">
                        {copy.form.vatTotalLabel}
                      </span>
                      <span className="font-mono tabular-nums">
                        {formatVND(vatAmount)}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-3 border-t pt-2 font-medium">
                      <span>{copy.form.grossLabel}</span>
                      <span className="font-mono tabular-nums">
                        {formatVND(totalAmount)}
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
        contentClassName="sm:max-w-xl"
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
                      {formatVND(selectedExpense.amount)}
                    </span>
                  ),
                },
                {
                  term: copy.detail.subtotal,
                  description: (
                    <span className="font-mono tabular-nums">
                      {formatVND(selectedExpense.subtotal)}
                    </span>
                  ),
                },
                {
                  term: copy.table.vat,
                  description: (
                    <span className="font-mono tabular-nums">
                      {formatVND(selectedExpense.vat_amount)}
                    </span>
                  ),
                },
                {
                  term: copy.form.vendor,
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
                        formatVND(line.taxableAmount),
                        formatVND(line.vatAmount),
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
                <Item variant="muted" className="flex-col items-stretch gap-3 p-4">
                  <code className="block break-all font-mono text-base font-semibold tabular-nums tracking-wide">
                    {selectedExpense.transfer_content}
                  </code>
                  <Button
                    size={isTouchLayout ? "touch" : "default"}
                    variant="outline"
                    className="w-full"
                    onClick={() =>
                      void copyTransferContent(selectedExpense.transfer_content!)
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

      <AppDialog
        open={transferInstruction != null}
        onOpenChange={(open) => {
          if (!open) setTransferInstruction(null);
        }}
        title={copy.transferInstruction.title}
        description={copy.transferInstruction.description}
        footer={
          <Button
            variant="outline"
            size="touch"
            onClick={() => setTransferInstruction(null)}
          >
            {copy.transferInstruction.close}
          </Button>
        }
      >
        {transferInstruction ? (
          <Item variant="muted" className="flex-col items-stretch gap-3 p-4">
            <p className="text-sm font-medium text-muted-foreground">
              {copy.transferInstruction.codeLabel}
            </p>
            <code className="block break-all font-mono text-lg font-semibold tabular-nums tracking-wide">
              {transferInstruction}
            </code>
            <Button
              size="touch"
              className="w-full"
              onClick={() => void copyTransferContent(transferInstruction)}
            >
              <IconCopy data-icon="inline-start" />
              {copy.transferInstruction.copy}
            </Button>
          </Item>
        ) : null}
      </AppDialog>
    </>
  );
}
