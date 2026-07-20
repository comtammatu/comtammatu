"use client";

import { useMemo, useState, useTransition } from "react";
import {
  Building as IconBuilding,
  ChefHat as IconChefHat,
  Monitor as IconMonitor,
  MonitorUp as IconMonitorUp,
  Pencil as IconPencil,
  Search as IconSearch,
  Shield as IconShield,
  SlidersHorizontal as IconSliders,
  ToggleLeft as IconToggleLeft,
  ToggleRight as IconToggleRight,
} from "lucide-react";
import { Badge } from "@comtammatu/ui/components/badge";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@comtammatu/ui/components/input-group";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { ACTIVE_STATE_LABELS_VI } from "@comtammatu/shared/labels";
import { matchesSearch } from "@lib/search";
import { toggleBranchActive } from "./actions";
import { BranchFormDialog } from "./branch-form-dialog";
import { NetworkConfigDialog } from "./network-config-dialog";
import { toast } from "@comtammatu/ui/components/sonner";
import { confirm } from "@comtammatu/ui/components/confirm-dialog";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import { RowActionsMenu } from "@/components/row-actions-menu";

import { FORM_VI } from "@comtammatu/shared/messages";
import { messages } from "@lib/messages";
export interface BranchRow {
  id: number;
  name: string;
  code: string | null;
  address: string | null;
  phone: string | null;
  is_active: boolean | null;
  branch_kind: string | null;
}

interface BranchTableProps {
  branches: BranchRow[];
}

export function BranchTable({ branches }: BranchTableProps) {
  const [editBranch, setEditBranch] = useState<BranchRow | null>(null);
  const [networkBranch, setNetworkBranch] = useState<BranchRow | null>(null);
  const [search, setSearch] = useState("");
  const [isPending, startTransition] = useTransition();
  const copy = messages.settings.branchTable;

  const filtered = useMemo(() => {
    const q = search.trim();
    if (!q) return branches;
    return branches.filter((branch) =>
      matchesSearch([branch.name, branch.code, branch.address], q),
    );
  }, [branches, search]);

  async function handleToggleActive(branch: BranchRow) {
    if (branch.is_active !== false) {
      const ok = await confirm({
        title: copy.deactivateTitle,
        description: copy.deactivateDescription,
        details: [{ label: copy.operationPoint, value: branch.name }],
        confirmText: copy.deactivate,
        variant: "destructive",
      });
      if (!ok) return;
    }
    startTransition(async () => {
      const result = await toggleBranchActive({ id: branch.id });
      if (!result.success) {
        toast.error(result.error);
      }
    });
  }

  function renderBranchActions(branch: BranchRow, touch = false) {
    const isActive = branch.is_active !== false;

    return (
      <RowActionsMenu
        triggerSize={touch ? "icon-touch" : "icon-lg"}
        items={[
          ...(isActive
            ? [
                {
                  key: "settings",
                  label: messages.settings.branch.landingTitle,
                  icon: <IconSliders data-icon="inline-start" />,
                  href: `/br/${branch.id}/settings`,
                },
                {
                  key: "pos",
                  label: copy.openPos,
                  icon: <IconMonitor data-icon="inline-start" />,
                  href: `/br/${branch.id}/pos`,
                  separatorBefore: true,
                },
                {
                  key: "kds",
                  label: copy.openKds,
                  icon: <IconChefHat data-icon="inline-start" />,
                  href: `/br/${branch.id}/kds`,
                },
                {
                  key: "runner",
                  label: copy.openRunner,
                  icon: <IconMonitorUp data-icon="inline-start" />,
                  href: `/br/${branch.id}/runner`,
                },
              ]
            : []),
          {
            key: "edit",
            label: messages.settings.common.edit,
            icon: <IconPencil data-icon="inline-start" />,
            separatorBefore: isActive,
            onSelect: () => setEditBranch(branch),
          },
          {
            key: isActive ? "deactivate" : "activate",
            label: isActive ? copy.deactivate : copy.activate,
            icon: isActive ? (
              <IconToggleLeft data-icon="inline-start" />
            ) : (
              <IconToggleRight data-icon="inline-start" />
            ),
            onSelect: () => void handleToggleActive(branch),
          },
          {
            key: "network",
            label: copy.networkGateway,
            icon: <IconShield data-icon="inline-start" />,
            separatorBefore: true,
            onSelect: () => setNetworkBranch(branch),
          },
        ]}
      />
    );
  }

  const columns: DataTableColumn<BranchRow>[] = [
    {
      key: "name",
      header: copy.operationPoint,
      render: (branch) => <span className="font-medium">{branch.name}</span>,
    },
    {
      key: "address",
      header: copy.address,
      className: "max-w-xs text-muted-foreground",
      render: (branch) => (
        <span className="block truncate" title={branch.address ?? undefined}>
          {branch.address || "—"}
        </span>
      ),
    },
    {
      key: "phone",
      header: copy.phone,
      className: "text-muted-foreground",
      render: (branch) => branch.phone || "—",
    },
    {
      key: "status",
      header: FORM_VI.status,
      render: (branch) => (
        <Badge variant={branch.is_active !== false ? "default" : "outline"}>
          {branch.is_active !== false
            ? ACTIVE_STATE_LABELS_VI.active
            : ACTIVE_STATE_LABELS_VI.inactive}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "",
      className: "w-12",
      render: (branch) => renderBranchActions(branch),
    },
  ];

  return (
    <>
      <InputGroup className="h-12 sm:h-10">
        <InputGroupAddon>
          <IconSearch />
        </InputGroupAddon>
        <InputGroupInput
          type="text"
          placeholder={copy.searchPlaceholder}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          inputMode="search"
        />
      </InputGroup>
      <DataTable
        columns={columns}
        data={filtered}
        getRowKey={(branch) => branch.id}
        emptyTitle={search.trim() ? copy.emptySearchTitle : copy.emptyTitle}
        emptyMode={search.trim() ? "no-results" : "no-data"}
        emptyIcon={
          <IconBuilding className="mx-auto size-8 text-muted-foreground" />
        }
        rowClassName={() => (isPending ? "opacity-60" : undefined)}
        mobileCardRender={(branch) => (
          <Item variant="outline" className={isPending ? "opacity-60" : ""}>
            <ItemContent>
              <ItemTitle>{branch.name}</ItemTitle>
              <ItemDescription>{branch.address || "—"}</ItemDescription>
              <ItemDescription>{branch.phone || "—"}</ItemDescription>
              <Badge
                variant={branch.is_active !== false ? "default" : "outline"}
              >
                {branch.is_active !== false
                  ? ACTIVE_STATE_LABELS_VI.active
                  : ACTIVE_STATE_LABELS_VI.inactive}
              </Badge>
            </ItemContent>
            <ItemActions>
              {renderBranchActions(branch, true)}
            </ItemActions>
          </Item>
        )}
      />

      <BranchFormDialog
        open={!!editBranch}
        onOpenChange={(open) => !open && setEditBranch(null)}
        branch={editBranch}
      />

      {networkBranch && (
        <NetworkConfigDialog
          open={!!networkBranch}
          onOpenChange={(open) => !open && setNetworkBranch(null)}
          branch={{ id: networkBranch.id, name: networkBranch.name }}
        />
      )}
    </>
  );
}
