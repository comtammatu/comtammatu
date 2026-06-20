import {
  ArrowLeftRight as IconArrowLeftRight,
  Package as IconPackage,
  TrendingUp as IconTrendingUp,
} from "lucide-react";
import { APP_COPY_VI } from "@comtammatu/shared/labels";
import { AppPage, AppPageHeader, AppSection } from "@/components/surface";
import { messages } from "@lib/messages";
import {
  SurfaceLinkCard,
  type SurfaceLinkCardProps,
} from "@/components/surface-link-card";

export default function ReportsPage() {
  const copy = messages.admin.reports.index;

  const executiveCards: SurfaceLinkCardProps[] = [
    {
      title: copy.cards.revenue,
      description: copy.cardDescriptions.revenue,
      href: "/finance/revenue",
      icon: <IconTrendingUp />,
      tone: "primary" as const,
      badge: copy.summaryBadge,
    },
    {
      title: copy.cards.inventoryValue,
      description: copy.cardDescriptions.inventoryValue,
      href: "/admin/reports/inventory-value",
      icon: <IconPackage />,
      tone: "info" as const,
      badge: copy.summaryBadge,
    },
    {
      title: copy.cards.stockMovement,
      description: copy.cardDescriptions.stockMovement,
      href: "/admin/reports/stock-movement",
      icon: <IconArrowLeftRight />,
      tone: "info" as const,
      badge: copy.operationsBadge,
    },
  ];

  return (
    <AppPage width="wide" density="compact">
      <AppPageHeader
        eyebrow={APP_COPY_VI.reportsLabel}
        title={copy.title}
        description={copy.description}
      />

      <AppSection
        title={copy.aggregateTitle}
        description={copy.aggregateDescription}
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {executiveCards.map((card) => (
            <SurfaceLinkCard
              key={card.href}
              {...card}
              ctaLabel={copy.openReport}
            />
          ))}
        </div>
      </AppSection>
    </AppPage>
  );
}
