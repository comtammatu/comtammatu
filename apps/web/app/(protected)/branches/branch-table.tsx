"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import {
  ArrowUpRight as IconArrowUpRight,
  Building as IconBuilding,
  ChefHat as IconChefHat,
  MessageCircle as IconMessageCircle,
  Monitor as IconMonitor,
  MonitorUp as IconMonitorUp,
  Pencil as IconPencil,
  QrCode as IconQrCode,
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
  ItemFooter,
  ItemHeader,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import {
  ACTIVE_STATE_LABELS_VI,
  getSiteKindLabelVi,
  resolveSiteKind,
} from "@comtammatu/shared/labels";
import { matchesSearch } from "@lib/search";
import { toggleBranchActive } from "./actions";
import { BranchFormDialog } from "./branch-form-dialog";
import { NetworkConfigDialog } from "./network-config-dialog";
import { toast } from "@comtammatu/ui/components/sonner";
import { confirm } from "@/components/confirm-dialog";
import { Button } from "@comtammatu/ui/components/button";
import { AppEmptyState, AppListFrame, AppToolbar } from "@/components/surface";
import { useFormControlSize } from "@/components/form/control-size";
import { RowActionsMenu } from "@/components/row-actions-menu";

import { messages } from "@lib/messages";
export interface BranchRow {
  id: number;
  name: string;
  code: string | null;
  address: string | null;
  phone: string | null;
  google_review_url: string | null;
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
  const controlSize = useFormControlSize();
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

  function renderBranchActions(branch: BranchRow) {
    const isActive = branch.is_active !== false;
    const isBranchSite = resolveSiteKind(branch) === "branch";

    return (
      <RowActionsMenu
        triggerSize="icon-touch"
        items={[
          ...(isActive && isBranchSite
            ? [
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
                  key: "pickup",
                  label: copy.openPickup,
                  icon: <IconMonitorUp data-icon="inline-start" />,
                  href: `/br/${branch.id}/pickup`,
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

  return (
    <>
      <AppListFrame
        toolbar={
          <AppToolbar
            variant="inline"
            search={
              <InputGroup size={controlSize} className="w-full">
                <InputGroupAddon>
                  <IconSearch />
                </InputGroupAddon>
                <InputGroupInput
                  type="search"
                  placeholder={copy.searchPlaceholder}
                  aria-label={copy.searchPlaceholder}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  inputMode="search"
                />
              </InputGroup>
            }
          />
        }
      >
        {filtered.length === 0 ? (
          <AppEmptyState
            title={search.trim() ? copy.emptySearchTitle : copy.emptyTitle}
            icon={<IconBuilding />}
          />
        ) : (
          <div
            role="list"
            className="grid grid-cols-1 gap-3 p-3 md:grid-cols-2 xl:grid-cols-3"
          >
            {filtered.map((branch) => {
              const isActive = branch.is_active !== false;
              const siteKind = resolveSiteKind(branch);
              const isBranchSite = siteKind === "branch";

              return (
                <Item
                  key={branch.id}
                  role="listitem"
                  variant="outline"
                  className={`h-full flex-nowrap flex-col items-stretch gap-3 p-4 ${isPending ? "opacity-60" : ""}`}
                >
                  <ItemHeader className="items-start">
                    <ItemTitle
                      size="heading"
                      className="line-clamp-none min-w-0 flex-1"
                    >
                      {branch.name}
                    </ItemTitle>
                    <ItemActions className="shrink-0">
                      {renderBranchActions(branch)}
                    </ItemActions>
                  </ItemHeader>
                  <ItemContent className="basis-full gap-2">
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline">
                        {getSiteKindLabelVi(siteKind)}
                      </Badge>
                      <Badge variant={isActive ? "default" : "outline"}>
                        {isActive
                          ? ACTIVE_STATE_LABELS_VI.active
                          : ACTIVE_STATE_LABELS_VI.inactive}
                      </Badge>
                    </div>
                    <ItemDescription>{branch.address || "—"}</ItemDescription>
                    <ItemDescription>{branch.phone || "—"}</ItemDescription>
                  </ItemContent>
                  <ItemFooter className="grid grid-cols-2 gap-2 border-t pt-3">
                    {isBranchSite ? (
                      <>
                        <Button
                          size="touch"
                          className="w-full"
                          aria-label={`${copy.openBranch.long}: ${branch.name}`}
                          disabled={!isActive}
                          render={
                            isActive ? (
                              <Link href={`/br/${branch.id}/dashboard`} />
                            ) : undefined
                          }
                        >
                          <IconArrowUpRight data-icon="inline-start" />
                          {copy.openBranch.short}
                        </Button>
                        <Button
                          variant="outline"
                          size="touch"
                          className="w-full"
                          aria-label={`${copy.openSettings.long}: ${branch.name}`}
                          disabled={!isActive}
                          render={
                            isActive ? (
                              <Link href={`/br/${branch.id}/settings`} />
                            ) : undefined
                          }
                        >
                          <IconSliders data-icon="inline-start" />
                          {copy.openSettings.short}
                        </Button>
                        <Button
                          variant="outline"
                          size="touch"
                          className="w-full"
                          aria-label={`${copy.selfOrder.long}: ${branch.name}`}
                          disabled={!isActive}
                          render={
                            isActive ? (
                              <Link href={`/br/${branch.id}/settings/tables`} />
                            ) : undefined
                          }
                        >
                          <IconQrCode data-icon="inline-start" />
                          {copy.selfOrder.short}
                        </Button>
                        <Button
                          variant="outline"
                          size="touch"
                          className="w-full"
                          aria-label={`${copy.feedback.long}: ${branch.name}`}
                          disabled={!isActive}
                          render={
                            isActive ? (
                              <Link href={`/br/${branch.id}/feedback`} />
                            ) : undefined
                          }
                        >
                          <IconMessageCircle data-icon="inline-start" />
                          {copy.feedback.short}
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="touch"
                        className="col-span-2 w-full"
                        aria-label={`${copy.openInventory.long}: ${branch.name}`}
                        disabled={!isActive}
                        render={
                          isActive ? (
                            <Link href={`/inventory?branchId=${branch.id}`} />
                          ) : undefined
                        }
                      >
                        <IconArrowUpRight data-icon="inline-start" />
                        {copy.openInventory.short}
                      </Button>
                    )}
                  </ItemFooter>
                </Item>
              );
            })}
          </div>
        )}
      </AppListFrame>

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
