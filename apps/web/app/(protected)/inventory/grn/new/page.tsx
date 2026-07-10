import { Truck as IconTruck } from "lucide-react";
import { INVENTORY_VI } from "@comtammatu/shared/messages";
import {
  AppBackLink,
  AppEmptyState,
  AppPageHeader,
  AppSection,
  DocumentFormFrame,
} from "@/components/surface";
import { loadGrnSourcePageData } from "@lib/inventory/grn-source-data";
import { parseGrnSupplierIdParam } from "@lib/inventory/grn-source-model";
import { GrnCreatePageContent } from "./[supplierId]/page";
import { SupplierPicker } from "./supplier-picker";

interface GrnNewPageProps {
  searchParams?: Promise<{
    branchId?: string | string[];
    supplierId?: string | string[];
  }>;
}

export async function GrnNewPageContent({ searchParams }: GrnNewPageProps) {
  const params = searchParams ? await searchParams : {};
  const selectedSupplierId = parseGrnSupplierIdParam(params.supplierId);

  if (selectedSupplierId != null) {
    return (
      <GrnCreatePageContent
        supplierId={selectedSupplierId}
        searchParams={Promise.resolve(params)}
      />
    );
  }

  const data = await loadGrnSourcePageData({
    queryBranchId: params.branchId,
  });
  const content = (
    <AppSection
      icon={<IconTruck />}
      title={INVENTORY_VI.receiveBySupplierTitle}
      description={INVENTORY_VI.receiveBySupplierDescription}
    >
      {data.suppliersLoadFailed ? (
        <AppEmptyState
          compact
          mode="error"
          title={INVENTORY_VI.grnSupplierLoadFailed}
        />
      ) : (
        <SupplierPicker
          suppliers={data.suppliers}
          basePath="/inventory/grn/new"
          branchId={data.branchId}
          canCreate={data.canCreateSupplier}
        />
      )}
    </AppSection>
  );

  return (
    <DocumentFormFrame
      header={
        <AppPageHeader
          breadcrumb={
            <AppBackLink href="/inventory/grn">
              {INVENTORY_VI.grnListBackLabel}
            </AppBackLink>
          }
          eyebrow={INVENTORY_VI.receivingEyebrow}
          title={INVENTORY_VI.chooseSourceTitle}
          description={INVENTORY_VI.chooseSourceDescription}
        />
      }
      width="wide"
    >
      {content}
    </DocumentFormFrame>
  );
}

export default async function GrnNewPage({ searchParams }: GrnNewPageProps) {
  return <GrnNewPageContent searchParams={searchParams} />;
}
