import Link from "next/link";
import type { ReactNode } from "react";
import { formatVNDateTime } from "@comtammatu/shared/time";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
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
import { StatusBadge } from "@/components/status-badge";
import { BranchOperatorPage } from "@lib/branch-operator/components/branch-operator-page";
import { messages } from "@lib/messages";
import type { StockRequestDetailData } from "@lib/inventory/stock-request-detail-data";
import {
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

export function StockRequestDetailView({
  data,
  mode,
  actions,
}: {
  data: StockRequestDetailData;
  mode: "branch" | "central";
  actions?: ReactNode;
}) {
  const stageIndex = STAGES.indexOf(data.journey.stage);
  const backHref =
    mode === "branch"
      ? `/br/${data.branchId}/stock/transfer`
      : "/inventory/transfers?queue=requests";
  const nextAction =
    mode === "branch" && data.journey.nextAction === "prepare"
      ? "Chờ chuẩn bị hàng"
      : NEXT_ACTION_LABELS[data.journey.nextAction];
  const description = `${data.branchName} · ${STOCK_JOURNEY_STAGE_LABELS[data.journey.stage]} · ${nextAction}`;
  const statusLabel = messages.inventory.stockRequests.statusLabel(data.status);
  const content = (
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

      <AppSection
        title={copy.transfersTitle}
        description={copy.transferProgress(
          data.journey.receivedTransfers,
          data.journey.activeTransfers,
        )}
      >
        {data.transfers.length === 0 ? (
          <p className="text-sm text-muted-foreground">{copy.noTransfer}</p>
        ) : (
          <ItemGroup>
            {data.transfers.map((transfer) => (
              <Item
                key={transfer.id}
                variant="outline"
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
                <ItemContent>
                  <ItemTitle>
                    {transfer.fromBranchName} → {transfer.toBranchName}
                  </ItemTitle>
                  <ItemDescription className="font-mono tabular-nums">
                    {transfer.transferNumber}
                  </ItemDescription>
                </ItemContent>
                <StatusBadge
                  domain="inventory"
                  value={transfer.status}
                  size="sm"
                />
              </Item>
            ))}
          </ItemGroup>
        )}
      </AppSection>

      <AppSection title={copy.ingredientsTitle}>
        <ItemGroup>
          {data.items.map((item) => (
            <Item key={item.id} variant="outline">
              <ItemContent>
                <ItemTitle>{item.ingredientName}</ItemTitle>
                <ItemDescription>
                  {item.quantity} {item.unitLabel} ·{" "}
                  {item.fulfillSiteKind === "central_supply"
                    ? copy.centralSupply
                    : copy.centralKitchen}
                </ItemDescription>
              </ItemContent>
              <Badge variant="secondary">
                {messages.inventory.stockRequests.statusLabel(item.status)}
              </Badge>
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
            ...(data.statusReason
              ? [{ term: copy.outcome, description: data.statusReason }]
              : []),
          ]}
        />
      </AppSection>

      <AppSection title={copy.history}>
        <AuditHistoryList logs={data.auditLogs} />
      </AppSection>

      {actions}
    </>
  );

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
