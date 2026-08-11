"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft as IconArrowLeft } from "lucide-react";
import { ACTIONS_VI } from "@comtammatu/shared/messages";
import { formatVNDateTime } from "@comtammatu/shared/time";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  OWNER_SHELL_BREAKPOINT,
  useIsMobile,
} from "@comtammatu/ui/hooks/use-mobile";
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
import {
  BranchOperatorControlBar,
  BranchOperatorPage,
} from "@lib/branch-operator/components/branch-operator-page";
import { messages } from "@lib/messages";
import type { StockRequestDetailData } from "@lib/inventory/stock-request-detail-data";
import {
  BRANCH_STOCK_REQUEST_STEP_LABELS,
  getBranchStockRequestProgress,
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

function transfersForSite(
  data: StockRequestDetailData,
  siteKind: "central_supply" | "central_kitchen",
) {
  const sourceItems = data.items.filter(
    (item) => item.fulfillSiteKind === siteKind,
  );
  const linkedIds = new Set(
    sourceItems.flatMap((item) =>
      item.transferId == null ? [] : [item.transferId],
    ),
  );
  return data.transfers.filter(
    (transfer) =>
      linkedIds.has(transfer.id) ||
      (!data.items.some((item) => item.transferId === transfer.id) &&
        transfer.fromBranchKind === siteKind),
  );
}

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
  const transfers = transfersForSite(data, siteKind);
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

function BranchRequestDetailContent({
  data,
  actions,
}: {
  data: StockRequestDetailData;
  actions?: ReactNode;
}) {
  const isTouchLayout = useIsMobile(OWNER_SHELL_BREAKPOINT);
  const progress = getBranchStockRequestProgress({
    requestStatus: data.status,
    items: data.items,
    transfers: data.transfers.map((transfer) => ({
      id: transfer.id,
      status: transfer.status,
    })),
  });
  const receiveHref =
    progress.firstReceiveTransferId != null
      ? `/br/${data.branchId}/stock/receive/${progress.firstReceiveTransferId}`
      : null;

  return (
    <>
      {data.submittedAt ? (
        <Item variant="outline">
          <ItemContent>
            <ItemTitle>
              {copy.submittedAt(formatVNDateTime(data.submittedAt))}
            </ItemTitle>
            <ItemDescription>{copy.branchSubmittedDescription}</ItemDescription>
          </ItemContent>
        </Item>
      ) : null}

      <AppSection title={copy.progressTitle}>
        <ItemGroup>
          {progress.steps.map((step, index) => {
            const completed = progress.allDone || index < progress.currentIndex;
            const active = !progress.allDone && index === progress.currentIndex;
            return (
              <Item key={step} variant="outline">
                <ItemContent>
                  <ItemTitle>
                    {index + 1}. {BRANCH_STOCK_REQUEST_STEP_LABELS[step]}
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
        {progress.outcome ? (
          <Badge variant="warning">
            {STOCK_JOURNEY_OUTCOME_LABELS[progress.outcome]}
          </Badge>
        ) : null}
      </AppSection>

      {/* Step 1 detail: requested lines only — no line/source central status. */}
      <AppSection title={copy.ingredientsTitle}>
        <ItemGroup>
          {data.items.map((item) => (
            <Item key={item.id} variant="outline">
              <ItemContent>
                <ItemTitle>{item.ingredientName}</ItemTitle>
                <ItemDescription>
                  {item.quantity} {item.unitLabel}
                </ItemDescription>
              </ItemContent>
            </Item>
          ))}
        </ItemGroup>
      </AppSection>

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
          ]}
        />
      </AppSection>

      {/* Step 1 actions (edit/cancel) — component self-hides when not editable. */}
      {actions}

      {/* Step 4: confirm receive — no DC prep detail. */}
      {receiveHref != null ? (
        <Button
          size={isTouchLayout ? "touch-lg" : "lg"}
          className="w-full"
          render={<Link href={receiveHref} />}
        >
          {copy.receiveCta}
        </Button>
      ) : null}
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
  const isTouchLayout = useIsMobile(OWNER_SHELL_BREAKPOINT);
  const stageIndex = STAGES.indexOf(data.journey.stage);
  const backHref =
    mode === "branch"
      ? `/br/${data.branchId}/stock`
      : "/inventory/transfers?work=request";
  const branchProgress =
    mode === "branch"
      ? getBranchStockRequestProgress({
          requestStatus: data.status,
          items: data.items,
          transfers: data.transfers.map((transfer) => ({
            id: transfer.id,
            status: transfer.status,
          })),
        })
      : null;
  const nextAction =
    mode === "branch" && branchProgress != null
      ? branchProgress.canConfirm
        ? copy.receiveCta
        : BRANCH_STOCK_REQUEST_STEP_LABELS[branchProgress.currentStep]
      : NEXT_ACTION_LABELS[data.journey.nextAction];
  const description =
    mode === "branch" && branchProgress != null
      ? `${data.requestNumber} · ${BRANCH_STOCK_REQUEST_STEP_LABELS[branchProgress.currentStep]}`
      : `${data.branchName} · ${STOCK_JOURNEY_STAGE_LABELS[data.journey.stage]} · ${nextAction}`;
  const statusLabel = messages.inventory.stockRequests.statusLabel(data.status);
  const sourceKinds = (["central_supply", "central_kitchen"] as const).filter(
    (siteKind) => data.items.some((item) => item.fulfillSiteKind === siteKind),
  );
  const sourceLabel = (siteKind: (typeof sourceKinds)[number]) =>
    siteKind === "central_supply" ? copy.centralSupply : copy.centralKitchen;
  const workFirst = Boolean(actions) && embedded && mode === "central";
  const sourcesWithTrips = sourceKinds.filter(
    (siteKind) => transfersForSite(data, siteKind).length > 0,
  );
  const tripCount = new Set(
    sourcesWithTrips.flatMap((siteKind) =>
      transfersForSite(data, siteKind).map((transfer) => transfer.id),
    ),
  ).size;

  if (mode === "branch" && !embedded) {
    return (
      <BranchOperatorPage
        title={copy.detailTitle}
        description={description}
        badge={{ children: statusLabel }}
        hideHeaderOnMobile
        action={
          <Button
            variant="ghost"
            className="max-sm:hidden"
            render={<Link href={backHref} />}
          >
            {copy.back}
          </Button>
        }
      >
        <BranchOperatorControlBar className="sm:hidden">
          <Button
            variant="ghost"
            size={isTouchLayout ? "icon-touch" : "icon-sm"}
            render={<Link href={backHref} aria-label={ACTIONS_VI.back} />}
          >
            <IconArrowLeft />
          </Button>
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{copy.detailTitle}</p>
            <p className="truncate text-xs text-muted-foreground">
              {description}
            </p>
          </div>
          <Badge variant="secondary">{statusLabel}</Badge>
        </BranchOperatorControlBar>
        <BranchRequestDetailContent data={data} actions={actions} />
      </BranchOperatorPage>
    );
  }

  const tripsSection =
    sourcesWithTrips.length > 0 ? (
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold">{copy.tripsTitle}</h3>
          <p className="text-xs text-muted-foreground">
            {copy.transferCount(tripCount)}
          </p>
        </div>
        <ItemGroup>
          {sourcesWithTrips.map((siteKind) => (
            <Item key={siteKind} variant="outline" size="sm">
              <ItemContent>
                <ItemTitle>{sourceLabel(siteKind)}</ItemTitle>
                {/* Buttons must not live in ItemDescription (<p> + line-clamp). */}
                <div className="flex min-w-0 flex-wrap gap-x-3 gap-y-1">
                  <TransferLinks
                    data={data}
                    mode={mode}
                    onTransferOpen={onTransferOpen}
                    siteKind={siteKind}
                  />
                </div>
              </ItemContent>
            </Item>
          ))}
        </ItemGroup>
      </div>
    ) : null;

  const content = workFirst ? (
    <>
      {actions}

      {tripsSection}

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
            const transfers = transfersForSite(data, siteKind);
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
                  <div className="flex min-w-0 flex-wrap gap-x-3 gap-y-1">
                    <TransferLinks
                      data={data}
                      mode={mode}
                      onTransferOpen={onTransferOpen}
                      siteKind={siteKind}
                    />
                  </div>
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
