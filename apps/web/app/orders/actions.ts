"use server";

import { z } from "zod";
import { createClient } from "@comtammatu/database/supabase/server";
import type { ActionResult } from "@comtammatu/shared/types";
import { getAuthContext } from "@/_lib/auth";
import type { StaffRole } from "@comtammatu/shared/auth";

/* ─── Allowed roles ─── */

const ALLOWED_ROLES: StaffRole[] = [
  "owner",
  "super_manager",
  "area_manager",
  "branch_manager",
  "cashier",
];

/* ─── Schema ─── */

const fetchOrdersSchema = z.object({
  status: z.string().optional(),
  branchId: z.coerce.number().int().positive().optional(),
  dateFrom: z.string().date().optional(),
  dateTo: z.string().date().optional(),
});

/* ─── Types ─── */

export interface OrderItem {
  id: number;
  item_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  variant_name: string | null;
}

export interface OrderPayment {
  method: string;
  amount: number;
  status: string;
}

export interface OrderRow {
  id: number;
  order_number: string;
  status: string;
  order_type: string;
  subtotal: number;
  tax_amount: number;
  discount_amount: number;
  service_charge: number;
  total_amount: number;
  payment_method: string | null;
  payment_status: string | null;
  created_at: string;
  branch_name: string;
  created_by_name: string;
  items: OrderItem[];
  payment: OrderPayment | null;
}

export type FetchOrdersFilters = {
  status?: string;
  branchId?: number;
  dateFrom?: string;
  dateTo?: string;
};

/* ─── Action ─── */

export async function fetchOrders(
  filters?: FetchOrdersFilters,
): Promise<
  ActionResult<{ orders: OrderRow[]; branches: { id: number; name: string }[] }>
> {
  const parsed = fetchOrdersSchema.safeParse(filters ?? {});
  if (!parsed.success) {
    return { success: false, error: "Bộ lọc không hợp lệ" };
  }

  const ctx = await getAuthContext(ALLOWED_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { claims } = ctx;
  const supabase = await createClient();

  // branch_manager: auto-filter to their branch
  const effectiveBranchId =
    claims.user_role === "branch_manager"
      ? (claims.branch_id ?? undefined)
      : parsed.data.branchId;

  // Build orders query with joins
  // List view: exclude order_items to keep RSC payload small.
  // Items are loaded on-demand when user opens order detail.
  let query = supabase
    .from("orders")
    .select(
      `id,
       order_number,
       status,
       order_type,
       subtotal,
       tax_amount,
       discount_amount,
       service_charge,
       total_amount,
       payment_method,
       payment_status,
       created_at,
       branches(name),
       profiles(full_name),
       payments(method, amount, status)`,
    )
    .order("created_at", { ascending: false })
    .limit(50);

  if (parsed.data.status) {
    query = query.eq("status", parsed.data.status);
  }

  if (effectiveBranchId) {
    query = query.eq("branch_id", effectiveBranchId);
  }

  if (parsed.data.dateFrom) {
    query = query.gte("created_at", parsed.data.dateFrom);
  }

  if (parsed.data.dateTo) {
    // Include the full day by going to end of day
    query = query.lte("created_at", parsed.data.dateTo + "T23:59:59.999Z");
  }

  const { data, error } = await query;

  if (error) {
    return { success: false, error: "Không thể tải đơn hàng" };
  }

  const orders: OrderRow[] = (data ?? []).map((row) => {
    const paymentsArr = Array.isArray(row.payments) ? row.payments : [];
    const firstPayment = paymentsArr[0];

    return {
      id: row.id,
      order_number: row.order_number,
      status: row.status,
      order_type: row.order_type,
      subtotal: row.subtotal,
      tax_amount: row.tax_amount,
      discount_amount: row.discount_amount,
      service_charge: row.service_charge,
      total_amount: row.total_amount,
      payment_method: row.payment_method,
      payment_status: row.payment_status,
      created_at: row.created_at,
      branch_name: (row.branches as { name: string } | null)?.name ?? "—",
      created_by_name:
        (row.profiles as { full_name: string } | null)?.full_name ?? "—",
      items: [],
      payment: firstPayment
        ? {
            method: firstPayment.method,
            amount: firstPayment.amount,
            status: firstPayment.status,
          }
        : null,
    };
  });

  // Fetch branches list (for filter select — managers see all, branch_manager sees only theirs)
  let branchesData: { id: number; name: string }[] = [];

  if (claims.user_role !== "branch_manager") {
    const branchesRes = await supabase
      .from("branches")
      .select("id, name")
      .eq("is_active", true)
      .order("name");

    branchesData = branchesRes.data ?? [];
  } else if (claims.branch_id != null) {
    const branchRes = await supabase
      .from("branches")
      .select("id, name")
      .eq("id", claims.branch_id)
      .single();
    if (branchRes.data) {
      branchesData = [branchRes.data];
    }
  }

  return { success: true, data: { orders, branches: branchesData } };
}
