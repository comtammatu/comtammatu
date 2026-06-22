import {
  ArrowLeftRight as IconArrowLeftRight,
  Package as IconPackage,
  TrendingUp as IconTrendingUp,
} from "lucide-react";
import { APP_COPY_VI } from "@comtammatu/shared/labels";
import {
  AppLinkCard,
  type AppLinkCardProps,
  AppPage,
  AppPageHeader,
  AppSection,
  LinkCardGrid,
} from "@/components/surface";
import { messages } from "@lib/messages";

export default function ReportsPage() {
  const copy = messages.admin.reports.index;

  const executiveCards: AppLinkCardProps[] = [
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
      href: "/finance/inventory-value",
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
    <AppPage width="wide">
      <AppPageHeader
        eyebrow={APP_COPY_VI.reportsLabel}
        title={copy.title}
        description={copy.description}
      />

      <AppSection
        title={copy.aggregateTitle}
        description={copy.aggregateDescription}
      >
        <LinkCardGrid>
          {executiveCards.map((card) => (
            <AppLinkCard key={card.href} {...card} ctaLabel={copy.openReport} />
          ))}
        </LinkCardGrid>
      </AppSection>
    </AppPage>
  );
}
