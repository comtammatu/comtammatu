"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { formatDecimal, formatVND } from "@comtammatu/shared/format";
import type { ActionResult } from "@comtammatu/shared/types";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { confirm } from "@comtammatu/ui/components/confirm-dialog";
import { Input } from "@comtammatu/ui/components/input";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { toast } from "@comtammatu/ui/components/sonner";
import { Pencil as IconPencil, Trash2 as IconTrash } from "lucide-react";
import {
  FormDialog,
  MoneyVndField,
  SelectField,
  TextareaField,
} from "@/components/form";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import { AppSection, AppToolbar } from "@/components/surface";
import { messages } from "@lib/messages";
import {
  removePayrollAdjustment,
  savePayrollAdjustment,
  snapshotPayrollPreview,
  type PayrollAdjustment,
  type PayrollAdjustmentKind,
  type PayrollPreview,
  type PayrollPreviewEntry,
} from "../payroll-actions";

const copy = messages.hr.payroll.live;
const ALL_BRANCHES = "all";
const ALL_SALARY_STATUSES = "all";
const CALCULABLE_SALARY_STATUS = "calculable";
const MISSING_SALARY_STATUS = "missing";

type SalaryStatusFilter =
  | typeof ALL_SALARY_STATUSES
  | typeof CALCULABLE_SALARY_STATUS
  | typeof MISSING_SALARY_STATUS;

const adjustmentSchema = z.object({
  kind: z.enum([
    "bonus",
    "taxable_allowance",
    "tax_exempt_allowance",
    "advance",
    "deduction",
  ]),
  amount: z
    .string()
    .min(1, { error: copy.adjustmentFields.amountRequired })
    .refine((value) => Number(value) > 0, {
      error: copy.adjustmentFields.amountPositive,
    }),
  note: z.string().trim().max(500).optional(),
});

type AdjustmentFormValues = z.infer<typeof adjustmentSchema>;

type BranchOption = { id: number; name: string };

interface Props {
  preview: PayrollPreview;
  branches: BranchOption[];
  query: string;
  selectedBranchId: number | null;
}

function monthValue(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function adjustmentLabel(adjustment: PayrollAdjustment): string {
  return copy.adjustmentKinds[adjustment.kind];
}

function adjustmentSummary(entry: PayrollPreviewEntry): string {
  if (!canCalculate(entry)) return "—";
  const finalized = entry.finalized;
  const additions =
    (finalized?.bonus ?? entry.bonus) +
    (finalized?.taxableAllowances ?? entry.taxableAllowances) +
    (finalized?.taxExemptAllowances ?? entry.taxExemptAllowances);
  const deductions =
    (finalized?.advanceDeduction ?? entry.advanceDeduction) +
    (finalized?.otherDeductions ?? entry.otherDeductions);
  if (additions === 0 && deductions === 0) return "—";
  return [
    additions > 0 ? `+${formatVND(additions)}` : null,
    deductions > 0 ? `−${formatVND(deductions)}` : null,
  ]
    .filter(Boolean)
    .join(" ");
}

function workSummary(entry: PayrollPreviewEntry): string {
  const finalized = entry.finalized;
  return copy.mobile.work(
    finalized?.workingDays ?? entry.workingDays,
    finalized?.paidLeaveDays ?? entry.paidLeaveDays,
    finalized?.unpaidLeaveDays ?? entry.unpaidLeaveDays,
  );
}

function grossValue(entry: PayrollPreviewEntry): number {
  return entry.finalized?.grossTotal ?? entry.grossTotal;
}

function deductionValue(entry: PayrollPreviewEntry): number {
  const finalized = entry.finalized;
  return (
    (finalized?.totalInsuranceEmployee ?? entry.totalInsuranceEmployee) +
    (finalized?.pitTax ?? entry.pitTax)
  );
}

function netValue(entry: PayrollPreviewEntry): number {
  return entry.finalized?.netSalary ?? entry.expectedNet;
}

function canCalculate(entry: PayrollPreviewEntry): boolean {
  return entry.finalized != null || entry.salarySource !== "missing";
}

function decimalCell(value: number): string {
  return formatDecimal(value, 1);
}

function moneyCell(entry: PayrollPreviewEntry, value: number): string {
  return canCalculate(entry) ? formatVND(value) : "—";
}

export function PayrollListClient({
  preview,
  branches,
  query,
  selectedBranchId,
}: Props) {
  const router = useRouter();
  const [search, setSearch] = useState(query);
  const [salaryStatus, setSalaryStatus] =
    useState<SalaryStatusFilter>(ALL_SALARY_STATUSES);
  const [standardDays, setStandardDays] = useState(
    String(preview.standardDays),
  );
  const [selectedEntry, setSelectedEntry] =
    useState<PayrollPreviewEntry | null>(null);
  const [editingAdjustment, setEditingAdjustment] =
    useState<PayrollAdjustment | null>(null);
  const [isSnapshotting, startSnapshot] = useTransition();

  useEffect(() => setSearch(query), [query]);
  useEffect(
    () => setStandardDays(String(preview.standardDays)),
    [preview.standardDays],
  );

  const rows = useMemo(() => {
    const normalized = search.trim().toLocaleLowerCase("vi-VN");
    return preview.entries.filter((entry) => {
      const matchesStatus =
        salaryStatus === ALL_SALARY_STATUSES ||
        (salaryStatus === CALCULABLE_SALARY_STATUS && canCalculate(entry)) ||
        (salaryStatus === MISSING_SALARY_STATUS && !canCalculate(entry));
      const matchesSearch =
        !normalized ||
        [
          entry.employeeName,
          entry.employeeCode,
          entry.branchName,
          entry.positionLabel,
        ]
          .filter(Boolean)
          .some((value) =>
            value!.toLocaleLowerCase("vi-VN").includes(normalized),
          );
      return matchesStatus && matchesSearch;
    });
  }, [preview.entries, salaryStatus, search]);

  const calculableRows = rows.filter(canCalculate);
  const totalNet = calculableRows.reduce(
    (total, entry) => total + netValue(entry),
    0,
  );
  const isLocked =
    preview.snapshot?.status === "approved" ||
    preview.snapshot?.status === "paid";
  const netHeader = isLocked ? copy.table.finalizedNet : copy.table.net;

  const adjustmentDefaults: AdjustmentFormValues = {
    kind: editingAdjustment?.kind ?? "bonus",
    amount: editingAdjustment ? String(editingAdjustment.amount) : "",
    note: editingAdjustment?.note ?? "",
  };

  function replaceFilters(nextValues: {
    month?: string;
    branchId?: number | null;
    standardDays?: string;
  }) {
    const params = new URLSearchParams();
    params.set(
      "month",
      nextValues.month ?? monthValue(preview.year, preview.month),
    );
    params.set(
      "standardDays",
      nextValues.standardDays ?? String(preview.standardDays),
    );
    const branchId =
      nextValues.branchId === undefined
        ? selectedBranchId
        : nextValues.branchId;
    if (branchId != null) params.set("branch", String(branchId));
    const nextQuery = search;
    if (nextQuery.trim()) params.set("q", nextQuery.trim());
    router.replace(`/hr/payroll?${params.toString()}`);
  }

  function updateStandardDays() {
    const parsed = Number(standardDays);
    if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 31) {
      setStandardDays(String(preview.standardDays));
      return;
    }
    replaceFilters({ standardDays: String(parsed) });
  }

  function openAdjustment(entry: PayrollPreviewEntry) {
    setEditingAdjustment(null);
    setSelectedEntry(entry);
  }

  async function submitAdjustment(
    values: AdjustmentFormValues,
  ): Promise<ActionResult> {
    if (!selectedEntry) {
      return { success: false, error: copy.adjustmentTargetMissing };
    }
    const result = await savePayrollAdjustment({
      adjustmentId: editingAdjustment?.id,
      employeeId: selectedEntry.employeeId,
      month: preview.month,
      year: preview.year,
      kind: values.kind,
      amount: Number(values.amount),
      note: values.note || undefined,
    });
    if (result.success) router.refresh();
    return result;
  }

  async function deleteAdjustment(adjustment: PayrollAdjustment) {
    const approved = await confirm({
      title: copy.adjustmentDeleteTitle,
      description: copy.adjustmentDeleteDescription,
      confirmText: copy.adjustmentDelete,
      cancelText: copy.cancel,
      variant: "destructive",
    });
    if (!approved) return;
    const result = await removePayrollAdjustment({
      adjustmentId: adjustment.id,
    });
    if (result.success) {
      toast.success(copy.adjustmentDeleted);
      setEditingAdjustment(null);
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  async function confirmSnapshot() {
    const approved = await confirm({
      title: copy.snapshot,
      description: copy.snapshotConfirmDescription,
      confirmText: copy.snapshot,
      cancelText: copy.cancel,
    });
    if (!approved) return;
    startSnapshot(async () => {
      const result = await snapshotPayrollPreview({
        month: preview.month,
        year: preview.year,
        standardDays: preview.standardDays,
        branchId: selectedBranchId,
      });
      if (result.success) {
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  const columns: DataTableColumn<PayrollPreviewEntry>[] = [
    {
      key: "employee",
      header: copy.table.employee,
      render: (entry) => (
        <div className="min-w-44 max-w-72 overflow-hidden">
          <p className="truncate font-medium">{entry.employeeName}</p>
          <p className="truncate text-xs text-muted-foreground">
            {[entry.employeeCode, entry.positionLabel, entry.branchName]
              .filter(Boolean)
              .join(" · ") || "—"}
          </p>
        </div>
      ),
    },
    {
      key: "working-days",
      header: copy.table.workingDays,
      className: "w-20 text-right font-mono text-sm tabular-nums",
      render: (entry) =>
        decimalCell(entry.finalized?.workingDays ?? entry.workingDays),
    },
    {
      key: "paid-leave-days",
      header: copy.table.paidLeaveDays,
      className: "w-20 text-right font-mono text-sm tabular-nums",
      render: (entry) =>
        decimalCell(entry.finalized?.paidLeaveDays ?? entry.paidLeaveDays),
    },
    {
      key: "unpaid-leave-days",
      header: copy.table.unpaidLeaveDays,
      className: "min-w-24 text-right font-mono text-sm tabular-nums",
      render: (entry) =>
        decimalCell(entry.finalized?.unpaidLeaveDays ?? entry.unpaidLeaveDays),
    },
    {
      key: "adjustments",
      header: copy.table.adjustments,
      className: "min-w-32 text-right font-mono text-sm tabular-nums",
      render: adjustmentSummary,
    },
    {
      key: "gross",
      header: copy.table.gross,
      className: "min-w-32 text-right font-mono text-sm tabular-nums",
      render: (entry) => moneyCell(entry, grossValue(entry)),
    },
    {
      key: "deductions",
      header: copy.table.deductions,
      className: "min-w-32 text-right font-mono text-sm tabular-nums",
      render: (entry) => moneyCell(entry, deductionValue(entry)),
    },
    {
      key: "net",
      header: netHeader,
      className:
        "min-w-32 text-right font-mono text-sm font-semibold tabular-nums",
      render: (entry) => moneyCell(entry, netValue(entry)),
    },
    {
      key: "status",
      header: copy.table.status,
      className: "min-w-32",
      render: (entry) => (
        <Badge
          variant={
            !canCalculate(entry)
              ? "destructive"
              : isLocked
                ? "secondary"
                : "success"
          }
        >
          {!canCalculate(entry)
            ? copy.table.missingSalary
            : isLocked
              ? copy.table.finalized
              : copy.table.calculable}
        </Badge>
      ),
    },
    ...(!isLocked
      ? [
          {
            key: "actions",
            header: copy.table.actions,
            className: "w-32 text-right",
            render: (entry: PayrollPreviewEntry) =>
              canCalculate(entry) ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => openAdjustment(entry)}
                >
                  <IconPencil data-icon="inline-start" />
                  {copy.adjustment}
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => router.push("/hr")}
                >
                  {copy.missingSalaryAction}
                </Button>
              ),
          },
        ]
      : []),
  ];

  return (
    <>
      <AppToolbar
        search={
          <Input
            value={search}
            onChange={(event) => {
              const value = event.target.value;
              setSearch(value);
            }}
            placeholder={copy.search}
            aria-label={copy.search}
          />
        }
        filters={
          <>
            <Input
              type="month"
              value={monthValue(preview.year, preview.month)}
              onChange={(event) =>
                replaceFilters({ month: event.target.value })
              }
              aria-label={copy.month}
            />
            <Select
              value={
                selectedBranchId != null
                  ? String(selectedBranchId)
                  : ALL_BRANCHES
              }
              onValueChange={(value) =>
                replaceFilters({
                  branchId: value === ALL_BRANCHES ? null : Number(value),
                })
              }
            >
              <SelectTrigger className="min-w-44" aria-label={copy.branch}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_BRANCHES}>{copy.allBranches}</SelectItem>
                {branches.map((branch) => (
                  <SelectItem key={branch.id} value={String(branch.id)}>
                    {branch.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={salaryStatus}
              onValueChange={(value) =>
                setSalaryStatus(value as SalaryStatusFilter)
              }
            >
              <SelectTrigger
                className="min-w-40"
                aria-label={copy.salaryStatus}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_SALARY_STATUSES}>
                  {copy.salaryStatusAll}
                </SelectItem>
                <SelectItem value={CALCULABLE_SALARY_STATUS}>
                  {copy.salaryStatusCalculable}
                </SelectItem>
                <SelectItem value={MISSING_SALARY_STATUS}>
                  {copy.salaryStatusMissing}
                </SelectItem>
              </SelectContent>
            </Select>
            <Input
              value={standardDays}
              onChange={(event) => setStandardDays(event.target.value)}
              onBlur={updateStandardDays}
              onKeyDown={(event) => {
                if (event.key === "Enter") updateStandardDays();
              }}
              inputMode="decimal"
              className="w-28 text-right font-mono tabular-nums"
              aria-label={copy.standardDays}
              title={copy.standardDays}
            />
          </>
        }
        actions={
          <Button
            onClick={() => void confirmSnapshot()}
            disabled={!preview.canSnapshot || isSnapshotting}
          >
            {isSnapshotting ? copy.snapshotting : copy.snapshot}
          </Button>
        }
      />

      {preview.missingSalaryEmployeeIds.length > 0 ? (
        <AppSection
          tone="warning"
          title={copy.missingSalaryTitle}
          description={copy.missingSalaryDescription(
            preview.missingSalaryEmployeeIds.length,
          )}
        >
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSalaryStatus(MISSING_SALARY_STATUS)}
          >
            {copy.missingSalaryListAction}
          </Button>
        </AppSection>
      ) : null}

      <AppSection
        title={copy.periodName(preview.month, preview.year)}
        description={
          isLocked
            ? copy.snapshotDescription
            : selectedBranchId != null
              ? copy.snapshotAllBranchesRequired
              : copy.description
        }
        headerHint={isLocked ? copy.snapshotLocked : copy.snapshotOpen}
        contentFlush
        contentScroll
      >
        <DataTable
          columns={columns}
          data={rows}
          getRowKey={(entry) => entry.employeeId}
          emptyTitle={copy.table.empty}
          pageSize={25}
          desktopFooterRows={
            calculableRows.length > 0
              ? [
                  {
                    key: "total",
                    cells: [
                      {
                        key: "label",
                        content: copy.table.total(calculableRows.length),
                        colSpan: 7,
                        className: "font-medium",
                      },
                      {
                        key: "net",
                        content: formatVND(totalNet),
                        className:
                          "text-right font-mono font-semibold tabular-nums",
                      },
                      { key: "status", content: "" },
                      ...(!isLocked ? [{ key: "actions", content: "" }] : []),
                    ],
                  },
                ]
              : undefined
          }
          mobileFooter={
            calculableRows.length > 0 ? (
              <Item variant="muted">
                <ItemContent>
                  <ItemTitle>
                    {copy.table.total(calculableRows.length)}
                  </ItemTitle>
                </ItemContent>
                <span className="font-mono font-semibold tabular-nums">
                  {formatVND(totalNet)}
                </span>
              </Item>
            ) : null
          }
          mobileCardRender={(entry) => (
            <Item variant="outline">
              <ItemContent>
                <ItemTitle>{entry.employeeName}</ItemTitle>
                <ItemDescription>{workSummary(entry)}</ItemDescription>
                <ItemDescription>
                  {copy.table.adjustments}: {adjustmentSummary(entry)}
                </ItemDescription>
                <ItemDescription>
                  {copy.table.gross}: {moneyCell(entry, grossValue(entry))}
                </ItemDescription>
                <ItemDescription>
                  {copy.mobile.deductions}:{" "}
                  {moneyCell(entry, deductionValue(entry))}
                </ItemDescription>
              </ItemContent>
              <ItemActions className="items-end gap-2">
                {!isLocked ? (
                  canCalculate(entry) ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openAdjustment(entry)}
                    >
                      <IconPencil data-icon="inline-start" />
                      {copy.adjustment}
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => router.push("/hr")}
                    >
                      {copy.missingSalaryAction}
                    </Button>
                  )
                ) : null}
                <span className="flex flex-col items-end gap-1">
                  <Badge
                    variant={
                      !canCalculate(entry)
                        ? "destructive"
                        : isLocked
                          ? "secondary"
                          : "success"
                    }
                  >
                    {!canCalculate(entry)
                      ? copy.table.missingSalary
                      : isLocked
                        ? copy.table.finalized
                        : copy.table.calculable}
                  </Badge>
                  <span className="text-2xs text-muted-foreground">
                    {netHeader}
                  </span>
                  <span className="font-mono text-sm font-semibold tabular-nums">
                    {moneyCell(entry, netValue(entry))}
                  </span>
                </span>
              </ItemActions>
            </Item>
          )}
        />
      </AppSection>

      {selectedEntry ? (
        <FormDialog
          open={selectedEntry != null}
          onOpenChange={(open) => {
            if (!open) {
              setSelectedEntry(null);
              setEditingAdjustment(null);
            }
          }}
          title={copy.adjustmentTitle(selectedEntry.employeeName)}
          description={copy.adjustmentDescription}
          schema={adjustmentSchema}
          defaultValues={adjustmentDefaults}
          entityKey={editingAdjustment?.id ?? selectedEntry.employeeId}
          onSubmit={submitAdjustment}
          onSuccess={() => {
            toast.success(copy.adjustmentSaved);
            router.refresh();
          }}
          submitLabel={copy.adjustmentSave}
        >
          {(form) => (
            <>
              <SelectField
                control={form.control}
                name="kind"
                label={copy.adjustmentFields.kind}
                options={(
                  Object.keys(copy.adjustmentKinds) as PayrollAdjustmentKind[]
                ).map((kind) => ({
                  value: kind,
                  label: copy.adjustmentKinds[kind],
                }))}
                required
              />
              <MoneyVndField
                control={form.control}
                name="amount"
                label={copy.adjustmentFields.amount}
                required
              />
              <TextareaField
                control={form.control}
                name="note"
                label={copy.adjustmentFields.note}
                placeholder={copy.adjustmentFields.notePlaceholder}
              />
              {selectedEntry.adjustments.length > 0 ? (
                <div className="flex flex-col gap-2 border-t pt-4">
                  {selectedEntry.adjustments.map((adjustment) => (
                    <Item key={adjustment.id} variant="muted">
                      <ItemContent>
                        <ItemTitle>{adjustmentLabel(adjustment)}</ItemTitle>
                        <ItemDescription className="line-clamp-2">
                          {adjustment.note || "—"}
                        </ItemDescription>
                      </ItemContent>
                      <ItemActions>
                        <span className="font-mono text-sm font-medium tabular-nums">
                          {formatVND(adjustment.amount)}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => setEditingAdjustment(adjustment)}
                          aria-label={copy.adjustment}
                        >
                          <IconPencil />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => void deleteAdjustment(adjustment)}
                          aria-label={copy.adjustmentDelete}
                        >
                          <IconTrash />
                        </Button>
                      </ItemActions>
                    </Item>
                  ))}
                </div>
              ) : null}
            </>
          )}
        </FormDialog>
      ) : null}
    </>
  );
}
