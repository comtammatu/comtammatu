import { INVENTORY_VI } from "@comtammatu/shared/messages";

import {
  AppEmptyState,
  AppPageHeader,
  DocumentFormFrame,
} from "@/components/surface";

interface SupplierReturnNewPageContentProps {
  embedded?: boolean;
}

export function SupplierReturnNewPageContent({
  embedded = false,
}: SupplierReturnNewPageContentProps = {}) {
  const header = (
    <AppPageHeader
      eyebrow={INVENTORY_VI.warehouse}
      title={INVENTORY_VI.createSupplierReturnTitle}
      description={INVENTORY_VI.createSupplierReturnDescription}
    />
  );

  const content = (
    <AppEmptyState
      mode="no-data"
      title={INVENTORY_VI.featureInDevelopmentTitle}
      description={INVENTORY_VI.supplierReturnFromGrnHint}
    />
  );

  if (embedded) {
    return <div className="flex w-full flex-col gap-3">{content}</div>;
  }

  return <DocumentFormFrame header={header}>{content}</DocumentFormFrame>;
}

export default function NewSupplierReturnPage() {
  return <SupplierReturnNewPageContent />;
}
