import { notFound } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight as IconArrowRight,
  ChevronRight as IconChevronRight,
  CircleCheck as IconCircleCheck,
  PackagePlus as IconPackageImport,
  Send as IconSend,
} from "lucide-react";
import type { ElementType } from "react";
import { ACTIONS_VI } from "@comtammatu/shared/messages";
import { formatVNDate } from "@comtammatu/shared/time";
import { Button } from "@comtammatu/ui/components/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { AppEmptyState } from "@/components/surface";
import { StatusBadge } from "@/components/status-badge";
import { loadAuthState } from "@/_lib/auth";
import { resolveBranchContext } from "@/_lib/branch-context";
import { fetchStockTransfers } from "@/(protected)/inventory/transfer-actions";
import {
  classifyTransfer,
  compareTransferQueue,
  type TransferListRow,
  type TransferTab,
} from "@/(protected)/inventory/transfers/transfer-list-model";
import { isTransferReceiveReady } from "@lib/inventory/transfer-detail-model";
import {
  BranchOperatorPage,
  BranchOperatorPanel,
} from "@lib/branch-operator/components/branch-operator-page";
import { messages } from "@lib/messages";
import { parseOperatorBranchId } from "../../../_lib/parse-branch-id";

interface PageProps {
  params: Promise<{ branchId: string }>;
  searchParams: Promise<{ queue?: string | string[] }>;
}

const copy = messages.inventory.transfer;

const sectionMeta = {
  receive: {
    title: copy.list.tabs.receive,
    description: copy.list.receiveEmptyHint,
    icon: IconPackageImport,
    emptyTitle: copy.list.noReceiveTransfers,
    emptyDescription: copy.list.receiveEmptyHint,
  },
  dispatch: {
    title: copy.list.tabs.dispatch,
    description: copy.list.dispatchEmptyHint,
    icon: IconSend,
    emptyTitle: copy.list.noDispatchTransfers,
    emptyDescription: copy.list.dispatchEmptyHint,
  },
  history: {
    title: copy.list.tabs.history,
    description: copy.list.historyEmptyHint,
    icon: IconCircleCheck,
    emptyTitle: copy.list.noHistory,
    emptyDescription: copy.list.historyEmptyHint,
  },
} satisfies Record<
  TransferTab,
  {
    title: string;
    description: string;
    icon: ElementType;
    emptyTitle: string;
    emptyDescription: string;
  }
>;

function groupTransfers({
  rows,
  branchId,
  userRole,
}: {
  rows: TransferListRow[];
  branchId: number;
  userRole: Parameters<typeof classifyTransfer>[4];
}) {
  const groups: Record<TransferTab, TransferListRow[]> = {
    receive: [],
    dispatch: [],
    history: [],
  };

  for (const row of rows) {
    groups[
      classifyTransfer(
        row.status,
        branchId,
        row.from_branch_id,
        row.to_branch_id,
        userRole,
      )
    ].push(row);
  }

  for (const key of Object.keys(groups) as TransferTab[]) {
    groups[key].sort(compareTransferQueue);
  }

  return groups;
}

function TransferCard({
  row,
  href,
  icon: Icon,
}: {
  row: TransferListRow;
  href: string;
  icon: ElementType;
}) {
  const movementDate = row.shipped_at ?? row.received_at ?? row.created_at;

  return (
    <Item variant="outline" className="min-h-16" render={<Link href={href} />}>
      <ItemMedia
        variant="icon"
        className="rounded-md bg-primary/10 p-2 text-primary"
      >
        <Icon />
      </ItemMedia>
      <ItemContent className="min-w-0">
        <ItemTitle className="line-clamp-none w-full justify-between gap-2">
          <span className="min-w-0 truncate font-mono tabular-nums">
            {row.transfer_number}
          </span>
          <StatusBadge domain="inventory" value={row.status} size="sm" />
        </ItemTitle>
        <ItemDescription className="line-clamp-none">
          <span className="inline-flex max-w-full items-center gap-1">
            <span className="truncate">{row.from_branch_name}</span>
            <IconArrowRight className="size-3 shrink-0" />
            <span className="truncate">{row.to_branch_name}</span>
          </span>
        </ItemDescription>
        <ItemDescription>
          <span className="font-mono tabular-nums">
            {formatVNDate(movementDate)}
          </span>
        </ItemDescription>
      </ItemContent>
      <ItemActions className="ml-auto">
        <IconChevronRight className="size-4 text-muted-foreground" />
      </ItemActions>
    </Item>
  );
}

function TransferSection({
  tab,
  rows,
  branchId,
}: {
  tab: TransferTab;
  rows: TransferListRow[];
  branchId: number;
}) {
  const meta = sectionMeta[tab];

  return (
    <BranchOperatorPanel
      title={meta.title}
      description={meta.description}
      icon={meta.icon}
      tone={tab === "receive" ? "info" : "default"}
      size="sm"
    >
      {rows.length === 0 ? (
        <AppEmptyState
          compact
          title={meta.emptyTitle}
          description={meta.emptyDescription}
          icon={<meta.icon />}
        />
      ) : (
        <ItemGroup className="gap-2">
          {rows.map((row) => (
            <TransferCard
              key={row.id}
              row={row}
              href={
                tab === "receive" && isTransferReceiveReady(row.status)
                  ? `/br/${branchId}/stock/receive/${row.id}`
                  : `/br/${branchId}/stock/transfer/${row.id}`
              }
              icon={meta.icon}
            />
          ))}
        </ItemGroup>
      )}
    </BranchOperatorPanel>
  );
}

export default async function OperatorStockTransferPage({
  params,
  searchParams,
}: PageProps) {
  const { branchId: rawBranchId } = await params;
  const query = await searchParams;
  const branchId = parseOperatorBranchId(rawBranchId);
  if (branchId == null) notFound();
  const queueParam = Array.isArray(query.queue) ? query.queue[0] : query.queue;
  const receiveOnly = queueParam === "receive";

  const { supabase, claims } = await loadAuthState();
  if (!(await resolveBranchContext(supabase, claims, branchId))) notFound();

  const transferResult = await fetchStockTransfers(branchId);
  const rows: TransferListRow[] = transferResult.success
    ? ((transferResult.data ?? []) as TransferListRow[])
    : [];
  const groups = groupTransfers({
    rows,
    branchId,
    userRole: claims.user_role,
  });

  return (
    <BranchOperatorPage
      title={
        receiveOnly ? copy.receiveKitchenTitle : copy.internalTransferTitle
      }
      description={
        receiveOnly
          ? copy.list.receiveEmptyHint
          : messages.inventory.operatorFlow.transferListDescription
      }
      hideHeaderOnMobile
    >
      {transferResult.success ? (
        <>
          <TransferSection
            tab="receive"
            rows={groups.receive}
            branchId={branchId}
          />
          {!receiveOnly ? (
            <>
              <TransferSection
                tab="dispatch"
                rows={groups.dispatch}
                branchId={branchId}
              />
              <TransferSection
                tab="history"
                rows={groups.history}
                branchId={branchId}
              />
            </>
          ) : null}
        </>
      ) : (
        <AppEmptyState
          mode="error"
          compact
          title={copy.loadFailed}
          description={transferResult.error ?? copy.loadFailed}
        >
          <Button size="touch" render={<Link href={`/br/${branchId}/stock`} />}>
            {ACTIONS_VI.back}
          </Button>
        </AppEmptyState>
      )}
    </BranchOperatorPage>
  );
}
