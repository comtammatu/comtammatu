import { INVENTORY_VI } from "@comtammatu/shared/messages";

import { AppPage, AppPageHeader, AppEmptyState } from "@/components/surface";

interface SupplierReturnNewPageContentProps {
  embedded?: boolean;
}

export function SupplierReturnNewPageContent({
  embedded = false,
}: SupplierReturnNewPageContentProps = {}) {
  const content = (
    <>
      <AppPageHeader
        eyebrow={embedded ? undefined : INVENTORY_VI.warehouse}
        title={INVENTORY_VI.createSupplierReturnTitle}
        description={INVENTORY_VI.createSupplierReturnDescription}
      />
      <AppEmptyState
        mode="no-data"
        title={INVENTORY_VI.featureInDevelopmentTitle}
        description={INVENTORY_VI.supplierReturnFromGrnHint}
      />
    </>
  );

  if (embedded) {
    return <div className="flex w-full flex-col gap-3">{content}</div>;
  }

  return <AppPage>{content}</AppPage>;
}

export default function NewSupplierReturnPage() {
  return <SupplierReturnNewPageContent />;
}
