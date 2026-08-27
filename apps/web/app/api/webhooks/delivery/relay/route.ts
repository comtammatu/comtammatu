import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { timingSafeEqual } from "node:crypto";
import { createServiceClient } from "@comtammatu/database/supabase/service";
import {
  transformShopeeOrderPayload,
  type ShopeeOrderRaw,
} from "@lib/shopeefood/mapping";
import {
  extractTextFromEscPos,
  parseShopeeEscPosStream,
  detectDeliveryPlatform,
} from "@lib/shopeefood/escpos-parser";
import { resolveBranchStaffId } from "@lib/grabfood/mapping";

const deliveryRelaySchema = z.object({
  ping: z.boolean().optional(),
  branch_id: z.coerce.number().int().positive().optional(),
  restaurant_id: z.union([z.string(), z.number()]).optional(),
  platform: z.enum(["shopee", "grab", "be", "greensm"]).optional(),
  order: z
    .object({
      orderId: z.union([z.string(), z.number()]).optional(),
      orderCode: z.string().optional(),
      displayId: z.string().optional(),
    })
    .passthrough()
    .optional(),
  raw_receipt: z.string().max(256 * 1024).optional(),
  raw_bytes_base64: z.string().max(350_000).optional(),
});

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, x-delivery-relay-secret, x-shopee-relay-secret, Authorization",
};

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

function verifyRelaySecret(request: NextRequest): boolean {
  const expectedSecret = process.env.DELIVERY_RELAY_SECRET || process.env.SHOPEE_RELAY_SECRET;
  if (!expectedSecret) {
    if (process.env.NODE_ENV === "production") {
      console.error("[Delivery POS Relay] DELIVERY_RELAY_SECRET / SHOPEE_RELAY_SECRET is not configured in production");
      return false;
    }
    return true;
  }
  const providedSecret =
    request.headers.get("x-delivery-relay-secret") ||
    request.headers.get("x-shopee-relay-secret") ||
    "";
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
        { status: 401, headers: CORS_HEADERS },
      );
    }

    const body = await request.json().catch(() => null);
    const parsed = deliveryRelaySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Dữ liệu yêu cầu không hợp lệ" },
        { status: 400, headers: CORS_HEADERS },
      );
    }

    // Handle connectivity tests from delivery extensions and Má Tư Agent.
    if (parsed.data.ping) {
      return NextResponse.json(
        {
          success: true,
          message: "Delivery POS Relay API is online and ready",
          timestamp: Date.now(),
        },
        { headers: CORS_HEADERS },
      );
    }

    let shopeeOrder: ShopeeOrderRaw | undefined;

    let rawText = "";
    if (parsed.data.order) {
      shopeeOrder = parsed.data.order as unknown as ShopeeOrderRaw;
    } else if (parsed.data.raw_bytes_base64) {
      const rawBuf = Buffer.from(parsed.data.raw_bytes_base64, "base64");
      rawText = extractTextFromEscPos(rawBuf);
      shopeeOrder = parseShopeeEscPosStream(rawBuf);
    } else if (parsed.data.raw_receipt) {
      rawText = parsed.data.raw_receipt;
      shopeeOrder = parseShopeeEscPosStream(parsed.data.raw_receipt);
    }

    if (!shopeeOrder || (!shopeeOrder.items?.length && !shopeeOrder.dishList?.length && !shopeeOrder.orderItems?.length)) {
      return NextResponse.json(
        { success: false, error: "Thiếu dữ liệu đơn hàng hoặc hóa đơn không có món hợp lệ" },
        { status: 400, headers: CORS_HEADERS },
      );
    }

    const detectedPlatform = rawText ? detectDeliveryPlatform(rawText) : null;
    if (rawText && !detectedPlatform) {
      return NextResponse.json(
        { success: false, error: "Không xác định được duy nhất một nguồn sàn từ phiếu in" },
        { status: 422, headers: CORS_HEADERS },
      );
    }
    if (parsed.data.platform && detectedPlatform && parsed.data.platform !== detectedPlatform) {
      return NextResponse.json(
        { success: false, error: "Nguồn sàn khai báo không khớp nội dung phiếu in" },
        { status: 409, headers: CORS_HEADERS },
      );
    }

    // Structured payloads without a platform only come from the legacy ShopeeFood extension.
    const platform = detectedPlatform ?? parsed.data.platform ?? "shopee";
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
        { status: 404, headers: CORS_HEADERS },
      );
    }

    const displayRef =
      shopeeOrder.displayId ||
      shopeeOrder.orderCode ||
      (shopeeOrder.orderId ? String(shopeeOrder.orderId) : "");

    if (!displayRef) {
      return NextResponse.json(
        { success: false, error: "Không thể xác định mã đơn hàng từ hóa đơn in" },
        { status: 400, headers: CORS_HEADERS },
      );
    }

    const sanitizedDisplayRef = displayRef.replace(/[^A-Za-z0-9_-]/g, "");

    // 3. Check if order was already processed or manually entered on POS (deduplication)
    const { data: existingOrder } = await supabase
      .from("orders")
      .select("id, order_number, status, payment_status")
      .eq("tenant_id", branch.tenant_id)
      .eq("branch_id", branch.id)
      .eq("delivery_platform", platform)
      .eq("external_order_ref", sanitizedDisplayRef || displayRef)
      .limit(1)
      .maybeSingle();

    if (existingOrder) {
      return NextResponse.json(
        {
          success: true,
          idempotent: true,
          message: "Đơn hàng này đã được nhân viên nhập hoặc hệ thống tiếp nhận trước đó",
          order_id: existingOrder.id,
          order_number: existingOrder.order_number,
          display_id: displayRef,
        },
        { headers: CORS_HEADERS },
      );
    }

    // 4. Query active menu items for this tenant
    const { data: dbMenuItems, error: menuErr } = await supabase
      .from("menu_items")
      .select("id, name, base_price, category_id")
      .eq("tenant_id", branch.tenant_id)
      .eq("is_active", true);

    if (menuErr) {
      console.error("[Delivery POS Relay] Menu fetch error:", menuErr.code);
      return NextResponse.json(
        { success: false, error: "Lỗi tải thực đơn chi nhánh" },
        { status: 500, headers: CORS_HEADERS },
      );
    }

    // 5. Transform the normalized delivery payload to RPC-ready items.
    const transformed = transformShopeeOrderPayload(shopeeOrder, dbMenuItems ?? []);

    // 6. Find staff profile to act as created_by (prioritize branch_manager -> cashier -> branch staff -> HQ)
    const createdBy = await resolveBranchStaffId(supabase, branch.tenant_id, branch.id);

    if (!createdBy) {
      return NextResponse.json(
        { success: false, error: "Không tìm thấy hồ sơ nhân viên hợp lệ cho chi nhánh" },
        { status: 500, headers: CORS_HEADERS },
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
      p_note: transformed.customerNote ?? undefined,
      p_idempotency_key: transformed.idempotencyKey,
      p_delivery_platform: platform,
      p_external_order_ref: displayRef,
    });

    if (rpcError) {
      console.error("[Delivery POS Relay] create_order RPC error:", rpcError.message, rpcError.details, rpcError.code);
      // Never expose raw Postgres/Supabase messages to clients; map known causes.
      const clientMessage = rpcError.message?.includes("channel_price_missing")
        ? "Thiếu giá kênh cho một số món — đồng bộ giá kênh trong Thực đơn"
        : "Không thể tạo đơn hàng trên POS";
      return NextResponse.json(
        { success: false, error: clientMessage },
        { status: 500, headers: CORS_HEADERS },
      );
    }

    const orderId = (rpcResult as { order_id?: number })?.order_id;
    const orderNumber = (rpcResult as { order_number?: string })?.order_number || `GH-${displayRef}`;

    // 8. Apply an order-level promotion when the platform total is lower.
    if (orderId && transformed.totalAmount > 0) {
      const { data: createdOrder } = await supabase
        .from("orders")
        .select("total_amount")
        .eq("id", orderId)
        .single();

      if (createdOrder && createdOrder.total_amount > transformed.totalAmount) {
        const orderDiscount = createdOrder.total_amount - transformed.totalAmount;
        if (orderDiscount > 0) {
          const { error: discountErr } = await supabase.rpc("apply_order_discount", {
            p_order_id: orderId,
            p_type: "vnd",
            p_value: orderDiscount,
            p_note: `Khuyến mãi / Voucher ${platformDisplayName(platform)}`,
          });
          if (discountErr) {
            console.warn("[Delivery POS Relay] apply_order_discount error:", discountErr.message);
          }
        }
      }
    }

    // 9. Leave payment_status 'unpaid' so the order surfaces in the POS
    // "Cần xử lý" list (fetchActiveOrders excludes paid orders). The cashier
    // confirms the platform tender at driver handoff via
    // confirm_platform_payment — marking paid here hid relayed orders from POS.

    return NextResponse.json(
      {
        success: true,
        order_id: orderId,
        order_number: orderNumber,
        display_id: displayRef,
        items_count: transformed.items.length,
        total_amount: transformed.totalAmount,
        restaurant_id: restaurantId,
      },
      { headers: CORS_HEADERS },
    );
  } catch (error) {
    console.error("[Delivery POS Relay] Unexpected error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Lỗi hệ thống khi tiếp nhận đơn từ sàn giao đồ ăn",
      },
      { status: 500, headers: CORS_HEADERS },
    );
  }
}

function platformDisplayName(platform: "shopee" | "grab" | "be" | "greensm"): string {
  const displayNames = {
    shopee: "ShopeeFood",
    grab: "GrabFood",
    be: "beFood",
    greensm: "GreenSM Food",
  } as const;
  return displayNames[platform];
}
