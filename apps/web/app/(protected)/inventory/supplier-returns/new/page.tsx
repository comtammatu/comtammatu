import { INVENTORY_VI } from "@comtammatu/shared/messages";

import { AppPage, AppPageHeader, AppEmptyState } from "@/components/surface";

export default function NewSupplierReturnPage() {
  return (
    <AppPage>
      <AppPageHeader
        eyebrow={INVENTORY_VI.warehouse}
        title={INVENTORY_VI.createSupplierReturnTitle}
        description={INVENTORY_VI.createSupplierReturnDescription}
      />
      <AppEmptyState
        mode="no-data"
        title={INVENTORY_VI.featureInDevelopmentTitle}
        description={INVENTORY_VI.supplierReturnFromGrnHint}
      />
    </AppPage>
  );
}
