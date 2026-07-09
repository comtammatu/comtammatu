import Link from "next/link";
import {
  ArrowLeft as IconArrowLeft,
  ClipboardList as IconClipboardList,
  Truck as IconTruck,
} from "lucide-react";
import { INVENTORY_VI } from "@comtammatu/shared/messages";
import {
  AppEmptyState,
  AppPageHeader,
  AppSection,
  DocumentFormFrame,
} from "@/components/surface";
import { loadGrnSourcePageData } from "@lib/inventory/grn-source-data";
import { parseGrnSupplierIdParam } from "@lib/inventory/grn-source-model";
import { messages } from "@lib/messages";
import { GrnCreatePageContent } from "./[supplierId]/page";
import { GrnFromPoList } from "./grn-from-po-list";
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
    <>
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

      {data.openPurchaseOrdersLoadFailed ||
      data.openPurchaseOrders.length > 0 ? (
        <AppSection
          icon={<IconClipboardList />}
          title={INVENTORY_VI.receiveByPoTitle}
          badge={
            data.openPurchaseOrdersLoadFailed
              ? undefined
              : {
                  children: data.openPurchaseOrders.length,
                  variant: "secondary",
                }
          }
        >
          {data.openPurchaseOrdersLoadFailed ? (
            <AppEmptyState
              compact
              mode="error"
              title={messages.inventory.po.receivingLoadFailed}
            />
          ) : (
            <GrnFromPoList openPos={data.openPurchaseOrders} />
          )}
        </AppSection>
      ) : null}
    </>
  );

  return (
    <DocumentFormFrame
      header={
        <AppPageHeader
          breadcrumb={
            <Link
              href="/inventory/grn"
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
            >
              <IconArrowLeft className="size-4" />{" "}
              {INVENTORY_VI.grnListBackLabel}
            </Link>
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
