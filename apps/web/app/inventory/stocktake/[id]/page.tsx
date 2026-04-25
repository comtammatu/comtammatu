import { notFound, redirect } from "next/navigation";
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
    notFound();
  }

  const result = await fetchStocktakeDetail(sessionId);
  if (!result.success || !result.data) {
    notFound();
  }

  const { session: stocktakeSession, lines } = result.data as {
    session: {
      id: number;
      branch_id: number;
      started_at: string | null;
      completed_at: string | null;
      status: string;
      blind_mode: boolean;
      current_round: number;
      notes: string | null;
      created_at: string;
      created_by: string;
    };
    lines: Array<{
      id: number;
      session_id: number;
      ingredient_id: number;
      system_quantity: number;
      counted_quantity: number | null;
      variance: number | null;
      variance_reason: string | null;
      ingredients: {
        id: number;
        name: string;
        unit: string;
        purchase_unit: string | null;
        category: string | null;
      } | null;
    }>;
  };

  if (stocktakeSession.status === "in_progress") {
    redirect(
      `/inventory/stocktake/${sessionId}/count?branchId=${stocktakeSession.branch_id}`,
    );
  }

  return (
    <StocktakeDetailClient
      session={stocktakeSession}
      lines={lines}
      routeBase="/inventory/stocktake"
      inventoryBasePath="/inventory"
    />
  );
}
