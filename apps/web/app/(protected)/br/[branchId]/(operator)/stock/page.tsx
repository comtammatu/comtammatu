import { ClipboardList, Package, Truck } from "lucide-react";
import { MODULE_ACL } from "@comtammatu/shared/auth";
import { AppLinkCard, AppSection, LinkCardGrid } from "@/components/surface";
import { messages } from "@lib/messages";

export default async function OperatorStockPage({
  params,
}: {
  params: Promise<{ branchId: string }>;
}) {
  const { branchId } = await params;
  const branchQuery = `?branchId=${branchId}`;
  const copy = messages.inventory;

  return (
    <AppSection title={MODULE_ACL.inventory.label}>
      <LinkCardGrid>
        <AppLinkCard
          href={`/inventory/stocktake${branchQuery}`}
          title={copy.dashboard.stocktakeProgress}
          icon={<ClipboardList />}
        />
        <AppLinkCard
          href={`/br/${branchId}/stock/receive`}
          title={copy.grn.documentLabel}
          icon={<Package />}
        />
        <AppLinkCard
          href={`/inventory/transfers${branchQuery}`}
          title={copy.dashboard.transferTrackingTitle}
          icon={<Truck />}
        />
      </LinkCardGrid>
    </AppSection>
  );
}
