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
  ItemGroup,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { confirm } from "@/components/confirm-dialog";
import { AppEmptyState } from "@/components/surface";
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

  function ZoneActions({ zone, touch = false }: { zone: ZoneRow; touch?: boolean }) {
    return (
      <RowActionsMenu
        triggerSize={touch ? "icon-touch" : "icon-lg"}
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

  return (
    <>
      {zones.length === 0 ? (
        <AppEmptyState
          compact
          title={copy.noZonesTitle}
          icon={<IconMapPin className="size-8 text-muted-foreground" />}
        />
      ) : (
        <ItemGroup className="gap-2">
          {zones.map((zone) => (
            <Item
              key={zone.id}
              variant="outline"
              className={isPending ? "opacity-60" : ""}
            >
              <ItemContent>
                <ItemTitle size="heading" className="line-clamp-none w-full">
                  {zone.name}
                </ItemTitle>
                <ItemDescription className="line-clamp-none text-sm leading-6">
                  {copy.zoneOrder}: {zone.sort_order}
                </ItemDescription>
              </ItemContent>
              <ItemActions>
                <ZoneActions zone={zone} touch />
              </ItemActions>
            </Item>
          ))}
        </ItemGroup>
      )}

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
