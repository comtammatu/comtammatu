import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createServiceClient } from "@comtammatu/database/supabase/service";
import {
  transformGrabOrderPayload,
  resolveBranchStaffId,
  validateGrabMerchantForBranch,
  type GrabOrderRaw,
} from "@lib/grabfood/mapping";
import {
  grabRelaySchema,
  summarizeGrabRelayValidationIssues,
} from "@lib/grabfood/relay-schema";

const MAX_PAYLOAD_BYTES = 64 * 1024; // 64 KB limit per D104

// In-memory rate limiting: 60 requests / min per IP
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + 60000 });
    return true;
  }
  if (entry.count >= 60) {
    return false;
  }
  entry.count++;
  return true;
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, x-grab-relay-secret, Authorization",
};

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

function verifyRelaySecret(request: NextRequest): boolean {
  const expectedSecret = process.env.GRAB_RELAY_SECRET;
  if (!expectedSecret) {
    if (process.env.NODE_ENV === "production") {
      console.error(
        "[Grab POS Relay] GRAB_RELAY_SECRET is not configured in production",
      );
      return false;
    }
    return true;
  }
  const providedSecret = request.headers.get("x-grab-relay-secret") || "";
  if (!providedSecret) return false;

  const expectedBuf = Buffer.from(expectedSecret, "utf-8");
  const providedBuf = Buffer.from(providedSecret, "utf-8");
  if (expectedBuf.length !== providedBuf.length) return false;

  return timingSafeEqual(expectedBuf, providedBuf);
}

export async function POST(request: NextRequest) {
  try {
    // 1. Rate limiting check
    const clientIp =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      "anonymous";
    if (!checkRateLimit(clientIp)) {
      return NextResponse.json(
        { success: false, error: "Quá nhiều yêu cầu, vui lòng thử lại sau" },
        { status: 429, headers: CORS_HEADERS },
      );
    }

    // 2. Authenticate webhook request
    if (!verifyRelaySecret(request)) {
      return NextResponse.json(
        { success: false, error: "Xác thực không hợp lệ" },
        { status: 401, headers: CORS_HEADERS },
      );
    }

    // 3. Payload size check
    const rawBody = await request.text().catch(() => "");
    if (Buffer.byteLength(rawBody, "utf-8") > MAX_PAYLOAD_BYTES) {
      return NextResponse.json(
        { success: false, error: "Dung lượng yêu cầu vượt quá giới hạn 64KB" },
        { status: 413, headers: CORS_HEADERS },
      );
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(rawBody);
    } catch {
      return NextResponse.json(
        { success: false, error: "Dữ liệu JSON không hợp lệ" },
        { status: 400, headers: CORS_HEADERS },
      );
    }

    const parsed = grabRelaySchema.safeParse(parsedJson);
    if (!parsed.success) {
      console.warn("[Grab POS Relay] invalid relay payload", {
        requestId: request.headers.get("x-vercel-id")?.slice(0, 128),
        issues: summarizeGrabRelayValidationIssues(parsed.error),
      });
      return NextResponse.json(
        { success: false, error: "Dữ liệu yêu cầu không hợp lệ" },
        { status: 400, headers: CORS_HEADERS },
      );
    }

    // Handle Ping test from Extension
    if (parsed.data.ping) {
      return NextResponse.json(
        {
          success: true,
          message: "GrabFood POS Relay API is online and ready",
          timestamp: Date.now(),
        },
        { headers: CORS_HEADERS },
      );
    }

    if (!parsed.data.order) {
      return NextResponse.json(
        { success: false, error: "Thiếu dữ liệu đơn hàng Grab" },
        { status: 400, headers: CORS_HEADERS },
      );
    }

    if (parsed.data.branch_id === undefined) {
      return NextResponse.json(
        { success: false, error: "Thiếu mã chi nhánh" },
        { status: 400, headers: CORS_HEADERS },
      );
    }

    const grabOrder = parsed.data.order as unknown as GrabOrderRaw;
    const requestedBranchId = parsed.data.branch_id;
    const merchantId = parsed.data.merchant_id || grabOrder.merchant?.ID;
    const sanitizedDisplayId = (grabOrder.displayID || "").replace(
      /[^A-Za-z0-9_-]/g,
      "",
    );

    // 4. Reject completed/cancelled/history orders immediately
    const rawState = String(
      grabOrder.orderState || grabOrder.state || grabOrder.status || "",
    ).toUpperCase();
    if (
      [
        "COMPLETED",
        "CANCELLED",
        "DELIVERED",
        "EXPIRED",
        "HISTORY",
        "FAILED",
      ].includes(rawState)
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Đơn hàng đã hoàn tất hoặc đã hủy trên Grab, không thể tiếp nhận lại lên POS",
        },
        { status: 422, headers: CORS_HEADERS },
      );
    }

    const supabase = createServiceClient();

    // 5. Find branch and tenant
    const { data: branch, error: branchErr } = await supabase
      .from("branches")
      .select("id, tenant_id, code, name")
      .eq("id", requestedBranchId)
      .single();

    if (branchErr || !branch) {
      return NextResponse.json(
        { success: false, error: "Không tìm thấy chi nhánh" },
        { status: 404, headers: CORS_HEADERS },
      );
    }

    // 6. Cross-branch isolation: Validate that merchantId matches branch
    if (!validateGrabMerchantForBranch(branch.id, merchantId)) {
      return NextResponse.json(
        {
          success: false,
          error: "Mã quán Grab không khớp với chi nhánh được chỉ định",
        },
        { status: 403, headers: CORS_HEADERS },
      );
    }

    // 7. Check if order was already processed or manually entered on POS (deduplication)
    const { data: existingOrder } = await supabase
      .from("orders")
      .select("id, order_number, status, payment_status, external_order_ref")
      .eq("tenant_id", branch.tenant_id)
      .eq("branch_id", branch.id)
      .eq("delivery_platform", "grab")
      .eq("external_order_ref", sanitizedDisplayId || grabOrder.displayID)
      .limit(1)
      .maybeSingle();

    if (existingOrder) {
      return NextResponse.json(
        {
          success: true,
          idempotent: true,
          message:
            "Đơn hàng này đã được nhân viên nhập hoặc hệ thống tiếp nhận trước đó",
          order_id: existingOrder.id,
          order_number: existingOrder.order_number,
          display_id: grabOrder.displayID,
        },
        { headers: CORS_HEADERS },
      );
    }

    // 8. Query active menu items for this tenant
    const { data: dbMenuItems, error: menuErr } = await supabase
      .from("menu_items")
      .select("id, name, base_price, category_id")
      .eq("tenant_id", branch.tenant_id)
      .eq("is_active", true);

    if (menuErr || !dbMenuItems) {
      console.error("[Grab POS Relay] menu query failed:", menuErr);
      return NextResponse.json(
        { success: false, error: "Lỗi tải thực đơn chi nhánh" },
        { status: 500, headers: CORS_HEADERS },
      );
    }

    // 9. Transform Grab payload to RPC-ready items structure
    let transformed;
    try {
      transformed = transformGrabOrderPayload(grabOrder, dbMenuItems);
    } catch (mappingErr) {
      const msg =
        mappingErr instanceof Error ? mappingErr.message : "Lỗi ánh xạ món ăn";
      console.warn("[Grab POS Relay] mapping error:", msg);
      return NextResponse.json(
        { success: false, error: msg },
        { status: 422, headers: CORS_HEADERS },
      );
    }

    // 10. Find staff profile to act as created_by (prioritize branch_manager -> cashier -> branch staff -> HQ)
    const createdBy = await resolveBranchStaffId(
      supabase,
      branch.tenant_id,
      branch.id,
    );

    if (!createdBy) {
      return NextResponse.json(
        {
          success: false,
          error: "Không tìm thấy hồ sơ nhân viên hợp lệ cho chi nhánh",
        },
        { status: 500, headers: CORS_HEADERS },
      );
    }

    // 11. Create order via create_order RPC
    // Note: delivery platform must be 'grab' (allowed: 'grab', 'shopee', 'be', 'green_sm')
    const { data: rpcResult, error: rpcError } = await supabase.rpc(
      "create_order",
      {
        p_tenant_id: branch.tenant_id,
        p_branch_id: branch.id,
        p_created_by: createdBy,
        p_items: transformed.items,
        p_order_type: "delivery",
        p_table_id: undefined,
        p_pos_session_id: undefined,
        p_note: transformed.customerNote ?? undefined,
        p_idempotency_key: transformed.idempotencyKey,
        p_delivery_platform: "grab",
        p_external_order_ref: grabOrder.displayID,
      },
    );

    if (rpcError) {
      console.error(
        "[Grab POS Relay] create_order RPC error:",
        rpcError.message,
        rpcError.details,
        rpcError.code,
      );
      // Never expose raw Postgres/Supabase messages to clients; map known causes.
      const clientMessage = rpcError.message?.includes("channel_price_missing")
        ? "Thiếu giá kênh Grab cho một số món — đồng bộ giá kênh trong Thực đơn"
        : "Không thể tạo đơn hàng trên POS";
      return NextResponse.json(
        { success: false, error: clientMessage },
        { status: 500, headers: CORS_HEADERS },
      );
    }

    const orderId = (rpcResult as { order_id?: number })?.order_id;
    const orderNumber =
      (rpcResult as { order_number?: string })?.order_number ||
      `GH-${grabOrder.displayID}`;

    // 12. Verify stored database total amount against accepted authoritative total
    if (orderId && transformed.totalAmount >= 0) {
      const { data: createdOrder } = await supabase
        .from("orders")
        .select("total_amount")
        .eq("id", orderId)
        .single();

      if (
        createdOrder &&
        createdOrder.total_amount !== transformed.totalAmount
      ) {
        console.warn(
          `[Grab POS Relay] Database total (${createdOrder.total_amount}) does not match authoritative Grab total (${transformed.totalAmount}) for order ${grabOrder.displayID}`,
        );
        return NextResponse.json(
          {
            success: false,
            error:
              "Tổng tiền trên POS không khớp với số tiền thực tế của sàn GrabFood",
          },
          { status: 422, headers: CORS_HEADERS },
        );
      }
    }

    // 13. Leave payment_status 'unpaid' so the order surfaces in the POS
    // "Cần xử lý" list (fetchActiveOrders excludes paid orders). The cashier
    // confirms the platform tender at driver handoff via
    // confirm_platform_payment — marking paid here hid relayed orders from POS.

    return NextResponse.json(
      {
        success: true,
        order_id: orderId,
        order_number: orderNumber,
        display_id: grabOrder.displayID,
        items_count: transformed.items.length,
        total_amount: transformed.totalAmount,
        merchant_id: merchantId,
      },
      { headers: CORS_HEADERS },
    );
  } catch (error) {
    console.error("[Grab POS Relay] Unexpected error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Lỗi hệ thống khi tiếp nhận đơn Grab",
      },
      { status: 500, headers: CORS_HEADERS },
    );
  }
}
