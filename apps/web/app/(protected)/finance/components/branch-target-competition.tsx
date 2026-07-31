"use client";

import Link from "next/link";
import { formatPercent, formatVND } from "@comtammatu/shared/format";
import { Progress } from "@comtammatu/ui/components/progress";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { KpiCard } from "@/components/kpi/kpi-card";
import { AppSection, KpiRow } from "@/components/surface";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import { messages } from "@lib/messages";
import { clampProgressValue, targetProgressTone } from "../_lib/revenue-target";
import type { BranchRevenueTargetProgressRow } from "../targets/actions";
import type { FinanceParams } from "../_lib/finance-params";
import { serializeFinanceParams } from "../_lib/finance-params";

const copy = messages.finance.revenueTargets.progress;

export function BranchTargetCompetition({
  rows,
  params,
}: {
  rows: BranchRevenueTargetProgressRow[];
  params: FinanceParams;
}) {
  const withTarget = rows.filter(
    (row) => row.targetAmount != null && row.targetAmount > 0,
  );
  const totalNet = withTarget.reduce((sum, row) => sum + row.netRevenue, 0);
  const totalTarget = withTarget.reduce(
    (sum, row) => sum + (row.targetAmount ?? 0),
    0,
  );
  const chainPct = totalTarget > 0 ? (totalNet / totalTarget) * 100 : null;
  const chainGap = totalTarget > 0 ? Math.max(totalTarget - totalNet, 0) : null;
  const chainTone = targetProgressTone(chainPct);

  const columns: DataTableColumn<BranchRevenueTargetProgressRow>[] = [
    {
      key: "rank",
      header: copy.rank,
      render: (_row, index) => `#${index + 1}`,
    },
    {
      key: "branch",
      header: messages.finance.revenueTargets.branch,
      render: (row) => {
        const next = serializeFinanceParams({
          ...params,
          branch: row.branchId,
        });
        return (
          <Link
            href={`/finance/revenue?${next.toString()}`}
            className="text-primary underline-offset-2 hover:underline"
          >
            {row.branchName}
          </Link>
        );
      },
    },
    {
      key: "net",
      header: copy.revenueLabel,
      className: "text-right",
      render: (row) => (
        <span className="font-mono tabular-nums">
          {formatVND(row.netRevenue)}
        </span>
      ),
    },
    {
      key: "target",
      header: copy.targetLabel,
      className: "text-right",
      render: (row) =>
        row.targetAmount == null ? (
          <span className="text-muted-foreground">{copy.noTarget}</span>
        ) : (
          <span className="font-mono tabular-nums">
            {formatVND(row.targetAmount)}
          </span>
        ),
    },
    {
      key: "progress",
      header: copy.chainProgress,
      render: (row) => {
        if (row.progressPct == null || row.targetAmount == null) {
          return <span className="text-muted-foreground">—</span>;
        }
        const tone = targetProgressTone(row.progressPct);
        return (
          <div className="flex min-w-32 flex-col gap-1">
            <Progress
              value={clampProgressValue(row.progressPct)}
              tone={
                tone === "neutral"
                  ? "default"
                  : (tone as "success" | "warning" | "destructive")
              }
              className="h-1.5 rounded-full"
            />
            <span className="text-xs tabular-nums">
              {formatPercent(row.progressPct)}
            </span>
          </div>
        );
      },
    },
    {
      key: "gap",
      header: copy.gapLabel,
      className: "text-right",
      render: (row) =>
        row.gapAmount == null ? (
          "—"
        ) : (
          <span className="font-mono tabular-nums">
            {formatVND(row.gapAmount)}
          </span>
        ),
    },
  ];

  return (
    <AppSection size="sm" title={copy.sectionTitle}>
      {chainPct != null ? (
        <KpiRow density="compact" className="mb-4 lg:grid-cols-3">
          <KpiCard
            density="compact"
            label={copy.revenueLabel}
            value={formatVND(totalNet)}
            tone="primary"
          />
          <KpiCard
            density="compact"
            label={copy.chainProgress}
            value={formatPercent(chainPct)}
            tone={chainTone}
            hint={
              <Progress
                value={clampProgressValue(chainPct)}
                tone={
                  chainTone === "neutral"
                    ? "default"
                    : (chainTone as "success" | "warning" | "destructive")
                }
                className="h-1.5 rounded-full"
              />
            }
          />
          <KpiCard
            density="compact"
            label={copy.gapLabel}
            value={formatVND(chainGap ?? 0)}
            tone={chainGap != null && chainGap > 0 ? "warning" : "success"}
          />
        </KpiRow>
      ) : null}

      <DataTable
        data={rows}
        columns={columns}
        getRowKey={(row) => row.branchId}
        emptyTitle={copy.noTarget}
        emptyMode="no-data"
        mobileCardRender={(row, index) => (
          <Item variant="outline" size="sm">
            <ItemContent>
              <ItemTitle>
                #{index + 1} · {row.branchName}
              </ItemTitle>
              <ItemDescription>
                {formatVND(row.netRevenue)}
                {row.targetAmount != null
                  ? ` / ${formatVND(row.targetAmount)}`
                  : ` · ${copy.noTarget}`}
                {row.progressPct != null
                  ? ` · ${formatPercent(row.progressPct)}`
                  : null}
              </ItemDescription>
              {row.progressPct != null ? (
                <Progress
                  value={clampProgressValue(row.progressPct)}
                  tone={
                    targetProgressTone(row.progressPct) === "neutral"
                      ? "default"
                      : (targetProgressTone(row.progressPct) as
                          | "success"
                          | "warning"
                          | "destructive")
                  }
                  className="mt-2 h-1.5 rounded-full"
                />
              ) : null}
            </ItemContent>
          </Item>
        )}
      />
    </AppSection>
  );
}
