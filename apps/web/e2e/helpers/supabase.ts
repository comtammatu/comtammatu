import { createClient } from "@supabase/supabase-js";
import type { Database } from "@comtammatu/database";

type ServiceClient = ReturnType<typeof createServiceClient>;

const E2E_MENU_CATEGORY_NAME = "E2E Test Category";
const E2E_MENU_ITEM_NAME = "E2E Test Item";
const E2E_TABLE_NUMBER = 999;

/**
 * Service-role Supabase client for test setup / teardown.
 * Only used in E2E helpers — never in application runtime.
 */
function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set for E2E tests",
    );
  }
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

interface TestStaffProfile {
  userId: string;
  email: string;
  tenantId: number;
  branchId: number;
  fullName: string;
  role: string;
}

interface PosTestContext {
  tenantId: number;
  branchId: number;
  cashier: TestStaffProfile;
  posSessionId: number;
  terminalId: number;
  tableId: number;
  menuItemId: number;
  menuItemName: string;
  unitPrice: number;
}

export interface TestOrder {
  orderId: number;
  orderNumber: string;
  menuItemName: string;
  tenantId: number;
  branchId: number;
  tableId: number;
  kdsTicketId: number;
  totalAmount: number;
  paymentId?: number;
  cleanup: () => Promise<void>;
}

export interface TestKdsTicket {
  branchId: number;
  itemName: string;
  orderId: number;
  orderItemId: number;
  orderNumber: string;
  ticketId: number;
  cleanup: () => Promise<void>;
}

async function listAuthUsers(supabase: ServiceClient) {
  const {
    data: { users },
    error,
  } = await supabase.auth.admin.listUsers();

  if (error) {
    throw new Error(`Failed to list auth users: ${error.message}`);
  }

  return users;
}

async function resolveProfileByEmail(
  supabase: ServiceClient,
  email: string,
): Promise<TestStaffProfile> {
  const users = await listAuthUsers(supabase);
  const authUser = users.find((user) => user.email === email);

  if (!authUser) {
    throw new Error(`Test user not found: ${email}`);
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, tenant_id, branch_id, full_name, role")
    .eq("id", authUser.id)
    .single();

  if (profileError || !profile) {
    throw new Error(
      `Failed to load profile for ${email}: ${profileError?.message ?? "missing profile"}`,
    );
  }

  if (!profile.branch_id) {
    throw new Error(`Test user ${email} does not have a branch assignment`);
  }

  return {
    userId: profile.id,
    email,
    tenantId: profile.tenant_id,
    branchId: profile.branch_id,
    fullName: profile.full_name,
    role: profile.positions?.legacy_role_code ?? "",
  };
}

async function resolveCashierProfile(
  supabase: ServiceClient,
): Promise<TestStaffProfile> {
  const email = process.env.E2E_CASHIER_EMAIL;
  if (!email) {
    throw new Error("E2E_CASHIER_EMAIL must be set in .env.test.local");
  }

  return resolveProfileByEmail(supabase, email);
}

export async function resolveChefCredentials() {
  const supabase = createServiceClient();
  const explicitEmail = process.env.E2E_CHEF_EMAIL;
  const explicitPassword = process.env.E2E_CHEF_PASSWORD;

  if (explicitEmail) {
    return {
      ...(await resolveProfileByEmail(supabase, explicitEmail)),
      password: explicitPassword ?? process.env.E2E_CASHIER_PASSWORD ?? null,
    };
  }

  const cashier = await resolveCashierProfile(supabase);
  const users = await listAuthUsers(supabase);
  const { data: chefProfile, error } = await supabase
    .from("profiles")
    .select("id, tenant_id, branch_id, full_name, positions!inner(legacy_role_code)")
    .eq("tenant_id", cashier.tenantId)
    .eq("branch_id", cashier.branchId)
    .eq("positions.legacy_role_code", "chef")
    .limit(1)
    .maybeSingle();

  if (error || !chefProfile) {
    throw new Error(
      `No chef profile found for branch ${cashier.branchId}: ${error?.message ?? "missing profile"}`,
    );
  }

  const authUser = users.find((user) => user.id === chefProfile.id);
  if (!authUser?.email) {
    throw new Error(
      `Chef auth user missing email for profile ${chefProfile.id}`,
    );
  }

  return {
    userId: chefProfile.id,
    email: authUser.email,
    tenantId: chefProfile.tenant_id,
    branchId: chefProfile.branch_id ?? cashier.branchId,
    fullName: chefProfile.full_name,
    role: chefProfile.role,
    password: explicitPassword ?? process.env.E2E_CASHIER_PASSWORD ?? null,
  };
}

async function ensureMenuItem(
  supabase: ServiceClient,
  tenantId: number,
): Promise<{ id: number; name: string; basePrice: number }> {
  const requestedId = Number(process.env.E2E_TEST_MENU_ITEM_ID ?? "0");

  if (requestedId > 0) {
    const { data: requestedItem } = await supabase
      .from("menu_items")
      .select("id, name, base_price")
      .eq("id", requestedId)
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .maybeSingle();

    if (requestedItem) {
      return {
        id: requestedItem.id,
        name: requestedItem.name,
        basePrice: Number(requestedItem.base_price),
      };
    }
  }

  const { data: existingItem } = await supabase
    .from("menu_items")
    .select("id, name, base_price")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .eq("name", E2E_MENU_ITEM_NAME)
    .maybeSingle();

  if (existingItem) {
    return {
      id: existingItem.id,
      name: existingItem.name,
      basePrice: Number(existingItem.base_price),
    };
  }

  const { data: existingCategory } = await supabase
    .from("menu_categories")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("name", E2E_MENU_CATEGORY_NAME)
    .maybeSingle();

  const categoryId = existingCategory
    ? existingCategory.id
    : await (async () => {
        const { data: insertedCategory, error: categoryError } = await supabase
          .from("menu_categories")
          .insert({
            tenant_id: tenantId,
            name: E2E_MENU_CATEGORY_NAME,
            type: "main_dish",
            sort_order: 999,
            is_active: true,
          })
          .select("id")
          .single();

        if (categoryError || !insertedCategory) {
          throw new Error(
            `Failed to create E2E menu category: ${categoryError?.message}`,
          );
        }

        return insertedCategory.id;
      })();

  const { data: insertedItem, error: itemError } = await supabase
    .from("menu_items")
    .insert({
      tenant_id: tenantId,
      category_id: categoryId,
      name: E2E_MENU_ITEM_NAME,
      description: "Fixture item for POS/KDS smoke tests",
      base_price: 45000,
      is_active: true,
      sort_order: 999,
    })
    .select("id, name, base_price")
    .single();

  if (itemError || !insertedItem) {
    throw new Error(`Failed to create E2E menu item: ${itemError?.message}`);
  }

  return {
    id: insertedItem.id,
    name: insertedItem.name,
    basePrice: Number(insertedItem.base_price),
  };
}

async function ensureTable(
  supabase: ServiceClient,
  tenantId: number,
  branchId: number,
) {
  const { data: existingTable } = await supabase
    .from("tables")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("branch_id", branchId)
    .eq("number", E2E_TABLE_NUMBER)
    .maybeSingle();

  if (existingTable) {
    return existingTable.id;
  }

  const { data: insertedTable, error } = await supabase
    .from("tables")
    .insert({
      tenant_id: tenantId,
      branch_id: branchId,
      number: E2E_TABLE_NUMBER,
      capacity: 4,
      status: "available",
    })
    .select("id")
    .single();

  if (error || !insertedTable) {
    throw new Error(`Failed to create E2E table: ${error?.message}`);
  }

  return insertedTable.id;
}

async function ensureTerminalAndSession(
  supabase: ServiceClient,
  cashier: TestStaffProfile,
) {
  const { data: openSession } = await supabase
    .from("pos_sessions")
    .select("id, terminal_id")
    .eq("tenant_id", cashier.tenantId)
    .eq("branch_id", cashier.branchId)
    .eq("opened_by", cashier.userId)
    .eq("status", "open")
    .maybeSingle();

  if (openSession) {
    return {
      terminalId: openSession.terminal_id,
      posSessionId: openSession.id,
    };
  }

  const terminalName = `E2E POS Terminal ${cashier.userId.slice(0, 8)}`;

  const { data: existingTerminal } = await supabase
    .from("pos_terminals")
    .select("id")
    .eq("tenant_id", cashier.tenantId)
    .eq("branch_id", cashier.branchId)
    .eq("name", terminalName)
    .maybeSingle();

  const terminalId = existingTerminal
    ? existingTerminal.id
    : await (async () => {
        const { data: insertedTerminal, error: terminalError } = await supabase
          .from("pos_terminals")
          .insert({
            tenant_id: cashier.tenantId,
            branch_id: cashier.branchId,
            name: terminalName,
            device_id: `e2e-${cashier.userId.slice(0, 8)}`,
            is_active: true,
          })
          .select("id")
          .single();

        if (terminalError || !insertedTerminal) {
          throw new Error(
            `Failed to create E2E POS terminal: ${terminalError?.message}`,
          );
        }

        return insertedTerminal.id;
      })();

  const { data: insertedSession, error: sessionError } = await supabase
    .from("pos_sessions")
    .insert({
      tenant_id: cashier.tenantId,
      branch_id: cashier.branchId,
      terminal_id: terminalId,
      opened_by: cashier.userId,
      opening_cash: 0,
      status: "open",
    })
    .select("id")
    .single();

  if (sessionError || !insertedSession) {
    throw new Error(
      `Failed to create E2E POS session: ${sessionError?.message}`,
    );
  }

  return { terminalId, posSessionId: insertedSession.id };
}

async function resolvePosTestContext(): Promise<PosTestContext> {
  const supabase = createServiceClient();
  const cashier = await resolveCashierProfile(supabase);
  const [{ terminalId, posSessionId }, tableId, menuItem] = await Promise.all([
    ensureTerminalAndSession(supabase, cashier),
    ensureTable(supabase, cashier.tenantId, cashier.branchId),
    ensureMenuItem(supabase, cashier.tenantId),
  ]);

  return {
    tenantId: cashier.tenantId,
    branchId: cashier.branchId,
    cashier,
    posSessionId,
    terminalId,
    tableId,
    menuItemId: menuItem.id,
    menuItemName: menuItem.name,
    unitPrice: menuItem.basePrice,
  };
}

async function ensureKdsStation(
  supabase: ServiceClient,
  tenantId: number,
  branchId: number,
) {
  const stationName = "E2E KDS Station";

  const { data: existingStation } = await supabase
    .from("kds_stations")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("branch_id", branchId)
    .eq("name", stationName)
    .maybeSingle();

  if (existingStation) {
    return existingStation.id;
  }

  const { data: insertedStation, error } = await supabase
    .from("kds_stations")
    .insert({
      tenant_id: tenantId,
      branch_id: branchId,
      name: stationName,
      position: 999,
      is_active: true,
    })
    .select("id")
    .single();

  if (error || !insertedStation) {
    throw new Error(`Failed to create E2E KDS station: ${error?.message}`);
  }

  return insertedStation.id;
}

export async function createTestOrder(): Promise<TestOrder> {
  const supabase = createServiceClient();
  const context = await resolvePosTestContext();
  const stationId = await ensureKdsStation(
    supabase,
    context.tenantId,
    context.branchId,
  );
  const orderNumber = `E2E-${Date.now()}`;

  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .insert({
      tenant_id: context.tenantId,
      branch_id: context.branchId,
      table_id: context.tableId,
      order_number: orderNumber,
      order_type: "dine_in",
      status: "confirmed",
      payment_status: "unpaid",
      subtotal: context.unitPrice,
      tax_amount: 0,
      service_charge: 0,
      discount_amount: 0,
      total_amount: context.unitPrice,
      customer_count: 1,
      note: "E2E POS payment fixture",
      created_by: context.cashier.userId,
      pos_session_id: context.posSessionId,
    })
    .select("id")
    .single();

  if (orderErr || !order) {
    throw new Error(`Failed to create test order: ${orderErr?.message}`);
  }

  const { data: orderItem, error: itemErr } = await supabase
    .from("order_items")
    .insert({
      tenant_id: context.tenantId,
      order_id: order.id,
      menu_item_id: context.menuItemId,
      item_name: context.menuItemName,
      quantity: 1,
      unit_price: context.unitPrice,
      modifiers: [],
      sides: [],
      subtotal: context.unitPrice,
      status: "pending",
    })
    .select("id")
    .single();

  if (itemErr || !orderItem) {
    throw new Error(`Failed to create test order item: ${itemErr?.message}`);
  }

  const { data: ticket, error: ticketErr } = await supabase
    .from("kds_tickets")
    .insert({
      tenant_id: context.tenantId,
      branch_id: context.branchId,
      station_id: stationId,
      order_id: order.id,
      order_item_id: orderItem.id,
      status: "pending",
      bumped_by: null,
      bumped_at: null,
    })
    .select("id")
    .single();

  if (ticketErr || !ticket) {
    throw new Error(`Failed to create test KDS ticket: ${ticketErr?.message}`);
  }

  await supabase
    .from("tables")
    .update({ status: "occupied" })
    .eq("id", context.tableId)
    .eq("tenant_id", context.tenantId);

  const cleanup = async () => {
    const sb = createServiceClient();

    await sb
      .from("stock_movements")
      .delete()
      .eq("order_id", order.id)
      .eq("tenant_id", context.tenantId);
    await sb
      .from("payments")
      .delete()
      .eq("order_id", order.id)
      .eq("tenant_id", context.tenantId);
    await sb
      .from("kds_tickets")
      .delete()
      .eq("order_id", order.id)
      .eq("tenant_id", context.tenantId);
    await sb
      .from("order_status_history")
      .delete()
      .eq("order_id", order.id)
      .eq("tenant_id", context.tenantId);
    await sb
      .from("order_items")
      .delete()
      .eq("order_id", order.id)
      .eq("tenant_id", context.tenantId);
    await sb
      .from("orders")
      .delete()
      .eq("id", order.id)
      .eq("tenant_id", context.tenantId);
    await sb
      .from("tables")
      .update({ status: "available" })
      .eq("id", context.tableId)
      .eq("tenant_id", context.tenantId);
  };

  return {
    orderId: order.id,
    orderNumber,
    menuItemName: context.menuItemName,
    tenantId: context.tenantId,
    branchId: context.branchId,
    tableId: context.tableId,
    kdsTicketId: ticket.id,
    totalAmount: context.unitPrice,
    cleanup,
  };
}

export async function createKdsTestTicket(): Promise<TestKdsTicket> {
  const supabase = createServiceClient();
  const context = await resolvePosTestContext();
  const stationId = await ensureKdsStation(
    supabase,
    context.tenantId,
    context.branchId,
  );
  const orderNumber = `KDS-E2E-${Date.now()}`;

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .insert({
      tenant_id: context.tenantId,
      branch_id: context.branchId,
      order_number: orderNumber,
      order_type: "takeaway",
      status: "confirmed",
      payment_status: "unpaid",
      subtotal: context.unitPrice,
      tax_amount: 0,
      service_charge: 0,
      discount_amount: 0,
      total_amount: context.unitPrice,
      customer_count: 1,
      note: "E2E KDS fixture",
      created_by: context.cashier.userId,
      pos_session_id: context.posSessionId,
    })
    .select("id")
    .single();

  if (orderError || !order) {
    throw new Error(`Failed to create KDS order: ${orderError?.message}`);
  }

  const { data: orderItem, error: itemError } = await supabase
    .from("order_items")
    .insert({
      tenant_id: context.tenantId,
      order_id: order.id,
      menu_item_id: context.menuItemId,
      item_name: context.menuItemName,
      quantity: 1,
      unit_price: context.unitPrice,
      modifiers: [],
      sides: [],
      subtotal: context.unitPrice,
      status: "pending",
    })
    .select("id")
    .single();

  if (itemError || !orderItem) {
    throw new Error(`Failed to create KDS order item: ${itemError?.message}`);
  }

  const { data: ticket, error: ticketError } = await supabase
    .from("kds_tickets")
    .insert({
      tenant_id: context.tenantId,
      branch_id: context.branchId,
      station_id: stationId,
      order_id: order.id,
      order_item_id: orderItem.id,
      status: "pending",
      bumped_by: null,
      bumped_at: null,
    })
    .select("id")
    .single();

  if (ticketError || !ticket) {
    throw new Error(`Failed to create KDS ticket: ${ticketError?.message}`);
  }

  const cleanup = async () => {
    const sb = createServiceClient();

    await sb
      .from("kds_tickets")
      .delete()
      .eq("order_id", order.id)
      .eq("tenant_id", context.tenantId);
    await sb
      .from("order_status_history")
      .delete()
      .eq("order_id", order.id)
      .eq("tenant_id", context.tenantId);
    await sb
      .from("order_items")
      .delete()
      .eq("order_id", order.id)
      .eq("tenant_id", context.tenantId);
    await sb
      .from("orders")
      .delete()
      .eq("id", order.id)
      .eq("tenant_id", context.tenantId);
  };

  return {
    branchId: context.branchId,
    itemName: context.menuItemName,
    orderId: order.id,
    orderItemId: orderItem.id,
    orderNumber,
    ticketId: ticket.id,
    cleanup,
  };
}

export async function verifyStockConsumed(orderId: number): Promise<boolean> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("stock_movements")
    .select("id")
    .eq("order_id", orderId)
    .eq("type", "consumption")
    .limit(1);

  return (data?.length ?? 0) > 0;
}

export async function getOrderPaymentStatus(
  orderId: number,
): Promise<string | null> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("orders")
    .select("payment_status")
    .eq("id", orderId)
    .single();

  return data?.payment_status ?? null;
}

export async function getOrderStatus(orderId: number): Promise<string | null> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("orders")
    .select("status")
    .eq("id", orderId)
    .single();

  return data?.status ?? null;
}

export async function getTableStatus(
  tableId: number,
): Promise<string | null> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("tables")
    .select("status")
    .eq("id", tableId)
    .single();

  return data?.status ?? null;
}

export async function getKdsTicketStatus(
  ticketId: number,
): Promise<string | null> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("kds_tickets")
    .select("status")
    .eq("id", ticketId)
    .single();

  return data?.status ?? null;
}
