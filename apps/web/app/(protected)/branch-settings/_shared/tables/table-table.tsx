"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import {
  Copy as IconCopy,
  ExternalLink as IconExternalLink,
  Pencil as IconPencil,
  Power as IconPower,
  PowerOff as IconPowerOff,
  QrCode as IconQrCode,
  RefreshCcw as IconRefreshCcw,
  Trash as IconTrash,
  Utensils as IconToolsKitchen,
} from "lucide-react";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { confirm } from "@comtammatu/ui/components/confirm-dialog";
import {
  createTableSelfOrderQr,
  deleteTable,
  rotateTableSelfOrderQr,
  setTableSelfOrderQrEnabled,
} from "./actions";
import { StatusBadge } from "@/components/status-badge";
import { TableFormDialog } from "./table-form-dialog";
import type { ZoneRow } from "./zone-table";
import { toast } from "@comtammatu/ui/components/sonner";
import {
  ACTIONS_VI,
  FORM_VI,
  STATES_VI,
  TABLE_VI,
} from "@comtammatu/shared/messages";
import { messages } from "@lib/messages";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import { AppDialog } from "@/components/form";
import { RowActionsMenu } from "@/components/row-actions-menu";

export interface TableRow {
  id: number;
  branch_id: number;
  zone_id: number | null;
  number: number;
  status: string;
  self_order_token: string | null;
  self_order_enabled: boolean;
  self_order_token_rotated_at: string | null;
  zone_name: string | null;
}

interface DiningTableSettingsListProps {
  tables: TableRow[];
  zones: ZoneRow[];
}

interface SelfOrderQrDialogState {
  id: number;
  number: number;
  token: string;
  enabled: boolean;
  rotatedAt: string | null;
}

function qrDialogStateFromTable(
  table: TableRow,
): SelfOrderQrDialogState | null {
  if (!table.self_order_token) return null;
  return {
    id: table.id,
    number: table.number,
    token: table.self_order_token,
    enabled: table.self_order_enabled,
    rotatedAt: table.self_order_token_rotated_at,
  };
}

function buildSelfOrderUrl(token: string, origin: string) {
  return origin ? `${origin}/q/${token}` : `/q/${token}`;
}

export function DiningTableSettingsList({
  tables,
  zones,
}: DiningTableSettingsListProps) {
  const router = useRouter();
  const [editTable, setEditTable] = useState<TableRow | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
  const [pendingQrId, setPendingQrId] = useState<number | null>(null);
  const [qrDialog, setQrDialog] = useState<SelfOrderQrDialogState | null>(null);

  const tableMessages = messages.settings.tables;

  async function handleDelete(id: number) {
    const ok = await confirm({
      title: tableMessages.deleteTitle,
      description: tableMessages.deleteDescription,
      confirmText: ACTIONS_VI.delete,
      cancelText: ACTIONS_VI.cancel,
      variant: "destructive",
    });
    if (!ok) return;

    setPendingDeleteId(id);
    const result = await deleteTable({ id });
    setPendingDeleteId(null);
    if (!result.success) {
      toast.error(result.error);
    } else {
      toast.success(`${STATES_VI.deleted} ${TABLE_VI.long.toLowerCase()}`);
    }
  }

  function showQrDialog(table: TableRow) {
    const next = qrDialogStateFromTable(table);
    if (next) setQrDialog(next);
  }

  async function handleCreateQr(table: TableRow) {
    setPendingQrId(table.id);
    try {
      const result = await createTableSelfOrderQr({ id: table.id });
      if (!result.success || !result.data) {
        toast.error(result.error ?? tableMessages.qrActionFailed);
        return;
      }
      toast.success(tableMessages.qrCreated);
      setQrDialog({
        id: table.id,
        number: table.number,
        token: result.data.token,
        enabled: result.data.enabled,
        rotatedAt: result.data.rotatedAt,
      });
      router.refresh();
    } catch (error) {
      console.error("[table-settings] create self-order QR failed", error);
      toast.error(tableMessages.qrActionFailed);
    } finally {
      setPendingQrId(null);
    }
  }

  async function handleSetQrEnabled(table: TableRow, enabled: boolean) {
    setPendingQrId(table.id);
    try {
      const result = await setTableSelfOrderQrEnabled({
        id: table.id,
        enabled,
      });
      if (!result.success || !result.data) {
        toast.error(result.error ?? tableMessages.qrActionFailed);
        return;
      }
      toast.success(
        enabled ? tableMessages.qrEnabledToast : tableMessages.qrDisabledToast,
      );
      if (enabled) {
        setQrDialog({
          id: table.id,
          number: table.number,
          token: result.data.token,
          enabled: result.data.enabled,
          rotatedAt: result.data.rotatedAt,
        });
      } else if (qrDialog?.id === table.id) {
        setQrDialog(null);
      }
      router.refresh();
    } catch (error) {
      console.error("[table-settings] update self-order QR failed", error);
      toast.error(tableMessages.qrActionFailed);
    } finally {
      setPendingQrId(null);
    }
  }

  async function handleRotateQr(table: TableRow) {
    const ok = await confirm({
      title: tableMessages.rotateQrTitle,
      description: tableMessages.rotateQrDescription,
      confirmText: tableMessages.rotateQrConfirm,
      cancelText: ACTIONS_VI.cancel,
      variant: "destructive",
    });
    if (!ok) return;

    setPendingQrId(table.id);
    try {
      const result = await rotateTableSelfOrderQr({ id: table.id });
      if (!result.success || !result.data) {
        toast.error(result.error ?? tableMessages.qrActionFailed);
        return;
      }
      toast.success(tableMessages.qrRotatedToast);
      setQrDialog({
        id: table.id,
        number: table.number,
        token: result.data.token,
        enabled: result.data.enabled,
        rotatedAt: result.data.rotatedAt,
      });
      router.refresh();
    } catch (error) {
      console.error("[table-settings] rotate self-order QR failed", error);
      toast.error(tableMessages.qrActionFailed);
    } finally {
      setPendingQrId(null);
    }
  }

  function renderSelfOrderQrBadge(table: TableRow) {
    if (!table.self_order_token) {
      return <Badge variant="secondary">{tableMessages.qrNotCreated}</Badge>;
    }
    if (!table.self_order_enabled) {
      return <Badge variant="secondary">{tableMessages.qrDisabled}</Badge>;
    }
    return <Badge variant="success">{tableMessages.qrEnabled}</Badge>;
  }

  function isRowPending(tableId: number) {
    return pendingDeleteId === tableId || pendingQrId === tableId;
  }

  function TableActions({ table }: { table: TableRow }) {
    const qrPending = pendingQrId === table.id;
    const qrItems = table.self_order_token
      ? [
          {
            key: "view-qr",
            label: tableMessages.viewQr,
            icon: <IconQrCode data-icon="inline-start" />,
            disabled: qrPending,
            separatorBefore: true,
            onSelect: () => showQrDialog(table),
          },
          {
            key: table.self_order_enabled ? "disable-qr" : "enable-qr",
            label: table.self_order_enabled
              ? tableMessages.disableQr
              : tableMessages.enableQr,
            icon: table.self_order_enabled ? (
              <IconPowerOff data-icon="inline-start" />
            ) : (
              <IconPower data-icon="inline-start" />
            ),
            disabled: qrPending,
            onSelect: () =>
              void handleSetQrEnabled(table, !table.self_order_enabled),
          },
          {
            key: "rotate-qr",
            label: tableMessages.rotateQr,
            icon: <IconRefreshCcw data-icon="inline-start" />,
            disabled: qrPending,
            onSelect: () => void handleRotateQr(table),
          },
        ]
      : [
          {
            key: "create-qr",
            label: tableMessages.createQr,
            icon: <IconQrCode data-icon="inline-start" />,
            disabled: qrPending,
            separatorBefore: true,
            onSelect: () => void handleCreateQr(table),
          },
        ];

    return (
      <RowActionsMenu
        items={[
          {
            key: "edit",
            label: ACTIONS_VI.edit,
            icon: <IconPencil data-icon="inline-start" />,
            onSelect: () => setEditTable(table),
          },
          ...qrItems,
          {
            key: "delete",
            label: ACTIONS_VI.delete,
            icon: <IconTrash data-icon="inline-start" />,
            destructive: true,
            separatorBefore: true,
            onSelect: () => void handleDelete(table.id),
          },
        ]}
      />
    );
  }

  const columns: DataTableColumn<TableRow>[] = [
    {
      key: "table",
      header: TABLE_VI.long,
      render: (table) => (
        <span className="font-medium">
          {messages.settings.tables.tableLabel(table.number)}
        </span>
      ),
    },
    {
      key: "area",
      header: TABLE_VI.area,
      className: "text-muted-foreground",
      render: (table) => table.zone_name ?? "—",
    },
    {
      key: "status",
      header: FORM_VI.status,
      render: (table) => <StatusBadge domain="table" value={table.status} />,
    },
    {
      key: "self-order-qr",
      header: tableMessages.qrColumn,
      render: (table) => renderSelfOrderQrBadge(table),
    },
    {
      key: "actions",
      header: "",
      className: "w-12",
      render: (table) => <TableActions table={table} />,
    },
  ];

  return (
    <>
      <DataTable
        columns={columns}
        data={tables}
        getRowKey={(table) => table.id}
        emptyTitle={messages.settings.tables.emptyTitle}
        mobileBreakpoint={1024}
        emptyIcon={
          <IconToolsKitchen className="mx-auto size-8 text-muted-foreground" />
        }
        rowClassName={(table) =>
          isRowPending(table.id) ? "opacity-60" : undefined
        }
        mobileCardRender={(table) => (
          <Item
            variant="outline"
            className={isRowPending(table.id) ? "opacity-60" : ""}
          >
            <ItemContent className="min-w-0">
              <ItemTitle className="line-clamp-none w-full text-sm font-semibold">
                {tableMessages.tableLabel(table.number)}
              </ItemTitle>
              <ItemDescription className="line-clamp-none text-sm leading-6">
                {TABLE_VI.area}: {table.zone_name ?? "—"}
              </ItemDescription>
              <div className="flex flex-wrap gap-2">
                <StatusBadge domain="table" value={table.status} />
                {renderSelfOrderQrBadge(table)}
              </div>
            </ItemContent>
            <ItemActions className="self-center">
              <TableActions table={table} />
            </ItemActions>
          </Item>
        )}
      />

      {editTable && (
        <TableFormDialog
          open={!!editTable}
          onOpenChange={(open) => !open && setEditTable(null)}
          branchId={editTable.branch_id}
          zones={zones}
          table={editTable}
        />
      )}

      <SelfOrderQrDialog
        table={qrDialog}
        open={!!qrDialog}
        onOpenChange={(open) => !open && setQrDialog(null)}
      />
    </>
  );
}

function SelfOrderQrDialog({
  table,
  open,
  onOpenChange,
}: {
  table: SelfOrderQrDialogState | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [origin, setOrigin] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const tableMessages = messages.settings.tables;
  const url = table ? buildSelfOrderUrl(table.token, origin) : "";
  const previewHref = table ? `/q/${table.token}` : "";

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    if (!table || !origin) return;

    let cancelled = false;
    setQrDataUrl("");
    QRCode.toDataURL(buildSelfOrderUrl(table.token, origin), {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 256,
    })
      .then((nextQrDataUrl) => {
        if (!cancelled) setQrDataUrl(nextQrDataUrl);
      })
      .catch((error) => {
        console.error("[table-settings] render self-order QR failed", error);
        if (!cancelled) toast.error(tableMessages.qrRenderFailed);
      });

    return () => {
      cancelled = true;
    };
  }, [origin, table, tableMessages.qrRenderFailed]);

  async function handleCopy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      toast.success(tableMessages.qrCopied);
    } catch (error) {
      console.error("[table-settings] copy self-order QR link failed", error);
      toast.error(tableMessages.qrCopyFailed);
    }
  }

  if (!table) return null;

  return (
    <AppDialog
      open={open}
      onOpenChange={onOpenChange}
      title={tableMessages.qrDialogTitle(table.number)}
      description={tableMessages.qrDialogDescription}
      contentClassName="sm:max-w-md"
      bodyClassName="gap-3"
    >
      <div className="mx-auto grid size-72 place-items-center bg-white p-3">
        {qrDataUrl ? (
          <Image
            src={qrDataUrl}
            alt={tableMessages.qrAlt(table.number)}
            width={256}
            height={256}
            className="size-full"
            unoptimized
          />
        ) : (
          <span className="text-xs text-muted-foreground">
            {tableMessages.qrGenerating}
          </span>
        )}
      </div>
      <div className="text-xs break-all text-muted-foreground">{url}</div>
      <div className="grid gap-2 sm:grid-cols-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => void handleCopy()}
        >
          <IconCopy data-icon="inline-start" />
          {tableMessages.copyLink}
        </Button>
        <Button asChild variant="outline">
          <a href={previewHref}>
            <IconExternalLink data-icon="inline-start" />
            {tableMessages.openLink}
          </a>
        </Button>
      </div>
    </AppDialog>
  );
}
