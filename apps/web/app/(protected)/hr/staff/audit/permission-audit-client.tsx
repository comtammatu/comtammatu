"use client";

import Link from "next/link";
import { useMemo } from "react";
import { History as IconHistory } from "lucide-react";
import { BRANCH_VI } from "@comtammatu/shared/messages";
import { UNKNOWN_LABEL_VI } from "@comtammatu/shared/labels";
import { formatVNDate, formatVNDateTime } from "@comtammatu/shared/time";
import { Button } from "@comtammatu/ui/components/button";
import { AppEmptyState } from "@/components/surface";
import { matchesSearch } from "@lib/search";
import { messages } from "@lib/messages";
import { AuditExportButton } from "@/_components/audit-export-button";
import type { HrBranchScope } from "@/lib/hr-scope";
import { withHrBranchScope } from "@/lib/hr-scope";
import {
  PermissionAuditFilters,
  type PermissionAuditFilterValue,
  type PermissionAuditTargetOption,
} from "./permission-audit-filters";
import {
  PermissionAuditTable,
  type PermissionAuditDisplayRow,
} from "./permission-audit-table";

function actionLabel(
  copy: typeof messages.owner.staffAudit,
  action: string,
): string {
  return copy.actionLabels[action] ?? UNKNOWN_LABEL_VI;
}

export function PermissionAuditClient({
  rows,
  filterValue,
  targetOptions,
  branchScope,
  hasServerFilters,
}: {
  rows: PermissionAuditDisplayRow[];
  filterValue: PermissionAuditFilterValue;
  targetOptions: PermissionAuditTargetOption[];
  branchScope: HrBranchScope;
  hasServerFilters: boolean;
}) {
  const copy = messages.owner.staffAudit;
  const q = filterValue.q?.trim() || null;

  const filteredRows = useMemo(() => {
    if (!q) return rows;
    return rows.filter((row) =>
      matchesSearch(
        [
          formatVNDateTime(row.at),
          actionLabel(copy, row.action),
          row.targetName ?? UNKNOWN_LABEL_VI,
          row.actorName ?? UNKNOWN_LABEL_VI,
          row.permissionLabel,
          row.workGroup,
          row.templateLabel,
          row.branchName,
          row.branchId === null ? copy.tenantWide : null,
          row.validUntil ? formatVNDate(row.validUntil) : copy.forever,
        ],
        q,
      ),
    );
  }, [rows, q, copy]);

  const hasFilters = hasServerFilters || Boolean(q);
  const showEmpty = filteredRows.length === 0;

  const targetLabel =
    filterValue.target == null
      ? null
      : (targetOptions.find((o) => o.id === filterValue.target)?.label ??
        filterValue.target);
  const actionFilterLabel =
    filterValue.action == null
      ? null
      : actionLabel(copy, filterValue.action);

  const signatureLines = [
    actionFilterLabel
      ? copy.exportFilterAction(actionFilterLabel)
      : copy.exportFilterAll,
    targetLabel ? copy.exportFilterTarget(targetLabel) : null,
    filterValue.since
      ? copy.exportFilterSince(filterValue.since)
      : null,
    q ? copy.exportFilterQuery(q) : null,
    copy.exportAt(formatVNDateTime(new Date())),
  ].filter((line): line is string => Boolean(line));

  const exportRows = filteredRows.map((row) => [
    formatVNDateTime(row.at),
    actionLabel(copy, row.action),
    row.targetName ?? UNKNOWN_LABEL_VI,
    row.actorName ?? UNKNOWN_LABEL_VI,
    row.permissionLabel,
    row.workGroup,
    row.action === "apply_template"
      ? (row.templateLabel ?? UNKNOWN_LABEL_VI)
      : "—",
    row.branchId === null
      ? copy.tenantWide
      : (row.branchName ?? UNKNOWN_LABEL_VI),
    row.validUntil ? formatVNDate(row.validUntil) : copy.forever,
  ]);

  return (
    <>
      <PermissionAuditFilters
        value={filterValue}
        targetOptions={targetOptions}
        branchScope={branchScope}
        trailing={
          <AuditExportButton
            filename={copy.exportFilename}
            label={copy.exportCsv}
            signatureLines={signatureLines}
            header={[
              copy.time,
              copy.action,
              copy.target,
              copy.actor,
              copy.permission,
              copy.workGroup,
              copy.template,
              BRANCH_VI.long,
              copy.expires,
            ]}
            rows={exportRows}
          />
        }
      />

      {showEmpty ? (
        <AppEmptyState
          mode={hasFilters ? "no-results" : "no-data"}
          title={hasFilters ? copy.emptyFiltered : copy.empty}
          description={hasFilters ? copy.emptyFilteredHint : undefined}
          icon={<IconHistory />}
        >
          {hasFilters ? null : (
            <Button
              variant="outline"
              size="touch"
              render={
                <Link
                  href={withHrBranchScope("/hr?view=accounts", branchScope)}
                />
              }
            >
              {copy.emptyAction}
            </Button>
          )}
        </AppEmptyState>
      ) : (
        <PermissionAuditTable rows={filteredRows} />
      )}
    </>
  );
}
