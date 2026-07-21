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
import { ACTIVE_STATE_LABELS_VI } from "@comtammatu/shared/labels";
import { ACTIONS_VI } from "@comtammatu/shared/messages";
import { matchesSearch } from "@lib/search";
import { toggleBranchActive } from "./actions";
import { BranchFormDialog } from "./branch-form-dialog";
import { NetworkConfigDialog } from "./network-config-dialog";
import { toast } from "@comtammatu/ui/components/sonner";
import { confirm } from "@comtammatu/ui/components/confirm-dialog";
import { Button } from "@comtammatu/ui/components/button";
import { AppDialog } from "@/components/form";
import { AppEmptyState } from "@/components/surface";
import { RowActionsMenu } from "@/components/row-actions-menu";

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
  const [feedbackOpen, setFeedbackOpen] = useState(false);
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

  function renderBranchActions(branch: BranchRow) {
    const isActive = branch.is_active !== false;

    return (
      <RowActionsMenu
        triggerSize="icon-touch"
        items={[
          ...(isActive
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
      {filtered.length === 0 ? (
        <AppEmptyState
          title={search.trim() ? copy.emptySearchTitle : copy.emptyTitle}
          icon={<IconBuilding />}
        />
      ) : (
        <div
          role="list"
          className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4"
        >
          {filtered.map((branch) => {
            const isActive = branch.is_active !== false;

            return (
              <Item
                key={branch.id}
                role="listitem"
                variant="outline"
                className={`items-start gap-3 p-3 ${isPending ? "opacity-60" : ""}`}
              >
                <ItemHeader>
                  <div className="flex min-w-0 items-center gap-2">
                    <ItemTitle size="heading" className="min-w-0 truncate">
                      {branch.name}
                    </ItemTitle>
                    <Badge variant={isActive ? "default" : "outline"}>
                      {isActive
                        ? ACTIVE_STATE_LABELS_VI.active
                        : ACTIVE_STATE_LABELS_VI.inactive}
                    </Badge>
                  </div>
                  <ItemActions>{renderBranchActions(branch)}</ItemActions>
                </ItemHeader>
                <ItemContent className="basis-full">
                  <ItemDescription>{branch.address || "—"}</ItemDescription>
                  <ItemDescription>{branch.phone || "—"}</ItemDescription>
                </ItemContent>
                <ItemFooter className="grid grid-cols-2 gap-2 border-t pt-3">
                  <Button
                    size="touch"
                    className="w-full"
                    disabled={!isActive}
                    render={
                      isActive ? <Link href={`/br/${branch.id}`} /> : undefined
                    }
                  >
                    <IconArrowUpRight data-icon="inline-start" />
                    {copy.openBranch}
                  </Button>
                  <Button
                    variant="outline"
                    size="touch"
                    className="w-full"
                    disabled={!isActive}
                    render={
                      isActive ? (
                        <Link href={`/br/${branch.id}/settings`} />
                      ) : undefined
                    }
                  >
                    <IconSliders data-icon="inline-start" />
                    {copy.openSettings}
                  </Button>
                  <Button
                    variant="outline"
                    size="touch"
                    className="w-full"
                    disabled={!isActive}
                    render={
                      isActive ? (
                        <Link href={`/br/${branch.id}/settings/tables`} />
                      ) : undefined
                    }
                  >
                    <IconQrCode data-icon="inline-start" />
                    {copy.selfOrder}
                  </Button>
                  <Button
                    variant="outline"
                    size="touch"
                    className="w-full"
                    onClick={() => setFeedbackOpen(true)}
                  >
                    <IconMessageCircle data-icon="inline-start" />
                    {copy.feedback}
                  </Button>
                </ItemFooter>
              </Item>
            );
          })}
        </div>
      )}

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

      <AppDialog
        open={feedbackOpen}
        onOpenChange={setFeedbackOpen}
        title={copy.feedbackComingSoonTitle}
        description={copy.feedbackComingSoonDescription}
        footer={
          <Button size="touch" onClick={() => setFeedbackOpen(false)}>
            {ACTIONS_VI.close}
          </Button>
        }
      />
    </>
  );
}
