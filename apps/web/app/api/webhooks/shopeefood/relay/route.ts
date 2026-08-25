import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { timingSafeEqual } from "node:crypto";
import { createServiceClient } from "@comtammatu/database/supabase/service";
import {
  transformShopeeOrderPayload,
  type ShopeeOrderRaw,
} from "@lib/shopeefood/mapping";
import { resolveBranchStaffId } from "@lib/grabfood/mapping";

const shopeeRelaySchema = z.object({
  ping: z.boolean().optional(),
  branch_id: z.coerce.number().int().positive().optional(),
  restaurant_id: z.union([z.string(), z.number()]).optional(),
  order: z
    .object({
      orderId: z.union([z.string(), z.number()]).optional(),
      orderCode: z.string().optional(),
      displayId: z.string().optional(),
    })
    .passthrough()
    .optional(),
});

function verifyRelaySecret(request: NextRequest): boolean {
  const expectedSecret = process.env.SHOPEE_RELAY_SECRET;
  if (!expectedSecret) {
    // In local development or staging without configured secret, allow requests
    return true;
  }
  const providedSecret = request.headers.get("x-shopee-relay-secret") || "";
  if (!providedSecret) return false;

  const expectedBuf = Buffer.from(expectedSecret, "utf-8");
  const providedBuf = Buffer.from(providedSecret, "utf-8");
  if (expectedBuf.length !== providedBuf.length) return false;

  return timingSafeEqual(expectedBuf, providedBuf);
}

export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate webhook request
    if (!verifyRelaySecret(request)) {
      return NextResponse.json(
        { success: false, error: "Xác thực không hợp lệ" },
        { status: 401 },
      );
    }

    const body = await request.json().catch(() => null);
    const parsed = shopeeRelaySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Dữ liệu yêu cầu không hợp lệ" },
        { status: 400 },
      );
    }

    // Handle Ping test from Extension
    if (parsed.data.ping) {
      return NextResponse.json({
        success: true,
        message: "ShopeeFood POS Relay API is online and ready",
        timestamp: Date.now(),
      });
    }

    if (!parsed.data.order) {
      return NextResponse.json(
        { success: false, error: "Thiếu dữ liệu đơn hàng" },
        { status: 400 },
      );
    }

    const shopeeOrder = parsed.data.order as unknown as ShopeeOrderRaw;
    const requestedBranchId = parsed.data.branch_id || 1;
    const restaurantId = parsed.data.restaurant_id || shopeeOrder.restaurantId;

    const supabase = createServiceClient();

    // 2. Find branch and tenant
    const { data: branch, error: branchErr } = await supabase
      .from("branches")
      .select("id, tenant_id, code, name")
      .eq("id", requestedBranchId)
      .single();

    if (branchErr || !branch) {
      return NextResponse.json(
        { success: false, error: `Không tìm thấy chi nhánh với mã ${requestedBranchId}` },
        { status: 404 },
      );
    }

    const displayRef =
      shopeeOrder.displayId ||
      shopeeOrder.orderCode ||
      (shopeeOrder.orderId ? String(shopeeOrder.orderId) : "SPF-UNKNOWN");

    // 3. Check if order was already processed or manually entered on POS (deduplication)
    const { data: existingOrder } = await supabase
      .from("orders")
      .select("id, order_number, status, payment_status")
      .eq("tenant_id", branch.tenant_id)
      .eq("branch_id", branch.id)
      .eq("delivery_platform", "shopee")
      .or(`external_order_ref.eq.${displayRef},note.ilike.[ShopeeFood ${displayRef}]%`)
      .neq("status", "cancelled")
      .limit(1)
      .maybeSingle();

    if (existingOrder) {
      return NextResponse.json({
        success: true,
        idempotent: true,
        message: "Đơn hàng này đã được nhân viên nhập hoặc hệ thống tiếp nhận trước đó",
        order_id: existingOrder.id,
        order_number: existingOrder.order_number,
        display_id: displayRef,
      });
    }

    // 4. Query active menu items for this tenant
    const { data: dbMenuItems, error: menuErr } = await supabase
      .from("menu_items")
      .select("id, name, base_price, category_id")
      .eq("tenant_id", branch.tenant_id)
      .eq("is_active", true);

    if (menuErr) {
      console.error("[ShopeeFood POS Relay] Menu fetch error:", menuErr.code);
      return NextResponse.json(
        { success: false, error: "Lỗi tải thực đơn chi nhánh" },
        { status: 500 },
      );
    }

    // 5. Transform Shopee payload to RPC-ready items structure
    const transformed = transformShopeeOrderPayload(shopeeOrder, dbMenuItems ?? []);

    // 6. Find staff profile to act as created_by (prioritize branch_manager -> cashier -> branch staff -> HQ)
    const createdBy = await resolveBranchStaffId(supabase, branch.tenant_id, branch.id);

    if (!createdBy) {
      return NextResponse.json(
        { success: false, error: "Không tìm thấy hồ sơ nhân viên hợp lệ cho chi nhánh" },
        { status: 500 },
      );
    }

    // 7. Create order via create_order RPC
    const { data: rpcResult, error: rpcError } = await supabase.rpc("create_order", {
      p_tenant_id: branch.tenant_id,
      p_branch_id: branch.id,
      p_created_by: createdBy,
      p_items: transformed.items,
      p_order_type: "delivery",
      p_table_id: undefined,
      p_pos_session_id: undefined,
      p_note: transformed.customerNote,
      p_idempotency_key: transformed.idempotencyKey,
      p_delivery_platform: "shopee",
      p_external_order_ref: displayRef,
    });

    if (rpcError) {
      console.error("[ShopeeFood POS Relay] create_order RPC error:", rpcError.code);
      return NextResponse.json(
        {
          success: false,
          error: "Không thể tạo đơn hàng trên POS",
        },
        { status: 500 },
      );
    }

    const orderId = (rpcResult as { order_id?: number })?.order_id;
    const orderNumber = (rpcResult as { order_number?: string })?.order_number || `GH-${displayRef}`;

    // 8. Update payment status to paid / platform
    if (orderId) {
      await supabase
        .from("orders")
        .update({
          payment_status: "paid",
          payment_method: "platform",
          cash_received: transformed.totalAmount,
          cash_change: 0,
        })
        .eq("id", orderId);
    }

    return NextResponse.json({
      success: true,
      order_id: orderId,
      order_number: orderNumber,
      display_id: displayRef,
      items_count: transformed.items.length,
      total_amount: transformed.totalAmount,
      restaurant_id: restaurantId,
    });
  } catch (error) {
    console.error("[ShopeeFood POS Relay] Unexpected error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Lỗi hệ thống khi tiếp nhận đơn ShopeeFood",
      },
      { status: 500 },
    );
  }
}
