"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useTransition, type ReactNode } from "react";
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
import {
  formatAuditActionLabel,
  formatAuditEntityTypeLabel,
  summarizeAuditDiff,
} from "@comtammatu/shared/messages";
import { UNKNOWN_LABEL_VI } from "@comtammatu/shared/labels";
import { formatVNDateTime } from "@comtammatu/shared/time";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import { messages } from "@lib/messages";
import { useDocumentOverlayUrl } from "@lib/navigation/use-document-overlay-url";
import type {
  TenantAuditLogDetail,
  TenantAuditLogRow,
} from "@/_lib/audit";
import { getSystemActivityDetail } from "./actions";

const ACTIVITY_LOG_OVERLAY_KEYS = ["logId"] as const;

function documentLabel(row: Pick<TenantAuditLogRow, "entityType" | "entityLabel">): string {
  const typeLabel = formatAuditEntityTypeLabel(row.entityType);
  if (row.entityLabel) return `${typeLabel} ${row.entityLabel}`;
  return typeLabel;
}

function sameDocumentHref(row: TenantAuditLogRow): string | null {
  if (!row.entityType || !/^\d+$/.test(row.entityId)) return null;
  const params = new URLSearchParams({
    entity_type: row.entityType,
    entity_id: row.entityId,
  });
  return `/settings/activity?${params.toString()}`;
}

export function SystemActivityTable({
  rows,
  emptyTitle,
  emptyDescription,
  emptyMode,
  emptyIcon,
}: {
  rows: TenantAuditLogRow[];
  emptyTitle?: string;
  emptyDescription?: string;
  emptyMode?: "no-data" | "no-results";
  emptyIcon?: ReactNode;
}) {
  const router = useRouter();
  const copy = messages.settings.activity;
  const { get, patchOverlay, clearOverlay } = useDocumentOverlayUrl(
    ACTIVITY_LOG_OVERLAY_KEYS,
  );
  const rawLogId = get("logId");
  const selectedId =
    rawLogId && /^\d+$/.test(rawLogId) ? Number(rawLogId) : null;
  const setSelectedId = useCallback(
    (id: number | null) => {
      if (id == null) clearOverlay(["logId"], "replace");
      else patchOverlay({ logId: id }, "push");
    },
    [clearOverlay, patchOverlay],
  );
  const [detail, setDetail] = useState<TenantAuditLogDetail | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (selectedId == null) {
      setDetail(null);
      setLoadError(false);
      return;
    }

    let cancelled = false;
    startTransition(() => {
      void getSystemActivityDetail({ id: selectedId }).then((result) => {
        if (cancelled) return;
        if (!result.success || !result.data) {
          setDetail(null);
          setLoadError(true);
          return;
        }
        setDetail(result.data);
        setLoadError(false);
      });
    });

    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const open = selectedId != null;
  const sheetRow = detail ?? rows.find((row) => row.id === selectedId) ?? null;
  const diffFields = detail
    ? summarizeAuditDiff(detail.oldData, detail.newData)
    : [];
  const filterHref = sheetRow ? sameDocumentHref(sheetRow) : null;

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
      render: (row) => documentLabel(row),
    },
    {
      key: "actor",
      header: copy.actor,
      className: "text-sm",
      render: (row) => row.actorName ?? UNKNOWN_LABEL_VI,
    },
    {
      key: "scope",
      header: copy.scope,
      className: "text-xs text-muted-foreground",
      render: (row) => formatAuditEntityTypeLabel(row.entityType),
    },
  ];

  return (
    <>
      <p className="mb-2 text-xs text-muted-foreground">{copy.openRowHint}</p>
      <DataTable
        columns={columns}
        data={rows}
        emptyTitle={emptyTitle}
        emptyDescription={emptyDescription}
        emptyMode={emptyMode}
        emptyIcon={emptyIcon}
        getRowKey={(row) => String(row.id)}
        onRowClick={(row) => setSelectedId(row.id)}
        getRowAriaLabel={(row) =>
          `${formatAuditActionLabel(row.action)} · ${documentLabel(row)}`
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
              <ItemTitle>{formatAuditActionLabel(row.action)}</ItemTitle>
            </ItemHeader>
            <ItemContent>
              <ItemDescription>
                {documentLabel(row)}
                {" · "}
                {row.actorName ?? UNKNOWN_LABEL_VI}
                {" · "}
                {formatVNDateTime(row.createdAt)}
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
                ? formatAuditActionLabel(sheetRow.action)
                : copy.detailLoading}
            </SheetDescription>
          </SheetHeader>

          <div className="flex flex-col gap-4 px-4 pb-4">
            {isPending && !detail ? (
              <p className="text-sm text-muted-foreground">{copy.detailLoading}</p>
            ) : null}
            {loadError ? (
              <p className="text-sm text-destructive">{copy.detailFailed}</p>
            ) : null}

            {sheetRow ? (
              <dl className="grid gap-3 text-sm">
                <div className="grid gap-1">
                  <dt className="text-muted-foreground">{copy.time}</dt>
                  <dd>{formatVNDateTime(sheetRow.createdAt)}</dd>
                </div>
                <div className="grid gap-1">
                  <dt className="text-muted-foreground">{copy.action}</dt>
                  <dd>{formatAuditActionLabel(sheetRow.action)}</dd>
                </div>
                <div className="grid gap-1">
                  <dt className="text-muted-foreground">{copy.entity}</dt>
                  <dd>{documentLabel(sheetRow)}</dd>
                </div>
                <div className="grid gap-1">
                  <dt className="text-muted-foreground">{copy.actor}</dt>
                  <dd>{sheetRow.actorName ?? UNKNOWN_LABEL_VI}</dd>
                </div>
                {detail?.ipAddress ? (
                  <div className="grid gap-1">
                    <dt className="text-muted-foreground">{copy.detailIp}</dt>
                    <dd className="font-mono text-xs">{detail.ipAddress}</dd>
                  </div>
                ) : null}
              </dl>
            ) : null}

            {detail ? (
              <div className="grid gap-2">
                <p className="text-sm font-medium">{copy.detailChanges}</p>
                {diffFields.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {copy.detailEmptyDiff}
                  </p>
                ) : (
                  <ul className="grid gap-2">
                    {diffFields.map((field) => (
                      <li key={field.key}>
                        <Item variant="outline" size="sm">
                          <ItemContent className="gap-1">
                            <ItemTitle>{field.label}</ItemTitle>
                            <ItemDescription>
                              {copy.detailFrom}: {field.from ?? "—"}
                            </ItemDescription>
                            <ItemDescription>
                              {copy.detailTo}: {field.to ?? "—"}
                            </ItemDescription>
                          </ItemContent>
                        </Item>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}
          </div>

          <SheetFooter className="gap-2 sm:flex-col">
            {sheetRow?.href ? (
              <Button render={<Link href={sheetRow.href} />}>
                {copy.openDocument}
              </Button>
            ) : null}
            {filterHref ? (
              <Button
                variant="outline"
                onClick={() => {
                  setSelectedId(null);
                  router.push(filterHref);
                }}
              >
                {copy.filterSameDocument}
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
