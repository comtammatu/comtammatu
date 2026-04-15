import { fetchStocktakeDetail } from "../../actions";
import { StocktakeDetailClient } from "./stocktake-detail-client";

export default async function StocktakeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sessionId = Number(id);

  if (!Number.isFinite(sessionId) || sessionId <= 0) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        ID không hợp lệ
      </div>
    );
  }

  const result = await fetchStocktakeDetail(sessionId);
  if (!result.success || !result.data) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        Không tìm thấy phiên kiểm kê
      </div>
    );
  }

  const { session: stocktakeSession, lines } = result.data as {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    session: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    lines: any[];
  };

  return (
    <StocktakeDetailClient
      session={stocktakeSession}
      lines={lines}
      routeBase="/inventory/stocktake"
      inventoryBasePath="/inventory"
    />
  );
}
