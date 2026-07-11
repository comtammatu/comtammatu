import { notFound } from "next/navigation";
import { ORDER_VI } from "@comtammatu/shared/messages";
import { AppEmptyState } from "@/components/surface";
import { fetchOrders } from "@/(protected)/orders/actions";
import { ORDERS_COPY } from "@/(protected)/orders/orders-copy";
import { BranchOperatorPage } from "@lib/branch-operator/components/branch-operator-page";
import { parseOperatorBranchId } from "../../_lib/parse-branch-id";
import { OperatorOrdersClient } from "./operator-orders-client";

interface PageProps {
  params: Promise<{ branchId: string }>;
}

export default async function OperatorOrdersPage({ params }: PageProps) {
  const { branchId: rawBranchId } = await params;
  const branchId = parseOperatorBranchId(rawBranchId);
  if (branchId == null) notFound();

  const result = await fetchOrders({ branchId });

  return (
    <BranchOperatorPage
      title={ORDER_VI.long}
      description={ORDERS_COPY.operatorDescription}
    >
      {result.success && result.data ? (
        <OperatorOrdersClient
          orders={result.data.orders}
          totalCount={result.data.summary.totalCount}
          inProgressCount={result.data.summary.inProgressCount}
        />
      ) : (
        <AppEmptyState
          mode="error"
          description={result.error ?? ORDERS_COPY.loadFailed}
          compact
        />
      )}
    </BranchOperatorPage>
  );
}
