import {
  ArrowLeftRight as IconArrowLeftRight,
  ClipboardList as IconClipboardList,
  Package as IconPackage,
  Receipt as IconReceipt,
  ShieldCheck as IconShieldCheck,
  TrendingUp as IconTrendingUp,
} from "lucide-react";
import { canAccess } from "@comtammatu/shared/auth";
import { APP_COPY_VI } from "@comtammatu/shared/labels";
import { loadAuthState } from "@/_lib/auth";
import { AppPage, AppPageHeader } from "@/components/surface";
import { messages } from "@lib/messages";
import {
  SurfaceLinkCard,
  type SurfaceLinkCardProps,
} from "@/components/surface-link-card";

export default async function ReportsPage() {
  const { claims } = await loadAuthState();
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
  const deepDiveCards: SurfaceLinkCardProps[] = [];
  if (canAccess(claims.user_role, "finance")) {
    deepDiveCards.push({
      title: copy.cards.finance,
      description: copy.cardDescriptions.finance,
      href: "/finance",
      icon: <IconReceipt />,
      tone: "success",
      badge: copy.detailsBadge,
    });
  }
  if (canAccess(claims.user_role, "inventory")) {
    deepDiveCards.push({
      title: copy.cards.inventory,
      description: copy.cardDescriptions.inventory,
      href: "/inventory/reports",
      icon: <IconClipboardList />,
      tone: "info",
      badge: copy.detailsBadge,
    });
  }
  if (canAccess(claims.user_role, "hr")) {
    deepDiveCards.push({
      title: copy.cards.hr,
      description: copy.cardDescriptions.hr,
      href: "/hr",
      icon: <IconShieldCheck />,
      tone: "info",
      badge: copy.detailsBadge,
    });
  }

  return (
    <AppPage width="wide" density="compact">
      <AppPageHeader
        eyebrow={APP_COPY_VI.executiveReporting}
        title={copy.title}
        description={copy.description}
      />

      <section className="space-y-3">
        <div className="space-y-1">
          <h2 className="font-heading text-base font-semibold tracking-tight">
            {copy.aggregateTitle}
          </h2>
          <p className="text-sm leading-6 text-muted-foreground">
            {copy.aggregateDescription}
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {executiveCards.map((card) => (
            <SurfaceLinkCard
              key={card.href}
              {...card}
              ctaLabel={copy.openReport}
            />
          ))}
        </div>
      </section>

      {deepDiveCards.length > 0 ? (
        <section className="space-y-3">
          <div className="space-y-1">
            <h2 className="font-heading text-base font-semibold tracking-tight">
              {copy.relatedTitle}
            </h2>
            <p className="text-sm leading-6 text-muted-foreground">
              {copy.relatedDescription}
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {deepDiveCards.map((card) => (
              <SurfaceLinkCard
                key={card.href}
                {...card}
                ctaLabel={copy.openReport}
              />
            ))}
          </div>
        </section>
      ) : null}
    </AppPage>
  );
}
