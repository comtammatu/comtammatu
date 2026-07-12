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
  searchParams: Promise<{ view?: string; page?: string }>;
}

const PAGE_SIZE = 20;

export default async function OperatorOrdersPage({
  params,
  searchParams,
}: PageProps) {
  const [{ branchId: rawBranchId }, query] = await Promise.all([
    params,
    searchParams,
  ]);
  const branchId = parseOperatorBranchId(rawBranchId);
  if (branchId == null) notFound();
  const view = query.view === "recent" ? "recent" : "active";
  const parsedPage = Number(query.page);
  const page = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;

  const result = await fetchOrders({
    branchId,
    activeOnly: view === "active",
    page,
    pageSize: PAGE_SIZE,
  });

  return (
    <BranchOperatorPage
      title={ORDER_VI.long}
      description={ORDERS_COPY.operatorDescription}
    >
      {result.success && result.data ? (
        <OperatorOrdersClient
          orders={result.data.orders}
          inProgressCount={result.data.summary.inProgressCount}
          page={page}
          pageSize={PAGE_SIZE}
          totalCount={
            view === "active"
              ? result.data.summary.inProgressCount
              : result.data.summary.totalCount
          }
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
