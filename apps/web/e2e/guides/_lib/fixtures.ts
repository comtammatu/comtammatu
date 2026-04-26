/**
 * DB state setup helpers cho guide capture — dùng service-role để bypass RLS.
 *
 * Mỗi helper là idempotent: gọi nhiều lần ra cùng kết quả, không leak state
 * giữa scenario.
 *
 * ⚠️ MUTATE DB của test branch. Không chạy trên DB production.
 */

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@comtammatu/database";

function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL và SUPABASE_SERVICE_ROLE_KEY phải có trong .env.test.local",
    );
  }
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export interface CashierContext {
  userId: string;
  email: string;
  tenantId: number;
  branchId: number;
}

let cachedContext: CashierContext | null = null;

/** Resolve cashier test account → tenantId, branchId qua email. */
export async function getCashierContext(): Promise<CashierContext> {
  if (cachedContext) return cachedContext;

  const email = process.env.E2E_CASHIER_EMAIL;
  if (!email) {
    throw new Error("E2E_CASHIER_EMAIL phải có trong .env.test.local");
  }

  const supabase = createServiceClient();
  const {
    data: { users },
    error: listErr,
  } = await supabase.auth.admin.listUsers();
  if (listErr) throw new Error(`listUsers failed: ${listErr.message}`);

  const authUser = users.find((u) => u.email === email);
  if (!authUser) throw new Error(`Cashier user không tìm thấy: ${email}`);

  const { data: profile, error: profErr } = await supabase
    .from("profiles")
    .select("id, tenant_id, branch_id")
    .eq("id", authUser.id)
    .single();
  if (profErr || !profile) {
    throw new Error(`Profile không tìm thấy cho ${email}: ${profErr?.message}`);
  }
  if (!profile.branch_id) {
    throw new Error(`Cashier ${email} chưa được phân chi nhánh`);
  }

  cachedContext = {
    userId: profile.id,
    email,
    tenantId: profile.tenant_id,
    branchId: profile.branch_id,
  };
  return cachedContext;
}

/** Đóng mọi ca POS đang mở của branch. Dùng để có state "form mở ca trống". */
export async function closeAllOpenSessions(
  ctx: CashierContext,
): Promise<void> {
  const supabase = createServiceClient();
  const { data: openSessions } = await supabase
    .from("pos_sessions")
    .select("id, opening_cash")
    .eq("branch_id", ctx.branchId)
    .eq("tenant_id", ctx.tenantId)
    .eq("status", "open");

  for (const session of openSessions ?? []) {
    await supabase
      .from("pos_sessions")
      .update({
        status: "closed",
        closed_at: new Date().toISOString(),
        closed_by: ctx.userId,
        closing_cash: session.opening_cash,
      })
      .eq("id", session.id);
  }
}

/** Đảm bảo branch có ÍT NHẤT N máy POS active. Tạo thêm nếu thiếu. */
export async function ensureMinTerminals(
  ctx: CashierContext,
  minCount: number,
): Promise<void> {
  const supabase = createServiceClient();
  const { data: existing } = await supabase
    .from("pos_terminals")
    .select("id")
    .eq("branch_id", ctx.branchId)
    .eq("tenant_id", ctx.tenantId)
    .eq("is_active", true);

  const have = existing?.length ?? 0;
  for (let i = have; i < minCount; i++) {
    const idx = i + 1;
    await supabase.from("pos_terminals").insert({
      tenant_id: ctx.tenantId,
      branch_id: ctx.branchId,
      name: `Máy quầy ${String.fromCharCode(64 + idx)}`,
      device_id: `guide-fixture-${String(idx)}`,
      is_active: true,
    });
  }
}

/**
 * Đảm bảo có 1 ca mở trên MỌI máy POS active của branch.
 * Dùng để chụp variant "tất cả máy đang có ca mở".
 */
export async function openSessionsOnAllTerminals(
  ctx: CashierContext,
): Promise<void> {
  const supabase = createServiceClient();
  const { data: terminals } = await supabase
    .from("pos_terminals")
    .select("id")
    .eq("branch_id", ctx.branchId)
    .eq("tenant_id", ctx.tenantId)
    .eq("is_active", true);

  for (const terminal of terminals ?? []) {
    const { data: existing } = await supabase
      .from("pos_sessions")
      .select("id")
      .eq("terminal_id", terminal.id)
      .eq("status", "open")
      .maybeSingle();
    if (existing) continue;

    await supabase.from("pos_sessions").insert({
      tenant_id: ctx.tenantId,
      branch_id: ctx.branchId,
      terminal_id: terminal.id,
      opened_by: ctx.userId,
      opening_cash: 0,
      status: "open",
    });
  }
}
