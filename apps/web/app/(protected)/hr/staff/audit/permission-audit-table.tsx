"use client";

import Link from "next/link";
import { Badge, type BadgeProps } from "@comtammatu/ui/components/badge";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemHeader,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { BRANCH_VI } from "@comtammatu/shared/messages";
import { UNKNOWN_LABEL_VI } from "@comtammatu/shared/labels";
import { formatVNDate, formatVNDateTime } from "@comtammatu/shared/time";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import { messages } from "@lib/messages";

type BadgeVariant = NonNullable<BadgeProps["variant"]>;

export interface PermissionAuditDisplayRow {
  id: number;
  actorUserId: string;
  actorName: string | null;
  targetUserId: string;
  targetName: string | null;
  branchId: number | null;
  branchName: string | null;
  permissionKey: string;
  permissionLabel: string;
  action: string;
  at: string;
  validUntil: string | null;
}

function getActionVariant(action: string): BadgeVariant {
  if (action === "revoke") return "destructive";
  if (action === "apply_template") return "outline";
  return "default";
}

function UserLabel({ name }: { name: string | null }) {
  return name ?? UNKNOWN_LABEL_VI;
}

export function PermissionAuditTable({
  rows,
}: {
  rows: PermissionAuditDisplayRow[];
}) {
  const copy = messages.owner.staffAudit;
  const columns: DataTableColumn<PermissionAuditDisplayRow>[] = [
    {
      key: "time",
      header: copy.time,
      className: "whitespace-nowrap text-xs text-muted-foreground",
      render: (row) => formatVNDateTime(row.at),
    },
    {
      key: "action",
      header: copy.action,
      render: (row) => (
        <Badge variant={getActionVariant(row.action)}>
          {copy.actionLabels[row.action] ?? UNKNOWN_LABEL_VI}
        </Badge>
      ),
    },
    {
      key: "actor",
      header: copy.actor,
      className: "text-sm",
      render: (row) => (
        <UserLabel name={row.actorName} />
      ),
    },
    {
      key: "target",
      header: copy.target,
      className: "text-sm",
      render: (row) => (
        <Link
          href={`/hr/staff/${row.targetUserId}/permissions`}
          className="hover:underline"
        >
          <UserLabel name={row.targetName} />
        </Link>
      ),
    },
    {
      key: "permission",
      header: copy.permission,
      render: (row) => (
        <span>{row.permissionLabel}</span>
      ),
    },
    {
      key: "branch",
      header: BRANCH_VI.long,
      className: "text-sm text-muted-foreground",
      render: (row) =>
        row.branchId === null
          ? copy.tenantWide
          : (row.branchName ?? UNKNOWN_LABEL_VI),
    },
    {
      key: "expires",
      header: copy.expires,
      className: "text-xs text-muted-foreground",
      render: (row) =>
        row.validUntil ? formatVNDate(row.validUntil) : copy.forever,
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={rows}
      getRowKey={(row) => row.id}
      pageSize={50}
      emptyTitle={copy.empty}
      mobileCardRender={(row) => (
        <Item variant="outline">
          <ItemHeader>
            <ItemTitle>{formatVNDateTime(row.at)}</ItemTitle>
            <Badge variant={getActionVariant(row.action)}>
              {copy.actionLabels[row.action] ?? UNKNOWN_LABEL_VI}
            </Badge>
          </ItemHeader>
          <ItemContent>
            <ItemDescription>
              {copy.actor}:{" "}
              <UserLabel name={row.actorName} />
            </ItemDescription>
            <ItemDescription>
              {copy.target}:{" "}
              <Link
                href={`/hr/staff/${row.targetUserId}/permissions`}
                className="hover:underline"
              >
                <UserLabel name={row.targetName} />
              </Link>
            </ItemDescription>
            <ItemDescription>{row.permissionLabel}</ItemDescription>
            <ItemDescription>
              {BRANCH_VI.long}:{" "}
              {row.branchId === null
                ? copy.tenantWide
                : (row.branchName ?? UNKNOWN_LABEL_VI)}
            </ItemDescription>
            <ItemDescription>
              {copy.expires}:{" "}
              {row.validUntil ? formatVNDate(row.validUntil) : copy.forever}
            </ItemDescription>
          </ItemContent>
        </Item>
      )}
    />
  );
}
