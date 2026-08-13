"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { TicketPercent as IconTicket } from "lucide-react";
import { FORM_VI, PROMOTIONS_VI } from "@comtammatu/shared/messages";
import { formatVNDate } from "@comtammatu/shared/time";
import { Button } from "@comtammatu/ui/components/button";
import { InteractiveCard } from "@comtammatu/ui/components/interactive-card";
import { toast } from "@comtammatu/ui/components/sonner";
import {
  OWNER_SHELL_BREAKPOINT,
  useIsMobile,
} from "@comtammatu/ui/hooks/use-mobile";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import {
  RowActionsContextMenuItems,
  RowActionsMenu,
  type RowActionItem,
} from "@/components/row-actions-menu";
import { StatusBadge } from "@/components/status-badge";
import { AppListFrame } from "@/components/surface";
import { promotionKindLabel } from "@lib/promotions/kinds";
import { setPromotionStatus } from "./actions";

export type PromotionListRow = {
  id: number;
  name: string;
  kind: string;
  status: string;
  discountType: string | null;
  discountValue: number | null;
  reusableCode: string | null;
  startsAt: string | null;
  endsAt: string | null;
};

export function PromotionsListClient({ rows }: { rows: PromotionListRow[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function setStatus(
    row: PromotionListRow,
    status: "active" | "paused" | "ended",
  ) {
    startTransition(async () => {
      const result = await setPromotionStatus({ id: row.id, status });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(PROMOTIONS_VI.saved);
      router.refresh();
    });
  }

  function rowActions(row: PromotionListRow): RowActionItem[] {
    const items: RowActionItem[] = [
      {
        key: "edit",
        label: PROMOTIONS_VI.editTitle,
        href: `/promotions/${String(row.id)}`,
      },
    ];
    if (row.status !== "ended") {
      if (row.status !== "active") {
        items.push({
          key: "activate",
          label: PROMOTIONS_VI.activate,
          disabled: isPending,
          onSelect: () => setStatus(row, "active"),
        });
      } else {
        items.push({
          key: "pause",
          label: PROMOTIONS_VI.pause,
          disabled: isPending,
          onSelect: () => setStatus(row, "paused"),
        });
      }
      items.push({
        key: "end",
        label: PROMOTIONS_VI.end,
        disabled: isPending,
        destructive: true,
        separatorBefore: true,
        onSelect: () => setStatus(row, "ended"),
      });
    }
    return items;
  }

  const columns: DataTableColumn<PromotionListRow>[] = [
    {
      key: "name",
      header: PROMOTIONS_VI.nameLabel,
      render: (row) => (
        <Button
          variant="link"
          className="h-auto p-0 font-medium"
          render={<Link href={`/promotions/${String(row.id)}`} />}
        >
          {row.name}
        </Button>
      ),
    },
    {
      key: "kind",
      header: PROMOTIONS_VI.kindLabel,
      render: (row) => promotionKindLabel(row.kind),
    },
    {
      key: "code",
      header: PROMOTIONS_VI.codeLabel,
      className: "font-mono",
      render: (row) => row.reusableCode ?? "—",
    },
    {
      key: "status",
      header: PROMOTIONS_VI.statusLabel,
      render: (row) => (
        <StatusBadge domain="promotion" value={row.status} />
      ),
    },
    {
      key: "actions",
      header: <span className="sr-only">{FORM_VI.action}</span>,
      className: "w-12 text-right",
      render: (row) => (
        <div
          className="flex justify-end"
          onClick={(event) => event.stopPropagation()}
        >
          <RowActionsMenu
            label={`${FORM_VI.action} ${row.name}`}
            items={rowActions(row)}
            triggerSize="icon-sm"
          />
        </div>
      ),
    },
  ];

  return (
    <AppListFrame>
      <DataTable
        columns={columns}
        data={rows}
        getRowKey={(row) => row.id}
        emptyTitle={PROMOTIONS_VI.emptyTitle}
        emptyDescription={PROMOTIONS_VI.emptyDescription}
        emptyIcon={<IconTicket className="size-8 text-muted-foreground" />}
        rowClassName={() => (isPending ? "opacity-60" : undefined)}
        onRowClick={(row) => router.push(`/promotions/${String(row.id)}`)}
        renderRowContextMenu={(row) => (
          <RowActionsContextMenuItems items={rowActions(row)} />
        )}
        mobileCardRender={(row) => (
          <PromotionMobileCard
            row={row}
            actions={rowActions(row)}
            onOpen={() => router.push(`/promotions/${String(row.id)}`)}
          />
        )}
      />
    </AppListFrame>
  );
}

function PromotionMobileCard({
  row,
  actions,
  onOpen,
}: {
  row: PromotionListRow;
  actions: RowActionItem[];
  onOpen: () => void;
}) {
  const isTouchLayout = useIsMobile(OWNER_SHELL_BREAKPOINT);

  return (
    <InteractiveCard
      minHeight="mobile"
      padding="default"
      role="button"
      tabIndex={0}
      className="w-full flex-col items-stretch gap-3 text-left"
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold">{row.name}</span>
            <StatusBadge domain="promotion" value={row.status} />
          </div>
          <p className="mt-1 truncate text-sm text-muted-foreground">
            {promotionKindLabel(row.kind)}
            {row.reusableCode ? ` · ${row.reusableCode}` : ""}
          </p>
        </div>
        <div
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <RowActionsMenu
            items={actions}
            label={`${FORM_VI.action} ${row.name}`}
            triggerSize={isTouchLayout ? "icon-touch" : "icon"}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div className="min-w-0">
          <span className="block text-xs text-muted-foreground">
            {PROMOTIONS_VI.startsLabel}
          </span>
          <span className="font-mono text-sm tabular-nums">
            {row.startsAt ? formatVNDate(row.startsAt) : "—"}
          </span>
        </div>
        <div className="min-w-0">
          <span className="block text-xs text-muted-foreground">
            {PROMOTIONS_VI.endsLabel}
          </span>
          <span className="font-mono text-sm tabular-nums">
            {row.endsAt ? formatVNDate(row.endsAt) : "—"}
          </span>
        </div>
      </div>
    </InteractiveCard>
  );
}
