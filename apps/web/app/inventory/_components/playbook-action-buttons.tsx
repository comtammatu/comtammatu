"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send as IconSend, ShoppingCart as IconShoppingCart, Package as IconPackage } from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import { toast } from "@comtammatu/ui/components/sonner";
import { updatePurchaseOrderStatus } from "../purchase-order-actions";
import { createPurchaseOrdersFromIngredients } from "../purchase-order-actions";
import { createStockRequisitionsFromIngredients } from "../transfer-actions";
import type { PlaybookTask } from "../_lib/playbook-types";

interface ActionContext {
  /** Optional supply branch picked elsewhere — required for Smart Requisition. */
  defaultSupplyBranchId?: number | null;
}

/**
 * Inline action buttons per task `kind`. Tasks without a safe inline action
 * render nothing (the surrounding card still has its deeplink fallback).
 *
 * Adding a new task kind → add a case here. TS exhaustiveness will flag
 * the missing branch via the `_exhaustive` check at the end.
 */
export function PlaybookActionButtons({
  task,
  context,
}: {
  task: PlaybookTask;
  context?: ActionContext;
}) {
  const router = useRouter();
  const [isPending, startAction] = useTransition();

  switch (task.kind) {
    case "po_draft_pending": {
      const handleSendOne = (poId: number) => {
        startAction(async () => {
          const res = await updatePurchaseOrderStatus(poId, "sent");
          if (!res.success) {
            toast.error(res.error ?? "Không thể gửi PO.");
            return;
          }
          toast.success("Đã gửi PO cho NCC.");
          router.refresh();
        });
      };
      const handleSendAll = () => {
        startAction(async () => {
          const ids = task.pos.map((po) => po.id);
          let okCount = 0;
          const errors: string[] = [];
          for (const id of ids) {
            const res = await updatePurchaseOrderStatus(id, "sent");
            if (res.success) okCount += 1;
            else if (res.error) errors.push(res.error);
          }
          if (okCount === ids.length) {
            toast.success(`Đã gửi ${okCount} PO.`);
          } else if (okCount === 0) {
            toast.error(errors[0] ?? "Không thể gửi PO.");
          } else {
            toast.warning(
              `Đã gửi ${okCount}/${ids.length} PO. ${errors[0] ?? ""}`,
            );
          }
          router.refresh();
        });
      };
      const showFirst = task.pos.slice(0, 1)[0];
      return (
        <>
          {showFirst ? (
            <Button
              type="button"
              size="sm"
              onClick={() => handleSendOne(showFirst.id)}
              disabled={isPending}
            >
              <IconSend className="size-3.5" />
              Gửi {showFirst.po_number}
            </Button>
          ) : null}
          {task.pos.length > 1 ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleSendAll}
              disabled={isPending}
            >
              Gửi tất cả ({task.pos.length})
            </Button>
          ) : null}
        </>
      );
    }

    case "reorder_critical": {
      const isProcurement =
        task.branch_kind === "central_warehouse" ||
        task.branch_kind === "central_kitchen";

      const buildItems = () =>
        task.ingredients.map((ing) => ({
          ingredientId: ing.ingredient_id,
          quantity: Math.max(
            ing.reorder * 2 - ing.current,
            ing.reorder - ing.current,
            1,
          ),
          unit: ing.unit || undefined,
        }));

      const handleSmartPo = () => {
        startAction(async () => {
          const res = await createPurchaseOrdersFromIngredients({
            branchId: task.branch_id,
            items: buildItems(),
          });
          if (!res.success || !res.data) {
            toast.error(res.error ?? "Không thể tạo PO.");
            return;
          }
          const data = res.data as {
            pos: Array<{ po_id: number; line_count: number }>;
            unresolved: Array<{ ingredient_id: number; reason: string }>;
          };
          const lineTotal = data.pos.reduce((s, p) => s + p.line_count, 0);
          const parts = [`Đã tạo ${data.pos.length} PO nháp (${lineTotal} dòng)`];
          if (data.unresolved.length > 0)
            parts.push(`${data.unresolved.length} NL thiếu NCC`);
          toast.success(parts.join(" · "));
          if (data.pos.length === 1 && data.pos[0]) {
            router.push(`/inventory/purchase-orders/${data.pos[0].po_id}`);
            return;
          }
          const ids = data.pos.map((p) => p.po_id).join(",");
          router.push(
            `/inventory/purchase-orders?branchId=${task.branch_id}&filter=draft&highlight=${ids}`,
          );
        });
      };

      const handleSmartRequisition = () => {
        const supplyId = context?.defaultSupplyBranchId ?? null;
        if (supplyId == null) {
          toast.error(
            "Chưa có Kho Tổng/Bếp TT để xin hàng. Mở trang Tồn kho để chọn nguồn.",
          );
          return;
        }
        startAction(async () => {
          const res = await createStockRequisitionsFromIngredients({
            toBranchId: task.branch_id,
            fromBranchId: supplyId,
            items: buildItems(),
          });
          if (!res.success || !res.data) {
            toast.error(res.error ?? "Không thể tạo yêu cầu cấp hàng.");
            return;
          }
          const data = res.data as {
            transfer_id: number;
            transfer_number: string;
            line_count: number;
          };
          toast.success(
            `Đã tạo yêu cầu ${data.transfer_number} (${data.line_count} dòng)`,
          );
          router.push(`/inventory/transfers/${data.transfer_id}`);
        });
      };

      if (isProcurement) {
        return (
          <Button
            type="button"
            size="sm"
            onClick={handleSmartPo}
            disabled={isPending || task.ingredients.length === 0}
          >
            <IconShoppingCart className="size-3.5" />
            Tạo PO ngay ({task.ingredients.length})
          </Button>
        );
      }
      return (
        <Button
          type="button"
          size="sm"
          onClick={handleSmartRequisition}
          disabled={isPending || task.ingredients.length === 0}
        >
          <IconPackage className="size-3.5" />
          Yêu cầu cấp hàng ({task.ingredients.length})
        </Button>
      );
    }

    // The remaining task kinds use deeplink-only navigation; the parent
    // PlaybookTaskCard renders the deeplink prop, so no inline button here.
    case "transfer_inbound_unconfirmed":
    case "transfer_outbound_pending":
    case "expiry_urgent":
    case "stocktake_in_progress":
    case "grn_draft_pending":
    case "price_review_pending":
      return null;

    default: {
      const _exhaustive: never = task;
      void _exhaustive;
      return null;
    }
  }
}
