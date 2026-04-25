"use client";

import { InventoryStatChip } from "./inventory-stat-chip";
import { branchHrefOrPath } from "../_lib/href";
import { userDraftsTotal, type UserDrafts } from "../_lib/user-drafts-types";

interface UserDraftsStripProps {
  drafts: UserDrafts;
  branchId: number | null;
}

/**
 * Persistent "Resume drafts" strip — renders inside `<SidebarInset>` above
 * the main page content. Hidden entirely when the user has zero unfinished
 * drafts so empty workspaces don't see a permanent banner spam.
 *
 * Reuses Phase 4's `<InventoryStatChip kind="link">` so disabled chips
 * (count=0) downgrade to plain info instead of navigating into empty lists.
 */
export function UserDraftsStrip({ drafts, branchId }: UserDraftsStripProps) {
  const total = userDraftsTotal(drafts);
  if (total === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1 border-b bg-muted/30 px-4 py-1.5">
      <span className="mr-2 text-xs text-muted-foreground">
        Tiếp tục draft của bạn:
      </span>
      <InventoryStatChip
        kind="link"
        label="PO"
        value={String(drafts.po)}
        disabled={drafts.po === 0}
        href={branchHrefOrPath(branchId, "/inventory/purchase-orders", {
          filter: "draft",
        })}
      />
      <InventoryStatChip
        kind="link"
        label="GRN"
        value={String(drafts.grn)}
        disabled={drafts.grn === 0}
        href={branchHrefOrPath(branchId, "/inventory/grn")}
      />
      <InventoryStatChip
        kind="link"
        label="Điều chuyển"
        value={String(drafts.transfer)}
        disabled={drafts.transfer === 0}
        href={branchHrefOrPath(branchId, "/inventory/transfers")}
      />
      <InventoryStatChip
        kind="link"
        label="Trả NCC"
        value={String(drafts.supplierReturn)}
        disabled={drafts.supplierReturn === 0}
        href={branchHrefOrPath(branchId, "/inventory/supplier-returns")}
      />
      <InventoryStatChip
        kind="link"
        label="Hao hụt chờ duyệt"
        value={String(drafts.wastePending)}
        disabled={drafts.wastePending === 0}
        href={branchHrefOrPath(branchId, "/inventory/waste/approvals")}
      />
      <InventoryStatChip
        kind="link"
        label="Kiểm kê đang mở"
        value={String(drafts.stocktakeOpen)}
        disabled={drafts.stocktakeOpen === 0}
        href={branchHrefOrPath(branchId, "/inventory/stocktake")}
      />
    </div>
  );
}
