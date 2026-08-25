import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { timingSafeEqual } from "node:crypto";
import { createServiceClient } from "@comtammatu/database/supabase/service";
import { getVNDateString } from "@comtammatu/shared/time";
import {
  SHOPEE_MENU_MAPPING,
  normalizeMenuName,
  type ShopeeMappingItem,
} from "@lib/shopeefood/mapping";

const querySchema = z.object({
  branch_id: z.coerce.number().int().positive().default(1),
});

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-shopee-relay-secret, Authorization",
};

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

function verifyRelaySecret(request: NextRequest): boolean {
  const expectedSecret = process.env.SHOPEE_RELAY_SECRET;
  if (!expectedSecret) {
    if (process.env.NODE_ENV === "production") {
      console.error("[Shopee POS Relay] SHOPEE_RELAY_SECRET is not configured in production");
      return false;
    }
    return true;
  }
  const providedSecret = request.headers.get("x-shopee-relay-secret") || "";
  if (!providedSecret) return false;

  const expectedBuf = Buffer.from(expectedSecret, "utf-8");
  const providedBuf = Buffer.from(providedSecret, "utf-8");
  if (expectedBuf.length !== providedBuf.length) return false;

  return timingSafeEqual(expectedBuf, providedBuf);
}

export async function GET(request: NextRequest) {
  try {
    if (!verifyRelaySecret(request)) {
      return NextResponse.json(
        { success: false, error: "Xác thực không hợp lệ" },
        { status: 401, headers: CORS_HEADERS },
      );
    }

    const { searchParams } = new URL(request.url);
    const parsed = querySchema.safeParse({
      branch_id: searchParams.get("branch_id") ?? "1",
    });

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Mã chi nhánh không hợp lệ" },
        { status: 400, headers: CORS_HEADERS },
      );
    }

    const branchId = parsed.data.branch_id;
    const supabase = createServiceClient();

    // 1. Fetch branch and tenant
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

    const todayStr = getVNDateString();

    // 2. Fetch menu limits and availability for branch via service-role enabled RPC
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
      console.error("[ShopeeFood Item Status API] RPC error:", limitsError);
      return NextResponse.json(
        { success: false, error: "Lỗi tải hạn mức chi nhánh" },
        { status: 500, headers: CORS_HEADERS },
      );
    }

    // Build reverse map of SHOPEE_MENU_MAPPING: normalizedName -> shopeeItemId
    // Only map actual Shopee menu items (SPF_ITEM_...), never modifier options (SPF_MOD_...)
    const nameToShopeeId = new Map<string, string>();
    for (const [shopeeId, item] of Object.entries(SHOPEE_MENU_MAPPING) as [string, ShopeeMappingItem][]) {
      if (shopeeId.startsWith("SPF_ITEM_")) {
        nameToShopeeId.set(normalizeMenuName(item.name), shopeeId);
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
      const shopeeItemId = nameToShopeeId.get(normalized) ?? null;

      const isOutOfStock = row.is_disabled || row.available_to_sell === 0;
      const availableStatus = isOutOfStock ? 2 : 1; // 1: Có bán, 2: Hết hàng hôm nay

      return {
        menu_item_id: row.menu_item_id,
        name: row.item_name,
        shopee_item_id: shopeeItemId,
        is_disabled: row.is_disabled,
        available_to_sell: row.available_to_sell,
        available_status: availableStatus,
        stock_capacity: row.stock_capacity,
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
    console.error("[ShopeeFood Item Status API] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Lỗi hệ thống khi truy vấn trạng thái món",
      },
      { status: 500, headers: CORS_HEADERS },
    );
  }
}
