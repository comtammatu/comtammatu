"use client";

import Link from "next/link";
import { useMemo } from "react";
import { History as IconHistory } from "lucide-react";
import {
  formatAuditActionLabel,
  formatAuditEntityTypeLabel,
} from "@comtammatu/shared/messages";
import { UNKNOWN_LABEL_VI } from "@comtammatu/shared/labels";
import { formatVNDateTime } from "@comtammatu/shared/time";
import { Button } from "@comtammatu/ui/components/button";
import { AppEmptyState } from "@/components/surface";
import { matchesSearch } from "@lib/search";
import { messages } from "@lib/messages";
import type { TenantAuditLogRow } from "@/_lib/audit";
import { AuditExportButton } from "@/_components/audit-export-button";
import {
  SystemActivityFilters,
  type SystemActivityActorOption,
  type SystemActivityEntityOption,
  type SystemActivityFilterValue,
} from "./system-activity-filters";
import { SystemActivityTable } from "./system-activity-table";

function documentLabel(row: TenantAuditLogRow): string {
  const typeLabel = formatAuditEntityTypeLabel(row.entityType);
  if (row.entityLabel) return `${typeLabel} ${row.entityLabel}`;
  return typeLabel;
}

export function SystemActivityClient({
  rows,
  filterValue,
  actorOptions,
  entityOptions,
  pagesHomeLink,
}: {
  rows: TenantAuditLogRow[];
  filterValue: SystemActivityFilterValue & { q: string | null };
  actorOptions: SystemActivityActorOption[];
  entityOptions: SystemActivityEntityOption[];
  pagesHomeLink: string;
}) {
  const copy = messages.settings.activity;
  const pages = messages.settings.pages;
  const q = filterValue.q?.trim() || null;

  const filteredRows = useMemo(() => {
    if (!q) return rows;
    return rows.filter((row) =>
      matchesSearch(
        [
          formatVNDateTime(row.createdAt),
          formatAuditActionLabel(row.action),
          documentLabel(row),
          formatAuditEntityTypeLabel(row.entityType),
          row.actorName ?? UNKNOWN_LABEL_VI,
          row.entityId,
        ],
        q,
      ),
    );
  }, [rows, q]);

  const hasStructuredFilters = Boolean(
    filterValue.entityType ||
      filterValue.entityId ||
      filterValue.actor ||
      filterValue.since,
  );
  const hasFilters = hasStructuredFilters || Boolean(q);
  const showEmpty = filteredRows.length === 0;

  const actorLabel =
    filterValue.actor == null
      ? null
      : (actorOptions.find((o) => o.id === filterValue.actor)?.label ??
        filterValue.actor);
  const entityLabel =
    filterValue.entityType == null
      ? null
      : (entityOptions.find((o) => o.id === filterValue.entityType)?.label ??
        formatAuditEntityTypeLabel(filterValue.entityType));

  const signatureLines = [
    entityLabel
      ? copy.exportFilterEntity(entityLabel)
      : copy.exportFilterAll,
    filterValue.entityId
      ? copy.exportFilterEntityId(filterValue.entityId)
      : null,
    actorLabel ? copy.exportFilterActor(actorLabel) : null,
    filterValue.since
      ? copy.exportFilterSince(filterValue.since)
      : null,
    q ? copy.exportFilterQuery(q) : null,
    copy.exportAt(formatVNDateTime(new Date())),
  ].filter((line): line is string => Boolean(line));

  const exportRows = filteredRows.map((row) => [
    formatVNDateTime(row.createdAt),
    formatAuditActionLabel(row.action),
    documentLabel(row),
    row.actorName ?? UNKNOWN_LABEL_VI,
    formatAuditEntityTypeLabel(row.entityType),
  ]);

  return (
    <>
      <SystemActivityFilters
        value={filterValue}
        actorOptions={actorOptions}
        entityOptions={entityOptions}
        trailing={
          <AuditExportButton
            filename={copy.exportFilename}
            label={copy.exportCsv}
            signatureLines={signatureLines}
            header={[
              copy.time,
              copy.action,
              copy.entity,
              copy.actor,
              copy.scope,
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
            <Button variant="outline" render={<Link href={pagesHomeLink} />}>
              {pages.settingsHomeLink}
            </Button>
          )}
        </AppEmptyState>
      ) : (
        <SystemActivityTable rows={filteredRows} />
      )}
    </>
  );
}
