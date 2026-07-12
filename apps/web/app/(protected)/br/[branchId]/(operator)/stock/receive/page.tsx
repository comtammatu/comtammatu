import { notFound } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight as IconArrowRight,
  ChevronRight as IconChevronRight,
  PackagePlus as IconPackageImport,
} from "lucide-react";
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
} from "@lib/inventory/transfer-list-model";
import { isTransferReceiveReady } from "@lib/inventory/transfer-detail-model";
import { BranchOperatorPage } from "@lib/branch-operator/components/branch-operator-page";
import { messages } from "@lib/messages";
import { parseOperatorBranchId } from "../../../_lib/parse-branch-id";

interface PageProps {
  params: Promise<{ branchId: string }>;
}

const copy = messages.inventory.transfer;

function getInboundTransfers({
  rows,
  branchId,
  userRole,
}: {
  rows: TransferListRow[];
  branchId: number;
  userRole: Parameters<typeof classifyTransfer>[4];
}) {
  return rows
    .filter(
      (row) =>
        classifyTransfer(
          row.status,
          branchId,
          row.from_branch_id,
          row.to_branch_id,
          userRole,
        ) === "receive",
    )
    .sort(compareTransferQueue);
}

function TransferCard({ row, href }: { row: TransferListRow; href: string }) {
  const movementDate = row.shipped_at ?? row.received_at ?? row.created_at;

  return (
    <Item asChild variant="outline" className="min-h-16">
      <Link href={href}>
        <ItemMedia
          variant="icon"
          className="rounded-md bg-primary/10 p-2 text-primary"
        >
          <IconPackageImport />
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
      </Link>
    </Item>
  );
}

export default async function OperatorStockReceivePage({ params }: PageProps) {
  const { branchId: rawBranchId } = await params;
  const branchId = parseOperatorBranchId(rawBranchId);
  if (branchId == null) notFound();

  const { supabase, claims } = await loadAuthState();
  const context = await resolveBranchContext(supabase, claims, branchId);
  if (!context) notFound();

  const transferResult = await fetchStockTransfers(branchId);
  const rows: TransferListRow[] = transferResult.success
    ? ((transferResult.data ?? []) as TransferListRow[])
    : [];
  const inbound = getInboundTransfers({
    rows,
    branchId,
    userRole: claims.user_role,
  });

  return (
    <BranchOperatorPage
      title={copy.receiveKitchenTitle}
      backHref={`/br/${branchId}/stock`}
      backLabel="Tồn"
    >
      {transferResult.success ? (
        inbound.length === 0 ? (
          <AppEmptyState
            compact
            title={copy.list.noReceiveTransfers}
            description={copy.list.receiveEmptyHint}
            icon={<IconPackageImport />}
          />
        ) : (
          <ItemGroup className="gap-2">
            {inbound.map((row) => (
              <TransferCard
                key={row.id}
                row={row}
                href={
                  isTransferReceiveReady(row.status)
                    ? `/br/${branchId}/stock/receive/${row.id}`
                    : `/br/${branchId}/stock/transfer/${row.id}`
                }
              />
            ))}
          </ItemGroup>
        )
      ) : (
        <AppEmptyState
          mode="error"
          compact
          title={copy.loadFailed}
          description={transferResult.error ?? copy.loadFailed}
        >
          <Button size="touch" asChild>
            <Link href={`/br/${branchId}/stock`}>{ACTIONS_VI.back}</Link>
          </Button>
        </AppEmptyState>
      )}
    </BranchOperatorPage>
  );
}
