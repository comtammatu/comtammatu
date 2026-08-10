"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Badge, type BadgeProps } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemHeader,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@comtammatu/ui/components/sheet";
import { BRANCH_VI } from "@comtammatu/shared/messages";
import { UNKNOWN_LABEL_VI } from "@comtammatu/shared/labels";
import { formatVNDate, formatVNDateTime } from "@comtammatu/shared/time";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import { messages } from "@lib/messages";
import {
  resolveHrBranchScope,
  withHrBranchScope,
} from "@/lib/hr-scope";

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
  workGroup: string;
  templateLabel: string | null;
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

function actionLabel(
  copy: typeof messages.controlSurface.staffAudit,
  action: string,
): string {
  return copy.actionLabels[action] ?? UNKNOWN_LABEL_VI;
}

function permissionsHref(
  targetUserId: string,
  branchScope: ReturnType<typeof resolveHrBranchScope>,
): string {
  return withHrBranchScope(
    `/hr/staff/${targetUserId}/permissions`,
    branchScope,
  );
}

function sameTargetHref(
  targetUserId: string,
  branchScope: ReturnType<typeof resolveHrBranchScope>,
): string {
  const usp = new URLSearchParams();
  usp.set("branch", branchScope);
  usp.set("target", targetUserId);
  return `/hr/staff/audit?${usp.toString()}`;
}

function branchLabel(
  row: PermissionAuditDisplayRow,
  copy: typeof messages.controlSurface.staffAudit,
): string {
  if (row.branchId === null) return copy.tenantWide;
  return row.branchName ?? UNKNOWN_LABEL_VI;
}

export function PermissionAuditTable({
  rows,
}: {
  rows: PermissionAuditDisplayRow[];
}) {
  const router = useRouter();
  const copy = messages.controlSurface.staffAudit;
  const branchScope = resolveHrBranchScope(useSearchParams().get("branch"));
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const sheetRow =
    selectedId == null
      ? null
      : (rows.find((row) => row.id === selectedId) ?? null);
  const open = selectedId != null;

  // Contract order: Thời gian → Hành động → Đối tượng → Người thao tác → phụ.
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
          {actionLabel(copy, row.action)}
        </Badge>
      ),
    },
    {
      key: "target",
      header: copy.target,
      className: "text-sm",
      render: (row) => (
        <Link
          href={permissionsHref(row.targetUserId, branchScope)}
          className="hover:underline"
          onClick={(event) => event.stopPropagation()}
        >
          <UserLabel name={row.targetName} />
        </Link>
      ),
    },
    {
      key: "actor",
      header: copy.actor,
      className: "text-sm",
      render: (row) => <UserLabel name={row.actorName} />,
    },
    {
      key: "permission",
      header: copy.permission,
      render: (row) => (
        <div className="flex flex-col gap-1">
          <span>{row.permissionLabel}</span>
          <span className="text-xs text-muted-foreground">{row.workGroup}</span>
        </div>
      ),
    },
    {
      key: "template",
      header: copy.template,
      className: "text-sm text-muted-foreground",
      render: (row) =>
        row.action === "apply_template"
          ? (row.templateLabel ?? UNKNOWN_LABEL_VI)
          : "—",
    },
    {
      key: "branch",
      header: BRANCH_VI.long,
      className: "text-sm text-muted-foreground",
      render: (row) => branchLabel(row, copy),
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
    <>
      <p className="mb-2 text-xs text-muted-foreground">{copy.openRowHint}</p>
      <DataTable
        columns={columns}
        data={rows}
        getRowKey={(row) => row.id}
        pageSize={50}
        emptyTitle={copy.empty}
        onRowClick={(row) => setSelectedId(row.id)}
        getRowAriaLabel={(row) =>
          `${actionLabel(copy, row.action)} · ${row.targetName ?? UNKNOWN_LABEL_VI}`
        }
        mobileCardRender={(row) => (
          <Item
            variant="outline"
            className="cursor-pointer"
            role="button"
            tabIndex={0}
            onClick={() => setSelectedId(row.id)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                setSelectedId(row.id);
              }
            }}
          >
            <ItemHeader>
              <ItemTitle>{formatVNDateTime(row.at)}</ItemTitle>
              <Badge variant={getActionVariant(row.action)}>
                {actionLabel(copy, row.action)}
              </Badge>
            </ItemHeader>
            <ItemContent>
              <ItemDescription>
                {copy.target}:{" "}
                <Link
                  href={permissionsHref(row.targetUserId, branchScope)}
                  className="hover:underline"
                  onClick={(event) => event.stopPropagation()}
                >
                  <UserLabel name={row.targetName} />
                </Link>
              </ItemDescription>
              <ItemDescription>
                {copy.actor}: <UserLabel name={row.actorName} />
              </ItemDescription>
              <ItemDescription>{row.permissionLabel}</ItemDescription>
              <ItemDescription>
                {copy.workGroup}: {row.workGroup}
              </ItemDescription>
              {row.action === "apply_template" ? (
                <ItemDescription>
                  {copy.template}: {row.templateLabel ?? UNKNOWN_LABEL_VI}
                </ItemDescription>
              ) : null}
              <ItemDescription>
                {BRANCH_VI.long}: {branchLabel(row, copy)}
              </ItemDescription>
              <ItemDescription>
                {copy.expires}:{" "}
                {row.validUntil ? formatVNDate(row.validUntil) : copy.forever}
              </ItemDescription>
            </ItemContent>
          </Item>
        )}
      />

      <Sheet
        open={open}
        onOpenChange={(next) => {
          if (!next) setSelectedId(null);
        }}
      >
        <SheetContent side="right" size="md" className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{copy.detailTitle}</SheetTitle>
            <SheetDescription>
              {sheetRow
                ? actionLabel(copy, sheetRow.action)
                : copy.openRowHint}
            </SheetDescription>
          </SheetHeader>

          <div className="flex flex-col gap-4 px-4 pb-4">
            {sheetRow ? (
              <dl className="grid gap-3 text-sm">
                <div className="grid gap-1">
                  <dt className="text-muted-foreground">{copy.time}</dt>
                  <dd>{formatVNDateTime(sheetRow.at)}</dd>
                </div>
                <div className="grid gap-1">
                  <dt className="text-muted-foreground">{copy.action}</dt>
                  <dd>
                    <Badge variant={getActionVariant(sheetRow.action)}>
                      {actionLabel(copy, sheetRow.action)}
                    </Badge>
                  </dd>
                </div>
                <div className="grid gap-1">
                  <dt className="text-muted-foreground">{copy.target}</dt>
                  <dd>
                    <UserLabel name={sheetRow.targetName} />
                  </dd>
                </div>
                <div className="grid gap-1">
                  <dt className="text-muted-foreground">{copy.actor}</dt>
                  <dd>
                    <UserLabel name={sheetRow.actorName} />
                  </dd>
                </div>
                <div className="grid gap-1">
                  <dt className="text-muted-foreground">{copy.permission}</dt>
                  <dd>{sheetRow.permissionLabel}</dd>
                </div>
                <div className="grid gap-1">
                  <dt className="text-muted-foreground">{copy.workGroup}</dt>
                  <dd>{sheetRow.workGroup}</dd>
                </div>
                {sheetRow.action === "apply_template" ? (
                  <div className="grid gap-1">
                    <dt className="text-muted-foreground">{copy.template}</dt>
                    <dd>{sheetRow.templateLabel ?? UNKNOWN_LABEL_VI}</dd>
                  </div>
                ) : null}
                <div className="grid gap-1">
                  <dt className="text-muted-foreground">{BRANCH_VI.long}</dt>
                  <dd>{branchLabel(sheetRow, copy)}</dd>
                </div>
                <div className="grid gap-1">
                  <dt className="text-muted-foreground">{copy.expires}</dt>
                  <dd>
                    {sheetRow.validUntil
                      ? formatVNDate(sheetRow.validUntil)
                      : copy.forever}
                  </dd>
                </div>
              </dl>
            ) : null}
          </div>

          <SheetFooter className="gap-2 sm:flex-col">
            {sheetRow ? (
              <Button
                render={
                  <Link
                    href={permissionsHref(sheetRow.targetUserId, branchScope)}
                  />
                }
              >
                {copy.openPermissions}
              </Button>
            ) : null}
            {sheetRow ? (
              <Button
                variant="outline"
                onClick={() => {
                  const href = sameTargetHref(
                    sheetRow.targetUserId,
                    branchScope,
                  );
                  setSelectedId(null);
                  router.push(href);
                }}
              >
                {copy.filterSameTarget}
              </Button>
            ) : null}
            <Button variant="ghost" onClick={() => setSelectedId(null)}>
              {copy.detailClose}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}
