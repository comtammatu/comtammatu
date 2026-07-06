"use client";

import { useState, useTransition } from "react";
import {
  Pencil as IconPencil,
  Trash as IconTrash,
  MapPin as IconMapPin,
} from "lucide-react";
import { ACTIONS_VI } from "@comtammatu/shared/messages";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { confirm } from "@comtammatu/ui/components/confirm-dialog";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import { RowActionsMenu } from "@/components/row-actions-menu";
import { messages } from "@lib/messages";
import { deleteZone } from "./actions";
import { ZoneFormDialog } from "./zone-form-dialog";
import { toast } from "@comtammatu/ui/components/sonner";

export interface ZoneRow {
  id: number;
  branch_id: number;
  name: string;
  sort_order: number;
}

interface ZoneTableProps {
  zones: ZoneRow[];
}

export function ZoneTable({ zones }: ZoneTableProps) {
  const [editZone, setEditZone] = useState<ZoneRow | null>(null);
  const [isPending, startTransition] = useTransition();
  const copy = messages.settings.tables;

  async function requestDelete(zone: ZoneRow) {
    const ok = await confirm({
      title: copy.deleteZoneTitle,
      description: copy.deleteZoneDescription,
      details: [{ label: copy.zoneName, value: zone.name }],
      confirmText: ACTIONS_VI.delete,
      variant: "destructive",
    });
    if (!ok) return;

    startTransition(async () => {
      const result = await deleteZone({ id: zone.id });
      if (!result.success) {
        toast.error(result.error);
      } else {
        toast.success(copy.zoneDeleted);
      }
    });
  }

  function ZoneActions({ zone }: { zone: ZoneRow }) {
    return (
      <RowActionsMenu
        items={[
          {
            key: "edit",
            label: ACTIONS_VI.edit,
            icon: <IconPencil data-icon="inline-start" />,
            onSelect: () => setEditZone(zone),
          },
          {
            key: "delete",
            label: ACTIONS_VI.delete,
            icon: <IconTrash data-icon="inline-start" />,
            destructive: true,
            separatorBefore: true,
            onSelect: () => void requestDelete(zone),
          },
        ]}
      />
    );
  }

  const columns: DataTableColumn<ZoneRow>[] = [
    {
      key: "name",
      header: copy.zoneName,
      render: (zone) => <span className="font-medium">{zone.name}</span>,
    },
    {
      key: "sort_order",
      header: copy.zoneOrder,
      className: "text-muted-foreground",
      render: (zone) => zone.sort_order,
    },
    {
      key: "actions",
      header: "",
      className: "w-12",
      render: (zone) => <ZoneActions zone={zone} />,
    },
  ];

  return (
    <>
      <DataTable
        columns={columns}
        data={zones}
        getRowKey={(zone) => zone.id}
        emptyTitle={copy.noZonesTitle}
        mobileBreakpoint={1024}
        emptyIcon={
          <IconMapPin className="mx-auto size-8 text-muted-foreground" />
        }
        rowClassName={() => (isPending ? "opacity-60" : undefined)}
        mobileCardRender={(zone) => (
          <Item variant="outline" className={isPending ? "opacity-60" : ""}>
            <ItemContent>
              <ItemTitle className="line-clamp-none w-full text-sm font-semibold">
                {zone.name}
              </ItemTitle>
              <ItemDescription className="line-clamp-none text-sm leading-6">
                {copy.zoneOrder}: {zone.sort_order}
              </ItemDescription>
            </ItemContent>
            <ItemActions>
              <ZoneActions zone={zone} />
            </ItemActions>
          </Item>
        )}
      />

      {editZone && (
        <ZoneFormDialog
          open={!!editZone}
          onOpenChange={(open) => !open && setEditZone(null)}
          branchId={editZone.branch_id}
          zone={editZone}
        />
      )}
    </>
  );
}
