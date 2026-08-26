import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { timingSafeEqual } from "node:crypto";
import { createServiceClient } from "@comtammatu/database/supabase/service";
import { getVNDateString } from "@comtammatu/shared/time";
import {
  GRAB_MENU_MAPPING,
  normalizeMenuName,
  validateGrabMerchantForBranch,
  type GrabMappingItem,
} from "@lib/grabfood/mapping";

const querySchema = z.object({
  branch_id: z.coerce.number().int().positive().default(1),
  merchant_id: z.string().max(100).optional(),
});

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-grab-relay-secret, Authorization",
};

// In-memory rate limiting: 120 requests / min per IP
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + 60000 });
    return true;
  }
  if (entry.count >= 120) {
    return false;
  }
  entry.count++;
  return true;
}

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
      console.error("[Grab POS Relay] GRAB_RELAY_SECRET is not configured in production");
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

export async function GET(request: NextRequest) {
  try {
    // 1. Rate limiting check
    const clientIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anonymous";
    if (!checkRateLimit(clientIp)) {
      return NextResponse.json(
        { success: false, error: "Quá nhiều yêu cầu, vui lòng thử lại sau" },
        { status: 429, headers: CORS_HEADERS },
      );
    }

    // 2. Authenticate request
    if (!verifyRelaySecret(request)) {
      return NextResponse.json(
        { success: false, error: "Xác thực không hợp lệ" },
        { status: 401, headers: CORS_HEADERS },
      );
    }

    const { searchParams } = new URL(request.url);
    const parsed = querySchema.safeParse({
      branch_id: searchParams.get("branch_id") ?? "1",
      merchant_id: searchParams.get("merchant_id") ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Mã chi nhánh không hợp lệ" },
        { status: 400, headers: CORS_HEADERS },
      );
    }

    const branchId = parsed.data.branch_id;
    const merchantId = parsed.data.merchant_id;
    const supabase = createServiceClient();

    // 3. Fetch branch and tenant
    const { data: branch, error: branchErr } = await supabase
      .from("branches")
      .select("id, tenant_id")
      .eq("id", branchId)
      .single();

    if (branchErr || !branch) {
      return NextResponse.json(
        { success: false, error: "Không tìm thấy chi nhánh" },
        { status: 404, headers: CORS_HEADERS },
      );
    }

    // 4. Validate merchant ID if provided
    if (merchantId && !validateGrabMerchantForBranch(branch.id, merchantId)) {
      return NextResponse.json(
        { success: false, error: "Mã quán Grab không khớp với chi nhánh được chỉ định" },
        { status: 403, headers: CORS_HEADERS },
      );
    }

    const todayStr = getVNDateString();

    // 3. Fetch menu limits and availability for branch via service-role enabled RPC
    const { data: limitsData, error: limitsError } = await supabase.rpc(
      "branch_menu_limit_availability",
      {
        p_tenant_id: branch.tenant_id,
        p_branch_id: branch.id,
        p_limit_date: todayStr,
        p_stock_gate_enabled: true,
      },
    );

    if (limitsError) {
      console.error("[Grab Item Status API] RPC error:", limitsError);
      return NextResponse.json(
        { success: false, error: "Lỗi tải hạn mức chi nhánh" },
        { status: 500, headers: CORS_HEADERS },
      );
    }

    // Build reverse map of GRAB_MENU_MAPPING: normalizedName -> grabItemId
    // Only map actual Grab menu items (VNITE...), never modifier options (VNMOD...)
    const nameToGrabId = new Map<string, string>();
    for (const [grabId, item] of Object.entries(GRAB_MENU_MAPPING) as [string, GrabMappingItem][]) {
      if (grabId.startsWith("VNITE")) {
        nameToGrabId.set(normalizeMenuName(item.name), grabId);
      }
    }

    interface MenuLimitRawRow {
      menu_item_id: number;
      item_name: string;
      is_disabled: boolean;
      available_to_sell: number | null;
      sold_today: number;
      stock_capacity: number | null;
      manual_limit_quantity: number | null;
    }

    const rows = (limitsData ?? []) as MenuLimitRawRow[];

    const syncItems = rows.map((row) => {
      const normalized = normalizeMenuName(row.item_name);
      const grabItemId = nameToGrabId.get(normalized) ?? null;
      
      // Grab availableStatus:
      // 1: Có bán (AVAILABLE)
      // 2: Hết hàng hôm nay (UNAVAILABLE_TODAY - tự động mở lại ngày mai)
      // 3: Không về hàng nữa (UNAVAILABLE_INDEFINITELY / DISCONTINUED)
      // 7: Ẩn giấu (HIDDEN)
      let grabStatus: "AVAILABLE" | "UNAVAILABLE_TODAY" | "UNAVAILABLE_INDEFINITELY" | "HIDDEN";
      let availableStatus: 1 | 2 | 3 | 7;

      if (row.is_disabled) {
        // Tắt món tại chi nhánh / không về hàng nữa
        grabStatus = "UNAVAILABLE_INDEFINITELY";
        availableStatus = 3;
      } else if (row.available_to_sell === 0) {
        // Hết hàng trong ngày hôm nay
        grabStatus = "UNAVAILABLE_TODAY";
        availableStatus = 2;
      } else {
        // Có bán bình thường
        grabStatus = "AVAILABLE";
        availableStatus = 1;
      }

      const maxStock =
        row.stock_capacity ??
        row.manual_limit_quantity ??
        (row.available_to_sell != null ? Math.max(row.available_to_sell, 100) : -1);

      return {
        menu_item_id: row.menu_item_id,
        name: row.item_name,
        grab_item_id: grabItemId,
        is_disabled: row.is_disabled,
        available_to_sell: row.available_to_sell,
        available_status: availableStatus,
        grab_status: grabStatus,
        stock_capacity: row.stock_capacity,
        max_stock: maxStock,
      };
    });

    return NextResponse.json(
      {
        success: true,
        branch_id: branchId,
        timestamp: Date.now(),
        items: syncItems,
      },
      { headers: CORS_HEADERS },
    );
  } catch (error) {
    console.error("[Grab Item Status API] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Lỗi hệ thống khi truy vấn trạng thái món",
      },
      { status: 500, headers: CORS_HEADERS },
    );
  }
}
