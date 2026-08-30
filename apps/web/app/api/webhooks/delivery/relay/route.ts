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
  toDatabaseDeliveryPlatform,
} from "@lib/shopeefood/escpos-parser";
import {
  classifyLegacyOrderCandidates,
  deriveShopeeLegacyLookup,
} from "@lib/shopeefood/legacy-order-dedup";
import { resolveBranchStaffId } from "@lib/grabfood/mapping";
import { mapRelayCreateOrderRpcError } from "@lib/delivery/create-order-rpc-error";

const deliveryRelaySchema = z
  .object({
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
    raw_original_bytes_base64: z.string().max(350_000).optional(),
  })
  .superRefine((value, context) => {
    if (value.ping !== true && value.branch_id === undefined) {
      context.addIssue({
        code: "custom",
        path: ["branch_id"],
        message: "branch_id is required for order relay",
      });
    }
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
    } else if (parsed.data.raw_receipt) {
      // Má Tư Agent supplies on-device OCR text alongside the original raster
      // bytes. Prefer the text for parsing while retaining the bytes in transit
      // for diagnostics and backwards compatibility.
      rawText = parsed.data.raw_receipt;
      shopeeOrder = parseShopeeEscPosStream(parsed.data.raw_receipt);
    } else if (parsed.data.raw_bytes_base64) {
      const rawBuf = Buffer.from(parsed.data.raw_bytes_base64, "base64");
      rawText = extractTextFromEscPos(rawBuf);
      shopeeOrder = parseShopeeEscPosStream(rawBuf);
    }

    if (!shopeeOrder || (!shopeeOrder.items?.length && !shopeeOrder.dishList?.length && !shopeeOrder.orderItems?.length)) {
      return NextResponse.json(
        { success: false, error: "Thiếu dữ liệu đơn hàng hoặc hóa đơn không có món hợp lệ" },
        { status: 400, headers: CORS_HEADERS },
      );
    }

    if (parsed.data.branch_id === undefined) {
      return NextResponse.json(
        { success: false, error: "Thiếu mã chi nhánh" },
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
    const databasePlatform = toDatabaseDeliveryPlatform(platform);
    const requestedBranchId = parsed.data.branch_id;
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
    const legacyLookup =
      databasePlatform === "shopee"
        ? deriveShopeeLegacyLookup(sanitizedDisplayRef || displayRef)
        : null;
    const posDisplayRef = legacyLookup?.shortRef ?? displayRef;

    // 3. Check if order was already processed or manually entered on POS (deduplication)
    const { data: existingOrder, error: existingOrderError } = await supabase
      .from("orders")
      .select("id, order_number, status, payment_status")
      .eq("tenant_id", branch.tenant_id)
      .eq("branch_id", branch.id)
      .eq("delivery_platform", databasePlatform)
      .eq("external_order_ref", sanitizedDisplayRef || displayRef)
      .limit(1)
      .maybeSingle();

    if (existingOrderError) {
      console.error(
        "[Delivery POS Relay] Exact duplicate lookup error:",
        existingOrderError.code,
      );
      return NextResponse.json(
        { success: false, error: "Không thể kiểm tra đơn hàng đã tiếp nhận" },
        { status: 500, headers: CORS_HEADERS },
      );
    }

    if (existingOrder) {
      return NextResponse.json(
        {
          success: true,
          idempotent: true,
          message: "Đơn hàng này đã được nhân viên nhập hoặc hệ thống tiếp nhận trước đó",
          order_id: existingOrder.id,
          order_number: existingOrder.order_number,
          display_id: posDisplayRef,
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

    // Manual Shopee orders historically stored only the last four digits. A
    // unique same-day item match is required before treating that short ref as
    // idempotent; every collision stays quarantined instead of creating a copy.
    if (legacyLookup) {
      const { data: legacyOrders, error: legacyOrdersError } = await supabase
        .from("orders")
        .select("id, order_number")
        .eq("tenant_id", branch.tenant_id)
        .eq("branch_id", branch.id)
        .eq("delivery_platform", databasePlatform)
        .eq("external_order_ref", legacyLookup.shortRef)
        .gte("created_at", legacyLookup.startIso)
        .lt("created_at", legacyLookup.endIso)
        .limit(3);

      if (legacyOrdersError) {
        console.error(
          "[Delivery POS Relay] Legacy duplicate lookup error:",
          legacyOrdersError.code,
        );
        return NextResponse.json(
          { success: false, error: "Không thể đối chiếu đơn nhập tay trước đó" },
          { status: 500, headers: CORS_HEADERS },
        );
      }

      if (legacyOrders.length > 0) {
        const legacyOrderIds = legacyOrders.map((order) => order.id);
        const { data: legacyItems, error: legacyItemsError } = await supabase
          .from("order_items")
          .select("order_id, menu_item_id, item_name, quantity")
          .eq("tenant_id", branch.tenant_id)
          .in("order_id", legacyOrderIds);

        if (legacyItemsError) {
          console.error(
            "[Delivery POS Relay] Legacy duplicate item lookup error:",
            legacyItemsError.code,
          );
          return NextResponse.json(
            { success: false, error: "Không thể đối chiếu món của đơn nhập tay" },
            { status: 500, headers: CORS_HEADERS },
          );
        }

        const classification = classifyLegacyOrderCandidates(
          transformed.items,
          legacyOrders.map((order) => ({
            orderId: order.id,
            items: legacyItems.filter((item) => item.order_id === order.id),
          })),
        );

        if (classification.status === "matched") {
          const matchedOrder = legacyOrders.find(
            (order) => order.id === classification.orderId,
          );
          return NextResponse.json(
            {
              success: true,
              idempotent: true,
              message: "Đơn hàng này đã được nhân viên nhập trước đó",
              order_id: matchedOrder?.id,
              order_number: matchedOrder?.order_number,
              display_id: posDisplayRef,
            },
            { headers: CORS_HEADERS },
          );
        }

        return NextResponse.json(
          {
            success: false,
            error:
              "Mã đơn rút gọn đã tồn tại nhưng chưa thể xác nhận trùng khớp; đơn được giữ chờ để kiểm tra",
          },
          { status: 409, headers: CORS_HEADERS },
        );
      }
    }

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
      p_delivery_platform: databasePlatform,
      p_external_order_ref: posDisplayRef,
    });

    if (rpcError) {
      console.error("[Delivery POS Relay] create_order RPC error:", rpcError.message, rpcError.details, rpcError.code);
      // Never expose raw Postgres/Supabase messages to clients; map known causes.
      const failure = mapRelayCreateOrderRpcError(
        rpcError,
        "Thiếu giá kênh cho một số món — đồng bộ giá kênh trong Thực đơn",
      );
      return NextResponse.json(
        { success: false, error: failure.message, code: failure.code },
        { status: failure.status, headers: CORS_HEADERS },
      );
    }

    const orderId = (rpcResult as { order_id?: number })?.order_id;
    const orderNumber = (rpcResult as { order_number?: string })?.order_number || `GH-${posDisplayRef}`;

    // 8. Keep the POS gross total computed from the restaurant's active menu
    // and option prices. The receipt's lower platform total is settlement after
    // marketplace commission, not a customer discount on the POS order.

    // 9. Leave payment_status 'unpaid' so the order surfaces in the POS
    // "Cần xử lý" list (fetchActiveOrders excludes paid orders). The cashier
    // confirms the platform tender at driver handoff via
    // confirm_platform_payment — marking paid here hid relayed orders from POS.

    return NextResponse.json(
      {
        success: true,
        order_id: orderId,
        order_number: orderNumber,
        display_id: posDisplayRef,
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
