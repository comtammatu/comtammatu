"use client";

import { useMemo, useState, useTransition } from "react";
import { Button } from "@comtammatu/ui/components/button";
import { Input } from "@comtammatu/ui/components/input";
import { toast } from "@comtammatu/ui/components/sonner";
import { formatVND } from "@comtammatu/shared/format";
import {
  AppEmptyState,
  AppListFrame,
  AppToolbar,
} from "@/components/surface";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import { messages } from "@lib/messages";
import {
  upsertBranchRevenueTargets,
  type BranchRevenueTargetRow,
} from "./actions";

const copy = messages.finance.revenueTargets;

type EditableRow = BranchRevenueTargetRow & { draft: string };

export function RevenueTargetsClient({
  yearMonth,
  initialRows,
}: {
  yearMonth: string;
  initialRows: BranchRevenueTargetRow[];
}) {
  const [rows, setRows] = useState<EditableRow[]>(() =>
    initialRows.map((row) => ({
      ...row,
      draft: row.targetAmount == null ? "" : String(Math.round(row.targetAmount)),
    })),
  );
  const [pending, startTransition] = useTransition();

  const columns = useMemo<DataTableColumn<EditableRow>[]>(
    () => [
      {
        key: "branch",
        header: copy.branch,
        render: (row) => row.branchName,
      },
      {
        key: "prior",
        header: copy.priorMonth,
        className: "text-right",
        render: (row) => (
          <span className="font-mono tabular-nums">
            {formatVND(row.priorMonthNetRevenue)}
          </span>
        ),
      },
      {
        key: "target",
        header: copy.target,
        className: "text-right",
        render: (row) => (
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            step={1000}
            className="ml-auto max-w-40 text-right font-mono tabular-nums"
            value={row.draft}
            disabled={pending}
            onChange={(event) => {
              const value = event.target.value;
              setRows((current) =>
                current.map((item) =>
                  item.branchId === row.branchId
                    ? { ...item, draft: value }
                    : item,
                ),
              );
            }}
            aria-label={`${copy.target} ${row.branchName}`}
          />
        ),
      },
    ],
    [pending],
  );

  function onSave() {
    const payload = rows
      .map((row) => {
        const amount = Number(row.draft.replace(/[,\s]/g, ""));
        if (!Number.isFinite(amount) || amount <= 0) return null;
        return { branch_id: row.branchId, target_amount: amount };
      })
      .filter(
        (row): row is { branch_id: number; target_amount: number } =>
          row != null,
      );

    if (payload.length === 0) {
      toast.error(copy.errors.invalidPayload);
      return;
    }

    startTransition(async () => {
      const result = await upsertBranchRevenueTargets({
        year_month: yearMonth,
        rows: payload,
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(copy.saved(String(result.data?.updated ?? payload.length)));
      setRows((current) =>
        current.map((row) => {
          const saved = payload.find((item) => item.branch_id === row.branchId);
          if (!saved) return row;
          return {
            ...row,
            targetAmount: saved.target_amount,
            draft: String(Math.round(saved.target_amount)),
          };
        }),
      );
    });
  }

  if (rows.length === 0) {
    return (
      <AppListFrame>
        <AppEmptyState mode="no-data" title={copy.empty} />
      </AppListFrame>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <AppToolbar>
        <Button type="button" onClick={onSave} disabled={pending}>
          {pending ? copy.saving : copy.save}
        </Button>
      </AppToolbar>
      <DataTable
        data={rows}
        columns={columns}
        getRowKey={(row) => row.branchId}
        emptyTitle={copy.empty}
        emptyMode="no-data"
      />
    </div>
  );
}
