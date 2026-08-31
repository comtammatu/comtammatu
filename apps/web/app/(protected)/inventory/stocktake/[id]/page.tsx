import { notFound, redirect } from "next/navigation";
import { fetchStocktakeDetail } from "../../actions";
import { parseBranchIdParam } from "../../_lib/inventory-scope";
import { fetchEntityAuditLogs } from "@/_lib/audit";
import { StocktakeDetailClient } from "./stocktake-detail-client";

interface StocktakeDetailPageContentProps {
  stocktakeId: number;
  searchParams?: Promise<{
    branch?: string | string[];
    view?: string;
  }>;
  routeBranchId?: number;
  routeBase?: string;
  reportsBasePath?: string;
}

export async function StocktakeDetailPageContent({
  stocktakeId,
  searchParams,
  routeBranchId,
  routeBase = "/inventory/stocktake",
  reportsBasePath = "/inventory/reports",
}: StocktakeDetailPageContentProps) {
  const sessionId = stocktakeId;

  if (!Number.isFinite(sessionId) || sessionId <= 0) {
    notFound();
  }

  const result = await fetchStocktakeDetail(sessionId);
  if (!result.success || !result.data) {
    notFound();
  }

  const {
    session: stocktakeSession,
    lines,
    unitOptionsByIngredient = {},
  } = result.data as {
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
      created_by_name: string;
    };
    lines: Array<{
      id: number;
      session_id: number;
      ingredient_id: number;
      system_quantity: number;
      counted_quantity: number | null;
      variance: number | null;
      variance_reason: string | null;
      reason_code: string | null;
      ingredients: {
        id: number;
        name: string;
        unit: string;
        category: string | null;
      } | null;
    }>;
    unitOptionsByIngredient?: Record<number, import("@/components/inventory/stocktake-print-dialog").StocktakeCountUnitOption[]>;
  };
  const sp = searchParams ? await searchParams : {};
  const requestedBranchId = routeBranchId ?? parseBranchIdParam(sp.branch);
  const sessionBranchId = stocktakeSession.branch_id;
  const isDetailView = sp.view === "detail";
  const detailViewParam = isDetailView ? "&view=detail" : "";

  if (routeBranchId != null && routeBranchId !== sessionBranchId) {
    notFound();
  }

  if (requestedBranchId !== sessionBranchId) {
    redirect(
      `${routeBase}/${sessionId}?branch=${sessionBranchId}${detailViewParam}`,
    );
  }

  if (stocktakeSession.status === "in_progress" && !isDetailView) {
    redirect(`${routeBase}/${sessionId}/count?branch=${sessionBranchId}`);
  }

  const auditLogs = await fetchEntityAuditLogs(
    "stocktake_session",
    sessionId,
    50,
  );

  return (
    <StocktakeDetailClient
      session={stocktakeSession}
      lines={lines}
      unitOptionsByIngredient={unitOptionsByIngredient}
      routeBase={routeBase}
      reportsBasePath={reportsBasePath}
      auditLogs={auditLogs}
    />
  );
}

export default async function StocktakeDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    branch?: string | string[];
    error?: string;
    view?: string;
  }>;
}) {
  const { id } = await params;
  return (
    <StocktakeDetailPageContent
      stocktakeId={Number(id)}
      searchParams={searchParams}
    />
  );
}
