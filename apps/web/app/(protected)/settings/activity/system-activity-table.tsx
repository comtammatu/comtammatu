"use client";

import Link from "next/link";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemHeader,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import {
  formatAuditActionLabel,
  formatAuditEntityTypeLabel,
} from "@comtammatu/shared/messages";
import { UNKNOWN_LABEL_VI } from "@comtammatu/shared/labels";
import { formatVNDateTime } from "@comtammatu/shared/time";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import { messages } from "@lib/messages";
import type { TenantAuditLogRow } from "@/_lib/audit";

function documentLabel(row: TenantAuditLogRow): string {
  const typeLabel = formatAuditEntityTypeLabel(row.entityType);
  if (row.entityLabel) return `${typeLabel} ${row.entityLabel}`;
  return typeLabel;
}

export function SystemActivityTable({ rows }: { rows: TenantAuditLogRow[] }) {
  const copy = messages.settings.activity;
  const columns: DataTableColumn<TenantAuditLogRow>[] = [
    {
      key: "time",
      header: copy.time,
      className: "whitespace-nowrap text-xs text-muted-foreground",
      render: (row) => formatVNDateTime(row.createdAt),
    },
    {
      key: "action",
      header: copy.action,
      render: (row) => formatAuditActionLabel(row.action),
    },
    {
      key: "entity",
      header: copy.entity,
      render: (row) => {
        const label = documentLabel(row);
        if (!row.href) return label;
        return (
          <Link href={row.href} className="hover:underline">
            {label}
          </Link>
        );
      },
    },
    {
      key: "actor",
      header: copy.actor,
      className: "text-sm",
      render: (row) => row.actorName ?? UNKNOWN_LABEL_VI,
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={rows}
      getRowKey={(row) => String(row.id)}
      mobileCardRender={(row) => (
        <Item>
          <ItemHeader>
            <ItemTitle>{formatAuditActionLabel(row.action)}</ItemTitle>
          </ItemHeader>
          <ItemContent>
            <ItemDescription>
              {row.href ? (
                <Link href={row.href} className="hover:underline">
                  {documentLabel(row)}
                </Link>
              ) : (
                documentLabel(row)
              )}
              {" · "}
              {row.actorName ?? UNKNOWN_LABEL_VI}
              {" · "}
              {formatVNDateTime(row.createdAt)}
            </ItemDescription>
          </ItemContent>
        </Item>
      )}
    />
  );
}
