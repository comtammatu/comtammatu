import Link from "next/link";
import type { ReactNode } from "react";
import { formatVNDateTime } from "@comtammatu/shared/time";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@comtammatu/ui/components/collapsible";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import {
  AppPage,
  AppPageHeader,
  AppSection,
  DescriptionList,
} from "@/components/surface";
import { AuditHistoryList } from "@/components/audit-history-list";
import { BranchOperatorPage } from "@lib/branch-operator/components/branch-operator-page";
import { messages } from "@lib/messages";
import type { StockRequestDetailData } from "@lib/inventory/stock-request-detail-data";
import {
  getStockJourney,
  STOCK_JOURNEY_OUTCOME_LABELS,
  STOCK_JOURNEY_STAGE_LABELS,
  type StockJourneyStage,
} from "@lib/inventory/stock-journey-model";

const STAGES: StockJourneyStage[] = [
  "request",
  "preparation",
  "in_transit",
  "received",
];
const copy = messages.inventory.stockRequests.journey;
const NEXT_ACTION_LABELS = {
  edit: "Hoàn tất yêu cầu",
  prepare: "Xử lý yêu cầu",
  ship: "Giao hàng",
  receive: "Kiểm nhận",
  none: "Theo dõi",
} as const;

function TransferLinks({
  data,
  mode,
  onTransferOpen,
  siteKind,
}: {
  data: StockRequestDetailData;
  mode: "branch" | "central";
  onTransferOpen?: (transferId: number) => void;
  siteKind: "central_supply" | "central_kitchen";
}) {
  const sourceItems = data.items.filter(
    (item) => item.fulfillSiteKind === siteKind,
  );
  const linkedIds = new Set(
    sourceItems.flatMap((item) =>
      item.transferId == null ? [] : [item.transferId],
    ),
  );
  const transfers = data.transfers.filter(
    (transfer) =>
      linkedIds.has(transfer.id) ||
      (!data.items.some((item) => item.transferId === transfer.id) &&
        transfer.fromBranchKind === siteKind),
  );
  if (transfers.length === 0) return null;

  return (
    <>
      {transfers.map((transfer) =>
        onTransferOpen ? (
          <Button
            key={transfer.id}
            type="button"
            variant="link"
            size="sm"
            className="h-auto px-0 font-mono"
            onClick={() => onTransferOpen(transfer.id)}
          >
            {transfer.transferNumber}
          </Button>
        ) : (
          <Button
            key={transfer.id}
            variant="link"
            size="sm"
            className="h-auto px-0 font-mono"
            render={
              <Link
                href={
                  mode === "branch"
                    ? `/br/${data.branchId}/stock/transfer/${transfer.id}`
                    : `/inventory/transfers/${transfer.id}`
                }
              />
            }
          >
            {transfer.transferNumber}
          </Button>
        ),
      )}
    </>
  );
}

function RequestMetaSections({ data }: { data: StockRequestDetailData }) {
  return (
    <>
      <AppSection title={copy.infoTitle}>
        <DescriptionList
          items={[
            {
              term: copy.neededAt,
              description: data.neededAt
                ? formatVNDateTime(data.neededAt)
                : copy.notRequired,
            },
            { term: copy.notes, description: data.notes || "—" },
            {
              term: copy.referenceCode,
              description: (
                <span className="font-mono tabular-nums">
                  {data.requestNumber}
                </span>
              ),
            },
            ...(data.statusReason
              ? [{ term: copy.outcome, description: data.statusReason }]
              : []),
          ]}
        />
      </AppSection>

      <AppSection title={copy.history}>
        <AuditHistoryList logs={data.auditLogs} />
      </AppSection>
    </>
  );
}

export function StockRequestDetailView({
  data,
  mode,
  actions,
  embedded = false,
  onTransferOpen,
}: {
  data: StockRequestDetailData;
  mode: "branch" | "central";
  actions?: ReactNode;
  embedded?: boolean;
  onTransferOpen?: (transferId: number) => void;
}) {
  const stageIndex = STAGES.indexOf(data.journey.stage);
  const backHref =
    mode === "branch"
      ? `/br/${data.branchId}/stock/transfer`
      : "/inventory/transfers?work=request";
  const nextAction =
    mode === "branch" && data.journey.nextAction === "prepare"
      ? "Chờ chuẩn bị hàng"
      : NEXT_ACTION_LABELS[data.journey.nextAction];
  const description = `${data.branchName} · ${STOCK_JOURNEY_STAGE_LABELS[data.journey.stage]} · ${nextAction}`;
  const statusLabel = messages.inventory.stockRequests.statusLabel(data.status);
  const sourceKinds = (["central_supply", "central_kitchen"] as const).filter(
    (siteKind) => data.items.some((item) => item.fulfillSiteKind === siteKind),
  );
  const sourceLabel = (siteKind: (typeof sourceKinds)[number]) =>
    siteKind === "central_supply" ? copy.centralSupply : copy.centralKitchen;
  const workFirst = Boolean(actions) && embedded && mode === "central";
  const sourcesWithTrips = sourceKinds.filter((siteKind) => {
    const sourceItems = data.items.filter(
      (item) => item.fulfillSiteKind === siteKind,
    );
    const linkedIds = new Set(
      sourceItems.flatMap((item) =>
        item.transferId == null ? [] : [item.transferId],
      ),
    );
    return data.transfers.some(
      (transfer) =>
        linkedIds.has(transfer.id) ||
        (!data.items.some((item) => item.transferId === transfer.id) &&
          transfer.fromBranchKind === siteKind),
    );
  });

  const content = workFirst ? (
    <>
      {sourcesWithTrips.length > 0 ? (
        <AppSection title={copy.tripsTitle}>
          <ItemGroup>
            {sourcesWithTrips.map((siteKind) => {
              const sourceItems = data.items.filter(
                (item) => item.fulfillSiteKind === siteKind,
              );
              const linkedIds = new Set(
                sourceItems.flatMap((item) =>
                  item.transferId == null ? [] : [item.transferId],
                ),
              );
              const transfers = data.transfers.filter(
                (transfer) =>
                  linkedIds.has(transfer.id) ||
                  (!data.items.some((item) => item.transferId === transfer.id) &&
                    transfer.fromBranchKind === siteKind),
              );
              return (
                <Item key={siteKind} variant="outline" size="sm">
                  <ItemContent>
                    <ItemTitle>{sourceLabel(siteKind)}</ItemTitle>
                    <ItemDescription className="flex flex-wrap gap-x-3 gap-y-1">
                      <TransferLinks
                        data={data}
                        mode={mode}
                        onTransferOpen={onTransferOpen}
                        siteKind={siteKind}
                      />
                    </ItemDescription>
                  </ItemContent>
                  <Badge variant="secondary">
                    {copy.transferCount(transfers.length)}
                  </Badge>
                </Item>
              );
            })}
          </ItemGroup>
        </AppSection>
      ) : null}

      {actions}

      <Collapsible>
        <CollapsibleTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full justify-start px-0"
            />
          }
        >
          {copy.detailsToggle}
        </CollapsibleTrigger>
        <CollapsibleContent className="flex flex-col gap-4 pt-2">
          <RequestMetaSections data={data} />
        </CollapsibleContent>
      </Collapsible>
    </>
  ) : (
    <>
      {data.submittedAt ? (
        <Item variant="outline">
          <ItemContent>
            <ItemTitle>
              {copy.submittedAt(formatVNDateTime(data.submittedAt))}
            </ItemTitle>
            <ItemDescription>{copy.submittedDescription}</ItemDescription>
          </ItemContent>
        </Item>
      ) : null}

      <AppSection title={copy.progressTitle}>
        <ItemGroup>
          {STAGES.map((stage, index) => {
            const completed = index < stageIndex;
            const active = index === stageIndex;
            return (
              <Item key={stage} variant="outline">
                <ItemContent>
                  <ItemTitle>
                    {index + 1}. {STOCK_JOURNEY_STAGE_LABELS[stage]}
                  </ItemTitle>
                  <ItemDescription>
                    {completed
                      ? copy.completed
                      : active
                        ? copy.active
                        : copy.upcoming}
                  </ItemDescription>
                </ItemContent>
                <Badge
                  variant={
                    completed ? "success" : active ? "default" : "secondary"
                  }
                >
                  {completed
                    ? copy.completedShort
                    : active
                      ? copy.activeShort
                      : copy.upcomingShort}
                </Badge>
              </Item>
            );
          })}
        </ItemGroup>
        {data.journey.outcome ? (
          <Badge variant="warning">
            {STOCK_JOURNEY_OUTCOME_LABELS[data.journey.outcome]}
          </Badge>
        ) : null}
      </AppSection>

      <AppSection title={copy.sourceProgressTitle}>
        <ItemGroup>
          {sourceKinds.map((siteKind) => {
            const sourceItems = data.items.filter(
              (item) => item.fulfillSiteKind === siteKind,
            );
            const linkedIds = new Set(
              sourceItems.flatMap((item) =>
                item.transferId == null ? [] : [item.transferId],
              ),
            );
            const transfers = data.transfers.filter(
              (transfer) =>
                linkedIds.has(transfer.id) ||
                (!data.items.some((item) => item.transferId === transfer.id) &&
                  transfer.fromBranchKind === siteKind),
            );
            const sourceJourney = getStockJourney({
              requestStatus: data.status,
              items: sourceItems,
              transfers,
            });
            return (
              <Item key={siteKind} variant="outline">
                <ItemContent>
                  <ItemTitle>
                    {copy.sourceItemSummary(
                      sourceLabel(siteKind),
                      sourceItems.length,
                    )}
                  </ItemTitle>
                  <ItemDescription>
                    {STOCK_JOURNEY_STAGE_LABELS[sourceJourney.stage]}
                  </ItemDescription>
                  <TransferLinks
                    data={data}
                    mode={mode}
                    onTransferOpen={onTransferOpen}
                    siteKind={siteKind}
                  />
                </ItemContent>
                <Badge variant="secondary">
                  {copy.transferCount(
                    sourceJourney.activeTransfers || transfers.length,
                  )}
                </Badge>
              </Item>
            );
          })}
        </ItemGroup>
      </AppSection>

      {sourceKinds.map((siteKind) => (
        <AppSection
          key={siteKind}
          title={`${copy.ingredientsTitle} · ${sourceLabel(siteKind)}`}
        >
          <ItemGroup>
            {data.items
              .filter((item) => item.fulfillSiteKind === siteKind)
              .map((item) => (
                <Item key={item.id} variant="outline">
                  <ItemContent>
                    <ItemTitle>{item.ingredientName}</ItemTitle>
                    <ItemDescription>
                      {item.quantity} {item.unitLabel}
                    </ItemDescription>
                  </ItemContent>
                  <Badge variant="secondary">
                    {messages.inventory.stockRequests.statusLabel(item.status)}
                  </Badge>
                </Item>
              ))}
          </ItemGroup>
        </AppSection>
      ))}

      <RequestMetaSections data={data} />

      {actions}
    </>
  );

  if (embedded) return content;

  if (mode === "branch") {
    return (
      <BranchOperatorPage
        title={copy.detailTitle}
        description={description}
        badge={{ children: statusLabel }}
        action={
          <Button variant="ghost" render={<Link href={backHref} />}>
            {copy.back}
          </Button>
        }
      >
        {content}
      </BranchOperatorPage>
    );
  }

  return (
    <AppPage width="xwide" density="compact">
      <AppPageHeader
        title={copy.detailTitle}
        description={description}
        badge={{ children: statusLabel }}
        actions={
          <Button variant="ghost" render={<Link href={backHref} />}>
            {copy.back}
          </Button>
        }
      />
      {content}
    </AppPage>
  );
}
