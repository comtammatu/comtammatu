import { Suspense } from "react";
import {
  fetchMenuForPos,
  fetchTablesForBranch,
  fetchActiveSession,
  fetchPosTerminals,
} from "./actions";
import { PosMenu } from "./pos-menu";
import type { MenuCategory } from "./pos-menu";
import { SessionGate } from "./session-gate";

export default async function PosPage({
  params,
  searchParams,
}: {
  params: Promise<{ branchId: string }>;
  searchParams: Promise<{ table?: string }>;
}) {
  const { branchId } = await params;
  const sp = await searchParams;
  const tableParam = sp.table;
  const parsedTable =
    tableParam !== undefined ? Number.parseInt(tableParam, 10) : NaN;
  const initialTableId =
    Number.isFinite(parsedTable) && parsedTable > 0
      ? Math.trunc(parsedTable)
      : undefined;

  const branchIdNum = Number(branchId);

  // Check for active session first
  const sessionResult = await fetchActiveSession(branchIdNum);

  if (!sessionResult.success) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center">
          <p className="text-lg font-medium text-destructive">
            {sessionResult.error ?? "Không thể tải thông tin ca"}
          </p>
        </div>
      </div>
    );
  }

  // No open session → show session gate
  if (!sessionResult.data) {
    const terminalsResult = await fetchPosTerminals(branchIdNum);
    return (
      <SessionGate
        branchId={branchIdNum}
        terminals={
          (terminalsResult.data ?? []) as {
            id: number;
            name: string;
            device_id: string | null;
          }[]
        }
      />
    );
  }

  // Session exists → load menu + tables and show POS
  const session = sessionResult.data as ActiveSession;

  const [menuResult, tablesResult] = await Promise.all([
    fetchMenuForPos(branchIdNum),
    fetchTablesForBranch(branchIdNum),
  ]);

  if (!menuResult.success || !menuResult.data) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center">
          <p className="text-lg font-medium text-destructive">
            {menuResult.error ?? "Không thể tải menu"}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Vui lòng tải lại trang hoặc liên hệ quản lý.
          </p>
        </div>
      </div>
    );
  }

  return (
    <Suspense
      fallback={
        <div className="flex flex-1 items-center justify-center p-8">
          <p className="text-sm text-muted-foreground">Đang tải POS…</p>
        </div>
      }
    >
      <PosMenu
        branchId={branchIdNum}
        categories={menuResult.data as MenuCategory[]}
        tables={(tablesResult.data ?? []) as BranchTable[]}
        session={session}
        initialTableId={initialTableId}
      />
    </Suspense>
  );
}

/** Table shape returned by fetchTablesForBranch */
export interface BranchTable {
  id: number;
  number: number;
  capacity: number;
  status: string;
  zone_id: number | null;
  branch_zones: { id: number; name: string } | null;
}

/** Active session shape returned by fetchActiveSession */
export interface ActiveSession {
  id: number;
  terminal_id: number;
  opened_by: string;
  opened_at: string;
  opening_cash: number;
  status: string;
  note: string | null;
  pos_terminals: { id: number; name: string } | null;
}
