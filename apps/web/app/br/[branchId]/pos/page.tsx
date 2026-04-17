import { Suspense } from "react";
import { Loader2, MonitorSpeaker, TriangleAlert } from "lucide-react";
import {
  fetchMenuForPos,
  fetchTablesForBranch,
  fetchActiveSession,
  fetchPosTerminals,
} from "./actions";
import { PosMenu } from "./pos-menu";
import type { MenuCategory } from "./pos-menu";
import { SessionGate } from "./session-gate";
import type { OrderType } from "./types";
import { Badge } from "@comtammatu/ui/components/badge";
import { Card, CardContent } from "@comtammatu/ui/components/card";

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
      <Card className="rounded-lg border bg-card text-card-foreground shadow-sm">
        <CardContent className="p-6 sm:p-8">
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-4">
                <div className="flex size-14 items-center justify-center rounded-full border border-border/70 bg-background/80 text-primary shadow-sm">
                  <MonitorSpeaker className="size-5" />
                </div>
                <div className="space-y-1.5">
                  <h2 className="text-3xl font-semibold tracking-tight">
                    Không mở được POS
                  </h2>
                  <p className="max-w-2xl text-sm leading-7 text-muted-foreground">
                    {sessionResult.error ?? "Chưa lấy được ca làm hiện tại."}
                  </p>
                </div>
              </div>
              <Badge variant="destructive">
                <TriangleAlert className="size-3.5" />
                <span>Sự cố tải ca làm</span>
              </Badge>
            </div>
            <ol className="grid gap-3 lg:grid-cols-3">
              <li>
                <Card className="rounded-lg border bg-amber-50 text-card-foreground dark:border-amber-500/30 dark:bg-amber-500/10">
                  <CardContent className="p-4">
                    <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                      Bước 1
                    </p>
                    <h3 className="mt-2 text-base font-semibold">
                      Kiểm tra phiên
                    </h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Đang xác minh ca làm.
                    </p>
                  </CardContent>
                </Card>
              </li>
              <li>
                <Card className="rounded-lg border bg-muted/30 text-card-foreground">
                  <CardContent className="p-4">
                    <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                      Bước 2
                    </p>
                    <h3 className="mt-2 text-base font-semibold">
                      Tải máy POS
                    </h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Đang tải máy POS.
                    </p>
                  </CardContent>
                </Card>
              </li>
              <li>
                <Card className="rounded-lg border bg-muted/30 text-card-foreground">
                  <CardContent className="p-4">
                    <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                      Bước 3
                    </p>
                    <h3 className="mt-2 text-base font-semibold">
                      Mở màn hình bán hàng
                    </h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Mở quầy bán hàng.
                    </p>
                  </CardContent>
                </Card>
              </li>
            </ol>
          </div>
        </CardContent>
      </Card>
    );
  }

  // No open session → show session gate
  if (!sessionResult.data) {
    const terminalsResult = await fetchPosTerminals(branchIdNum);

    if (!terminalsResult.success) {
      return (
        <Card className="rounded-lg border bg-card text-card-foreground shadow-sm">
          <CardContent className="p-6 sm:p-8">
            <div className="flex flex-col gap-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-4">
                  <div className="flex size-14 items-center justify-center rounded-full border border-border/70 bg-background/80 text-primary shadow-sm">
                    <MonitorSpeaker className="size-5" />
                  </div>
                  <div className="space-y-1.5">
                    <h2 className="text-3xl font-semibold tracking-tight">
                      Không thể tải máy POS
                    </h2>
                    <p className="max-w-2xl text-sm leading-7 text-muted-foreground">
                      {terminalsResult.error ??
                        "Chưa tải được danh sách máy POS."}
                    </p>
                  </div>
                </div>
              <Badge variant="warning">
                <TriangleAlert className="size-3.5" />
                <span>Lỗi tải máy POS</span>
              </Badge>
              </div>
              <ol className="grid gap-3 lg:grid-cols-3">
                <li>
                  <Card className="rounded-lg border border-emerald-200 bg-emerald-50 text-card-foreground dark:border-emerald-500/30 dark:bg-emerald-500/10">
                    <CardContent className="p-4">
                      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                        Bước 1
                      </p>
                      <h3 className="mt-2 text-base font-semibold">
                        Kiểm tra phiên
                      </h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Chưa có ca mở.
                      </p>
                    </CardContent>
                  </Card>
                </li>
                <li>
                  <Card className="rounded-lg border border-amber-200 bg-amber-50 text-card-foreground dark:border-amber-500/30 dark:bg-amber-500/10">
                    <CardContent className="p-4">
                      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                        Bước 2
                      </p>
                    <h3 className="mt-2 text-base font-semibold">
                      Tải máy POS
                    </h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Đang tải máy POS.
                    </p>
                    </CardContent>
                  </Card>
                </li>
                <li>
                  <Card className="rounded-lg border bg-muted/30 text-card-foreground">
                    <CardContent className="p-4">
                      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                        Bước 3
                      </p>
                      <h3 className="mt-2 text-base font-semibold">Mở ca</h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Sẵn sàng mở ca.
                      </p>
                    </CardContent>
                  </Card>
                </li>
              </ol>
            </div>
          </CardContent>
        </Card>
      );
    }

    return (
      <SessionGate
        branchId={branchIdNum}
        terminals={
          (terminalsResult.data ?? []) as {
            id: number;
            name: string;
            device_id: string | null;
            has_open_session: boolean;
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

  const tablesList = (tablesResult.data ?? []) as BranchTable[];
  const tableParamValidForDineIn =
    initialTableId != null &&
    tablesList.some(
      (t) => t.id === initialTableId && t.status !== "maintenance",
    );
  const initialOrderType: OrderType = tableParamValidForDineIn
    ? "dine_in"
    : "takeaway";

  if (!menuResult.success || !menuResult.data) {
    return (
      <Card className="rounded-lg border bg-card text-card-foreground shadow-sm">
        <CardContent className="p-6 sm:p-8">
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-4">
                <div className="flex size-14 items-center justify-center rounded-full border border-border/70 bg-background/80 text-primary shadow-sm">
                  <MonitorSpeaker className="size-5" />
                </div>
                <div className="space-y-1.5">
                  <h2 className="text-3xl font-semibold tracking-tight">
                    Không thể tải menu bán hàng
                  </h2>
                  <p className="max-w-2xl text-sm leading-7 text-muted-foreground">
                    {menuResult.error ?? "Ca đã mở nhưng chưa tải được menu."}
                  </p>
                </div>
              </div>
              <Badge variant="warning">
                <TriangleAlert className="size-3.5" />
                <span>Gián đoạn dữ liệu bán hàng</span>
              </Badge>
            </div>
            <ol className="grid gap-3 lg:grid-cols-3">
              <li>
                <Card className="rounded-lg border border-emerald-200 bg-emerald-50 text-card-foreground dark:border-emerald-500/30 dark:bg-emerald-500/10">
                  <CardContent className="p-4">
                    <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                      Bước 1
                    </p>
                    <h3 className="mt-2 text-base font-semibold">Ca đang mở</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Phiên bán hàng đã sẵn sàng.
                    </p>
                  </CardContent>
                </Card>
              </li>
              <li>
                <Card className="rounded-lg border border-amber-200 bg-amber-50 text-card-foreground dark:border-amber-500/30 dark:bg-amber-500/10">
                  <CardContent className="p-4">
                    <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                      Bước 2
                    </p>
                    <h3 className="mt-2 text-base font-semibold">
                      Đồng bộ menu
                    </h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Đang nạp món và bàn.
                    </p>
                  </CardContent>
                </Card>
              </li>
              <li>
                <Card className="rounded-lg border bg-muted/30 text-card-foreground">
                  <CardContent className="p-4">
                    <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                      Bước 3
                    </p>
                    <h3 className="mt-2 text-base font-semibold">
                      Sẵn sàng tạo đơn
                    </h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Sẵn sàng phục vụ khách.
                    </p>
                  </CardContent>
                </Card>
              </li>
            </ol>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Suspense
      fallback={
        <Card className="rounded-lg border bg-card text-card-foreground shadow-sm">
          <CardContent className="p-6 sm:p-8">
            <div className="flex flex-col gap-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-4">
                  <div className="flex size-14 items-center justify-center rounded-full border border-border/70 bg-background/80 text-primary shadow-sm">
                    <MonitorSpeaker className="size-5" />
                  </div>
                  <div className="space-y-1.5">
                    <h2 className="text-3xl font-semibold tracking-tight">
                      Đang chuẩn bị quầy POS
                    </h2>
                    <p className="max-w-2xl text-sm leading-7 text-muted-foreground">
                      Đang nạp ca làm, bàn và menu.
                    </p>
                  </div>
                </div>
                <Badge variant="info">
                  <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" />
                  <span>Đồng bộ quầy bán</span>
                </Badge>
              </div>
              <ol className="grid gap-3 lg:grid-cols-3">
                <li>
                  <Card className="rounded-lg border border-emerald-200 bg-emerald-50 text-card-foreground dark:border-emerald-500/30 dark:bg-emerald-500/10">
                    <CardContent className="p-4">
                      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                        Bước 1
                      </p>
                      <h3 className="mt-2 text-base font-semibold">
                        Phiên hợp lệ
                      </h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Ca làm và thiết bị đã sẵn sàng.
                      </p>
                    </CardContent>
                  </Card>
                </li>
                <li>
                  <Card className="rounded-lg border border-amber-200 bg-amber-50 text-card-foreground dark:border-amber-500/30 dark:bg-amber-500/10">
                    <CardContent className="p-4">
                      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                        Bước 2
                      </p>
                      <h3 className="mt-2 text-base font-semibold">
                        Dựng mặt bàn
                      </h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Đang nạp bàn và món.
                      </p>
                    </CardContent>
                  </Card>
                </li>
                <li>
                  <Card className="rounded-lg border bg-muted/30 text-card-foreground">
                    <CardContent className="p-4">
                      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                        Bước 3
                      </p>
                      <h3 className="mt-2 text-base font-semibold">
                        Sẵn sàng nhận order
                      </h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Mở giao diện POS.
                      </p>
                    </CardContent>
                  </Card>
                </li>
              </ol>
            </div>
          </CardContent>
        </Card>
      }
    >
      <PosMenu
        branchId={branchIdNum}
        categories={menuResult.data as MenuCategory[]}
        tables={tablesList}
        session={session}
        initialTableId={initialTableId}
        initialOrderType={initialOrderType}
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
