import type { createServiceClient } from "@comtammatu/database/supabase/service";
import { mapRelayCreateOrderRpcError } from "../delivery/create-order-rpc-error";

type ServiceClient = ReturnType<typeof createServiceClient>;

type UntypedRpc = {
  rpc(
    fn: string,
    args: Record<string, unknown>,
  ): PromiseLike<{
    data: unknown;
    error: { message: string; code?: string } | null;
  }>;
};

function asUntypedRpc(client: ServiceClient): UntypedRpc {
  return client as unknown as UntypedRpc;
}

export async function callRelayCancelDeliveryOrder(
  client: ServiceClient,
  args: {
    p_order_id: number;
    p_actor_staff_id: string;
    p_reason: string;
  },
) {
  return asUntypedRpc(client).rpc("relay_cancel_delivery_order", args);
}

export async function callRelayApplyGrabOrderRevision(
  client: ServiceClient,
  args: {
    p_order_id: number;
    p_actor_staff_id: string;
    p_items: unknown;
    p_note: string | null;
    p_reason: string;
  },
) {
  return asUntypedRpc(client).rpc("relay_apply_grab_order_revision", args);
}

export function mapGrabRelayMutationError(
  error: { message?: string; code?: string },
  fallback: string,
) {
  const mapped = mapRelayCreateOrderRpcError(error, fallback);
  const message = error.message ?? "";
  if (
    message.includes("order already paid") ||
    message.includes("order terminal") ||
    message.includes("order not amendable") ||
    message.includes("paid_or_terminal")
  ) {
    return {
      status: 422,
      code: "paid_or_terminal",
      message: "Đơn đã thanh toán hoặc đã kết thúc, không thể sửa hoặc hủy từ Grab",
    };
  }
  if (message.includes("function") && message.includes("does not exist")) {
    return {
      status: 503,
      code: "rpc_unavailable",
      message: "Máy chủ chưa bật sửa/hủy đơn Grab. Đơn mới vẫn tiếp nhận được",
    };
  }
  return mapped;
}
