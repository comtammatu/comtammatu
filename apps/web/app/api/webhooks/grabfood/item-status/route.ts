import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { timingSafeEqual } from "node:crypto";
import { createServiceClient } from "@comtammatu/database/supabase/service";
import {
  GRAB_MENU_MAPPING,
  normalizeMenuName,
  type GrabMappingItem,
} from "@lib/grabfood/mapping";

const querySchema = z.object({
  branch_id: z.coerce.number().int().positive().default(1),
});

function verifyRelaySecret(request: NextRequest): boolean {
  const expectedSecret = process.env.GRAB_RELAY_SECRET;
  if (!expectedSecret) {
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
    // 1. Authenticate request
    if (!verifyRelaySecret(request)) {
      return NextResponse.json(
        { success: false, error: "Xác thực không hợp lệ" },
        { status: 401 },
      );
    }

    const { searchParams } = new URL(request.url);
    const parsed = querySchema.safeParse({
      branch_id: searchParams.get("branch_id") ?? "1",
    });

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Mã chi nhánh không hợp lệ" },
        { status: 400 },
      );
    }

    const branchId = parsed.data.branch_id;
    const supabase = createServiceClient();

    // 2. Fetch menu limits and availability for branch via RPC
    const { data: limitsData, error: limitsError } = await supabase.rpc(
      "list_branch_menu_daily_limits",
      {
        p_branch_id: branchId,
        p_limit_date: undefined,
      },
    );

    if (limitsError) {
      console.error("[Grab Item Status API] RPC error:", limitsError);
      return NextResponse.json(
        { success: false, error: "Lỗi tải hạn mức chi nhánh" },
        { status: 500 },
      );
    }

    // Build reverse map of GRAB_MENU_MAPPING: normalizedName -> grabItemId
    const nameToGrabId = new Map<string, string>();
    for (const [grabId, item] of Object.entries(GRAB_MENU_MAPPING) as [string, GrabMappingItem][]) {
      nameToGrabId.set(normalizeMenuName(item.name), grabId);
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
      
      const isOutOfStock = row.is_disabled || row.available_to_sell === 0;
      const availableStatus = isOutOfStock ? 2 : 1; // 1: Có bán, 2: Hết hàng hôm nay

      return {
        menu_item_id: row.menu_item_id,
        name: row.item_name,
        grab_item_id: grabItemId,
        is_disabled: row.is_disabled,
        available_to_sell: row.available_to_sell,
        available_status: availableStatus,
        stock_capacity: row.stock_capacity,
      };
    });

    return NextResponse.json({
      success: true,
      branch_id: branchId,
      timestamp: Date.now(),
      items: syncItems,
    });
  } catch (error) {
    console.error("[Grab Item Status API] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Lỗi hệ thống khi truy vấn trạng thái món",
      },
      { status: 500 },
    );
  }
}
