import { staffRoleFromPositionCode } from "@comtammatu/shared/auth";
import {
  createE2EServiceClient,
  type E2EServiceClient,
} from "./service-client";

type ServiceClient = E2EServiceClient;

const E2E_MENU_CATEGORY_NAME = "E2E Test Category";
const E2E_MENU_ITEM_NAME = "E2E Test Item";
const E2E_TABLE_NUMBER = 999;

const createServiceClient = createE2EServiceClient;

export interface TestStaffProfile {
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
  /** Nullable: pos_sessions.terminal_id is audit metadata (D7); a pre-opened session may have no terminal. */
  terminalId: number | null;
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
  tenantId: number;
  ticketId: number;
  cleanup: () => Promise<void>;
}

export interface TestKdsOrderWithTickets {
  branchId: number;
  orderId: number;
  orderItemIds: number[];
  orderNumber: string;
  paymentStatus: string | null;
  tableId: number;
  ticketIds: number[];
  cleanup: () => Promise<void>;
}

interface CreateKdsTestTicketOptions {
  createdAt?: string;
  isPriority?: boolean;
  orderNumberPrefix?: string;
  status?: "pending" | "preparing" | "ready" | "cancelled";
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
    .select("id, tenant_id, branch_id, full_name, positions(code)")
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
    role: staffRoleFromPositionCode(profile.positions?.code),
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

export async function getCashierProfile(): Promise<TestStaffProfile> {
  return resolveCashierProfile(createServiceClient());
}

export async function getManagerProfile(): Promise<TestStaffProfile> {
  const email = process.env.E2E_INVENTORY_MANAGER_EMAIL;
  if (!email) {
    throw new Error(
      "E2E_INVENTORY_MANAGER_EMAIL must be set in .env.test.local",
    );
  }

  return resolveProfileByEmail(createServiceClient(), email);
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
    .select("id, tenant_id, branch_id, full_name, positions!inner(code)")
    .eq("tenant_id", cashier.tenantId)
    .eq("branch_id", cashier.branchId)
    .eq("positions.code", "chef")
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
    role: chefProfile.positions.code,
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
      vat_rate: 8,
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
    if (openSession.terminal_id == null) {
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
            const { data: insertedTerminal, error: terminalError } =
              await supabase
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
                `Failed to create E2E terminal: ${terminalError?.message}`,
              );
            }
            return insertedTerminal.id;
          })();

      const { error: updateErr } = await supabase
        .from("pos_sessions")
        .update({ terminal_id: terminalId })
        .eq("id", openSession.id);

      if (updateErr) {
        throw new Error(
          `Failed to assign terminal to open session: ${updateErr.message}`,
        );
      }

      return {
        terminalId,
        posSessionId: openSession.id,
      };
    }
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
      vat_rate: 0,
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

export async function createKdsTestTicket(
  options: CreateKdsTestTicketOptions = {},
): Promise<TestKdsTicket> {
  const supabase = createServiceClient();
  const context = await resolvePosTestContext();
  const stationId = await ensureKdsStation(
    supabase,
    context.tenantId,
    context.branchId,
  );
  const orderNumber = `${options.orderNumberPrefix ?? "KDS-E2E"}-${Date.now()}`;
  const status = options.status ?? "pending";

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
      note: "E2E KDS fixture",
      is_priority: options.isPriority === true,
      created_by: context.cashier.userId,
      pos_session_id: context.posSessionId,
      ...(options.createdAt ? { created_at: options.createdAt } : {}),
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
      vat_rate: 0,
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
      status,
      bumped_by: null,
      bumped_at:
        status === "ready" || status === "cancelled"
          ? (options.createdAt ?? new Date().toISOString())
          : null,
      ...(options.createdAt ? { created_at: options.createdAt } : {}),
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
    tenantId: context.tenantId,
    ticketId: ticket.id,
    cleanup,
  };
}

export async function createKdsTestOrderWithTickets(
  statuses: Array<"pending" | "preparing" | "ready" | "cancelled">,
): Promise<TestKdsOrderWithTickets> {
  if (statuses.length === 0) {
    throw new Error(
      "createKdsTestOrderWithTickets requires at least one ticket",
    );
  }

  const supabase = createServiceClient();
  const context = await resolvePosTestContext();
  const stationId = await ensureKdsStation(
    supabase,
    context.tenantId,
    context.branchId,
  );
  const orderNumber = `KDS-MULTI-${Date.now()}`;

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .insert({
      tenant_id: context.tenantId,
      branch_id: context.branchId,
      table_id: context.tableId,
      order_number: orderNumber,
      order_type: "dine_in",
      status: "confirmed",
      payment_status: "unpaid",
      subtotal: context.unitPrice * statuses.length,
      tax_amount: 0,
      service_charge: 0,
      discount_amount: 0,
      total_amount: context.unitPrice * statuses.length,
      note: "E2E KDS multi-ticket fixture",
      created_by: context.cashier.userId,
      pos_session_id: context.posSessionId,
      created_at: new Date(Date.now() + 86_400_000).toISOString(),
    })
    .select("id, payment_status")
    .single();

  if (orderError || !order) {
    throw new Error(`Failed to create KDS multi order: ${orderError?.message}`);
  }

  const ticketIds: number[] = [];
  const orderItemIds: number[] = [];
  for (let index = 0; index < statuses.length; index++) {
    const status = statuses[index]!;
    const { data: orderItem, error: itemError } = await supabase
      .from("order_items")
      .insert({
        tenant_id: context.tenantId,
        order_id: order.id,
        menu_item_id: context.menuItemId,
        item_name: `${context.menuItemName} ${String(index + 1)}`,
        quantity: 1,
        unit_price: context.unitPrice,
        modifiers: [],
        sides: [],
        subtotal: context.unitPrice,
        vat_rate: 0,
        status: status === "cancelled" ? "cancelled" : status,
      })
      .select("id")
      .single();

    if (itemError || !orderItem) {
      throw new Error(
        `Failed to create KDS multi order item: ${itemError?.message}`,
      );
    }

    orderItemIds.push(orderItem.id);

    const { data: ticket, error: ticketError } = await supabase
      .from("kds_tickets")
      .insert({
        tenant_id: context.tenantId,
        branch_id: context.branchId,
        station_id: stationId,
        order_id: order.id,
        order_item_id: orderItem.id,
        status,
        bumped_by: null,
        bumped_at:
          status === "ready" || status === "cancelled"
            ? new Date().toISOString()
            : null,
      })
      .select("id")
      .single();

    if (ticketError || !ticket) {
      throw new Error(
        `Failed to create KDS multi ticket: ${ticketError?.message}`,
      );
    }

    ticketIds.push(ticket.id);
  }

  await supabase
    .from("tables")
    .update({ status: "occupied" })
    .eq("id", context.tableId)
    .eq("tenant_id", context.tenantId);

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
    await sb
      .from("tables")
      .update({ status: "available" })
      .eq("id", context.tableId)
      .eq("tenant_id", context.tenantId);
  };

  return {
    branchId: context.branchId,
    orderId: order.id,
    orderItemIds,
    orderNumber,
    paymentStatus: order.payment_status ?? "unpaid",
    tableId: context.tableId,
    ticketIds,
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

export async function setKdsTestOrderPriority(
  orderId: number,
  isPriority: boolean,
): Promise<void> {
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("orders")
    .update({ is_priority: isPriority })
    .eq("id", orderId);

  if (error) {
    throw new Error(`Failed to update KDS order priority: ${error.message}`);
  }
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

export async function getTableStatus(tableId: number): Promise<string | null> {
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

export async function getKdsTicketStatuses(
  ticketIds: number[],
): Promise<Record<number, string>> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("kds_tickets")
    .select("id, status")
    .in("id", ticketIds);

  return Object.fromEntries(
    (data ?? []).map((row) => [row.id, row.status] as const),
  );
}

/**
 * Force a KDS ticket to `ready` via service role (bypasses bump RPC auth).
 * Used by mixed-status payment test to simulate "chef bumped one item but
 * not the other" before cashier hits Pay.
 */
export async function bumpTicketToReady(ticketId: number): Promise<void> {
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("kds_tickets")
    .update({ status: "ready", bumped_at: new Date().toISOString() })
    .eq("id", ticketId);

  if (error) {
    throw new Error(
      `Failed to bump ticket ${ticketId} to ready: ${error.message}`,
    );
  }
}

/**
 * Add a second order_item + matching kds_ticket to an existing test order.
 * Used by mixed-status payment test to create an order with two items,
 * one of which can be bumped to ready while the other stays pending.
 */
export async function addOrderItemToTestOrder(opts: {
  orderId: number;
  tenantId: number;
  branchId: number;
}): Promise<{ orderItemId: number; ticketId: number }> {
  const supabase = createServiceClient();

  const context = await resolvePosTestContext();
  const stationId = await ensureKdsStation(
    supabase,
    opts.tenantId,
    opts.branchId,
  );

  const { data: orderItem, error: itemErr } = await supabase
    .from("order_items")
    .insert({
      tenant_id: opts.tenantId,
      order_id: opts.orderId,
      menu_item_id: context.menuItemId,
      item_name: `${context.menuItemName} (2)`,
      quantity: 1,
      unit_price: context.unitPrice,
      modifiers: [],
      sides: [],
      subtotal: context.unitPrice,
      vat_rate: 0,
      status: "pending",
    })
    .select("id")
    .single();

  if (itemErr || !orderItem) {
    throw new Error(`Failed to add second item: ${itemErr?.message}`);
  }

  const { data: ticket, error: ticketErr } = await supabase
    .from("kds_tickets")
    .insert({
      tenant_id: opts.tenantId,
      branch_id: opts.branchId,
      station_id: stationId,
      order_id: opts.orderId,
      order_item_id: orderItem.id,
      status: "pending",
    })
    .select("id")
    .single();

  if (ticketErr || !ticket) {
    throw new Error(`Failed to add second ticket: ${ticketErr?.message}`);
  }

  // Recompute order totals to reflect 2 items.
  const { data: items } = await supabase
    .from("order_items")
    .select("subtotal")
    .eq("order_id", opts.orderId)
    .neq("status", "cancelled");

  const subtotal = (items ?? []).reduce(
    (sum, row) => sum + Number(row.subtotal ?? 0),
    0,
  );
  await supabase
    .from("orders")
    .update({ subtotal, total_amount: subtotal })
    .eq("id", opts.orderId);

  return { orderItemId: orderItem.id, ticketId: ticket.id };
}

/**
 * Read the (post-recompute) subtotal of a single order_item.
 * Used by edit-pending-pricing spec to verify server-side recompute.
 */
export async function getOrderItemSubtotal(
  itemId: number,
): Promise<number | null> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("order_items")
    .select("subtotal")
    .eq("id", itemId)
    .single();

  return data ? Number(data.subtotal) : null;
}

export async function getOrderTotal(orderId: number): Promise<number | null> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("orders")
    .select("total_amount")
    .eq("id", orderId)
    .single();

  return data ? Number(data.total_amount) : null;
}

export async function getOrderDiscountAmount(
  orderId: number,
): Promise<number | null> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("orders")
    .select("discount_amount")
    .eq("id", orderId)
    .single();

  return data ? Number(data.discount_amount) : null;
}

/**
 * Apply a percentage-based discount to an order via service-role write.
 * Mirrors the metadata shape that compute_discount_amount expects so
 * subsequent recompute paths (append/edit/void) honor the percentage.
 */
export async function setOrderDiscountPercent(
  orderId: number,
  percent: number,
): Promise<void> {
  const supabase = createServiceClient();
  const { data: order, error: readErr } = await supabase
    .from("orders")
    .select("subtotal")
    .eq("id", orderId)
    .single();

  if (readErr || !order) {
    throw new Error(`Failed to read order ${orderId}: ${readErr?.message}`);
  }

  const subtotal = Number(order.subtotal);
  const discountAmount = Math.floor((subtotal * percent) / 100);

  const { error } = await supabase
    .from("orders")
    .update({
      discount_type: "pct",
      discount_value: percent,
      // orders_order_discount_metadata_paired: a non-zero order discount must
      // pair order_discount_amount with type/value AND a discount_note ≥3 chars.
      order_discount_amount: discountAmount,
      discount_note: "E2E pricing test",
      discount_amount: discountAmount,
      total_amount: subtotal - discountAmount,
    })
    .eq("id", orderId);

  if (error) {
    throw new Error(`Failed to set discount: ${error.message}`);
  }
}

/**
 * Set today's daily-limit row for (branch, menu item) — creates if absent.
 * `limitQuantity=null` means uncapped; pass an integer to cap.
 */
export async function setBranchMenuDailyLimit(opts: {
  branchId: number;
  tenantId: number;
  menuItemId: number;
  limitQuantity: number | null;
}): Promise<void> {
  const supabase = createServiceClient();
  const today = new Date().toISOString().slice(0, 10);

  const { error } = await supabase.from("branch_menu_item_daily_limits").upsert(
    {
      tenant_id: opts.tenantId,
      branch_id: opts.branchId,
      menu_item_id: opts.menuItemId,
      limit_date: today,
      limit_quantity: opts.limitQuantity,
      is_disabled: false,
      sold_today: 0,
    },
    { onConflict: "branch_id,menu_item_id,limit_date" },
  );

  if (error) {
    throw new Error(`Failed to set daily limit: ${error.message}`);
  }
}

export async function getBranchMenuDailyLimitSoldToday(opts: {
  branchId: number;
  menuItemId: number;
}): Promise<number | null> {
  const supabase = createServiceClient();
  const today = new Date().toISOString().slice(0, 10);

  const { data } = await supabase
    .from("branch_menu_item_daily_limits")
    .select("sold_today")
    .eq("branch_id", opts.branchId)
    .eq("menu_item_id", opts.menuItemId)
    .eq("limit_date", today)
    .maybeSingle();

  return data ? Number(data.sold_today) : null;
}

export async function cleanupBranchMenuDailyLimit(opts: {
  branchId: number;
  menuItemId: number;
}): Promise<void> {
  const supabase = createServiceClient();
  const today = new Date().toISOString().slice(0, 10);

  await supabase
    .from("branch_menu_item_daily_limits")
    .delete()
    .eq("branch_id", opts.branchId)
    .eq("menu_item_id", opts.menuItemId)
    .eq("limit_date", today);
}

/**
 * Resolve a fresh PosTestContext (cashier + branch + menu item + table).
 * Re-export of the internal helper so specs that don't go through
 * createTestOrder can still grab branch/tenant/menuItem ids.
 */
export async function getPosTestContext() {
  return resolvePosTestContext();
}
