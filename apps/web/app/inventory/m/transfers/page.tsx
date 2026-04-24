import Link from "next/link";
import { redirect } from "next/navigation";
import {
  IconArrowRight,
  IconCircleCheck,
  IconChevronRight,
  IconHistory,
  IconPackageImport,
  IconPackageOff,
  IconSend,
} from "@tabler/icons-react";
import { createClient } from "@comtammatu/database/supabase/server";
import {
  extractClaimsFromAccessToken,
  INVENTORY_OPS_ROLES,
} from "@comtammatu/shared/auth";
import { MobilePage } from "../../_components/mobile/mobile-page";
import { MobileSectionHeader } from "../../_components/mobile/mobile-section-header";
import { MobileEmptyState } from "../../_components/mobile/mobile-empty-state";
import { InteractiveCard } from "../../_components/mobile/interactive-card";
import { formatDate } from "../../_lib/format";
import { getBranchSiteDisplayName } from "../../_lib/branch-site-labels";

type TransferRow = {
  id: number;
  transfer_number: string;
  status: string;
  from_branch_name: string;
  to_branch_name: string;
  created_at: string | null;
  shipped_at: string | null;
};

type Tab = "receive" | "dispatch" | "history";

const TAB_LABELS: Record<Tab, string> = {
  receive: "Cần nhận",
  dispatch: "Cần giao",
  history: "Lịch sử",
};

function classifyTransfer(status: string, viewerBranchId: number | null, fromId: number, toId: number): Tab | null {
  const receiveStates = ["in_transit", "confirmed_ship", "confirmed_receive"];
  const dispatchStates = ["draft"];
  const terminal = ["received", "cancelled", "completed"];
  if (terminal.includes(status)) return "history";
  if (receiveStates.includes(status)) {
    if (viewerBranchId != null && viewerBranchId !== toId && viewerBranchId !== fromId) {
      return "history";
    }
    return "receive";
  }
  if (dispatchStates.includes(status)) return "dispatch";
  return "history";
}

export default async function MobileTransferHome({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab: tabParam } = await searchParams;
  const activeTab: Tab =
    tabParam === "dispatch" || tabParam === "history" ? tabParam : "receive";

  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const claims = extractClaimsFromAccessToken(session?.access_token);
  if (!claims || !INVENTORY_OPS_ROLES.includes(claims.user_role)) {
    redirect("/access-denied?reason=insufficient-permission");
  }

  let query = supabase
    .from("stock_transfers")
    .select(
      "id, transfer_number, status, from_branch_id, to_branch_id, created_at, shipped_at",
    )
    .eq("tenant_id", claims.tenant_id)
    .order("created_at", { ascending: false });
  if (claims.branch_id) {
    query = query.or(
      `from_branch_id.eq.${claims.branch_id},to_branch_id.eq.${claims.branch_id}`,
    );
  }

  const [{ data: transfersData }, { data: branchesData }] = await Promise.all([
    query,
    supabase
      .from("branches")
      .select("id, name, branch_kind")
      .eq("tenant_id", claims.tenant_id),
  ]);

  const branchName = new Map(
    (branchesData ?? []).map(
      (b) => [b.id, getBranchSiteDisplayName(b)] as const,
    ),
  );

  const enriched: TransferRow[] = (transfersData ?? []).map((t) => ({
    id: t.id,
    transfer_number: t.transfer_number,
    status: t.status,
    from_branch_name: branchName.get(t.from_branch_id) ?? "—",
    to_branch_name: branchName.get(t.to_branch_id) ?? "—",
    created_at: t.created_at,
    shipped_at: t.shipped_at,
  }));

  const rawByTab: Record<Tab, TransferRow[]> = {
    receive: [],
    dispatch: [],
    history: [],
  };
  for (const t of enriched) {
    const raw = (transfersData ?? []).find((r) => r.id === t.id);
    if (!raw) continue;
    const classification = classifyTransfer(
      raw.status,
      claims.branch_id,
      raw.from_branch_id,
      raw.to_branch_id,
    );
    if (classification) rawByTab[classification].push(t);
  }

  const rows = rawByTab[activeTab];
  const counts: Record<Tab, number> = {
    receive: rawByTab.receive.length,
    dispatch: rawByTab.dispatch.length,
    history: rawByTab.history.length,
  };

  return (
    <MobilePage>
      <MobileSectionHeader
        backHref="/inventory/m"
        backLabel="Trang chính"
        eyebrow="Điều chuyển"
        title="Phiếu luân chuyển nội bộ"
        description="Nhóm theo việc cần làm ngay bây giờ."
      />

      <nav className="grid grid-cols-3 gap-1 rounded-xl border bg-muted/30 p-1">
        {(Object.keys(TAB_LABELS) as Tab[]).map((tab) => {
          const active = tab === activeTab;
          return (
            <Link
              key={tab}
              href={`/inventory/m/transfers?tab=${tab}`}
              className={`flex min-h-10 items-center justify-center rounded-lg px-2 text-xs font-semibold transition ${
                active
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {TAB_LABELS[tab]}
              {counts[tab] > 0 ? (
                <span
                  className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] ${
                    active ? "bg-primary/15 text-primary" : "bg-muted"
                  }`}
                >
                  {counts[tab]}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      {rows.length === 0 ? (
        <MobileEmptyState
          icon={activeTab === "history" ? IconHistory : IconPackageOff}
          title={
            activeTab === "receive"
              ? "Không có phiếu cần nhận"
              : activeTab === "dispatch"
                ? "Không có phiếu đang soạn"
                : "Chưa có lịch sử điều chuyển"
          }
          description={
            activeTab === "receive"
              ? "Khi kho gửi xác nhận xuất, phiếu sẽ hiện ở đây để bạn nhận."
              : activeTab === "dispatch"
                ? "Tạo phiếu mới ở giao diện desktop nếu cần."
                : "Các phiếu đã hoàn tất sẽ được lưu ở đây."
          }
        />
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((row) => (
            <TransferRowCard
              key={row.id}
              row={row}
              viewerBranchId={claims.branch_id ?? null}
              tab={activeTab}
            />
          ))}
        </div>
      )}
    </MobilePage>
  );
}

function TransferRowCard({
  row,
  viewerBranchId,
  tab,
}: {
  row: TransferRow;
  viewerBranchId: number | null;
  tab: Tab;
}) {
  const statusStyle: Record<string, { label: string; className: string }> = {
    draft: {
      label: "Đang soạn",
      className: "bg-muted text-muted-foreground",
    },
    confirmed_ship: {
      label: "Đã xuất kho",
      className: "bg-info/15 text-info-foreground",
    },
    in_transit: {
      label: "Đang vận chuyển",
      className: "bg-warning/20 text-warning-foreground",
    },
    confirmed_receive: {
      label: "Đang kiểm nhập",
      className: "bg-warning/20 text-warning-foreground",
    },
    received: {
      label: "Đã nhận",
      className: "bg-success/15 text-success-foreground",
    },
    completed: {
      label: "Hoàn thành",
      className: "bg-success/15 text-success-foreground",
    },
    cancelled: {
      label: "Đã hủy",
      className: "bg-destructive/15 text-destructive",
    },
  };
  const style = statusStyle[row.status] ?? {
    label: row.status,
    className: "bg-muted text-muted-foreground",
  };

  const Icon = (() => {
    if (tab === "receive") return IconPackageImport;
    if (tab === "dispatch") return IconSend;
    return IconCircleCheck;
  })();

  const actionHref =
    tab === "receive"
      ? `/inventory/m/transfers/${row.id}/receive`
      : `/inventory/transfers/${row.id}`;

  return (
    <InteractiveCard asChild minHeight="mobile" className="h-auto">
      <Link href={actionHref}>
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate font-mono text-sm font-semibold">
              {row.transfer_number}
            </p>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${style.className}`}
            >
              {style.label}
            </span>
          </div>
          <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
            <span className="truncate">{row.from_branch_name}</span>
            <IconArrowRight className="size-3 shrink-0" />
            <span className="truncate">{row.to_branch_name}</span>
          </p>
          {row.shipped_at || row.created_at ? (
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {formatDate(row.shipped_at ?? row.created_at ?? "")}
              {viewerBranchId != null ? " · kho của bạn" : ""}
            </p>
          ) : null}
        </div>
        <IconChevronRight className="size-4 shrink-0 text-muted-foreground" />
      </Link>
    </InteractiveCard>
  );
}

