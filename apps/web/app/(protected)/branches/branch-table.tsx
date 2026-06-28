"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import {
  Building as IconBuilding,
  ChefHat as IconChefHat,
  Ellipsis as IconDots,
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
import { Button } from "@comtammatu/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@comtammatu/ui/components/dropdown-menu";
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

  function BranchActions({ branch }: { branch: BranchRow }) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-lg">
            <IconDots className="size-4" />
            <span className="sr-only">Menu</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {branch.is_active !== false && (
            <>
              <DropdownMenuItem asChild>
                <Link href={`/br/${branch.id}/settings`}>
                  <IconSliders className="mr-2 size-4" />
                  {messages.settings.branch.hubTitle}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href={`/br/${branch.id}/pos`}>
                  <IconMonitor className="mr-2 size-4" />
                  {copy.openPos}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={`/br/${branch.id}/kds`}>
                  <IconChefHat className="mr-2 size-4" />
                  {copy.openKds}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={`/br/${branch.id}/runner`}>
                  <IconMonitorUp className="mr-2 size-4" />
                  {copy.openRunner}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuItem onClick={() => setEditBranch(branch)}>
            <IconPencil className="mr-2 size-4" />
            {messages.settings.common.edit}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleToggleActive(branch)}>
            {branch.is_active !== false ? (
              <>
                <IconToggleLeft className="mr-2 size-4" />
                {copy.deactivate}
              </>
            ) : (
              <>
                <IconToggleRight className="mr-2 size-4" />
                {copy.activate}
              </>
            )}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setNetworkBranch(branch)}>
            <IconShield className="mr-2 size-4" />
            {copy.networkGateway}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
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
      render: (branch) => <BranchActions branch={branch} />,
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
              <BranchActions branch={branch} />
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
