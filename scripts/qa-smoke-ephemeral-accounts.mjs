/**
 * Ephemeral Production QA smoke accounts for Branch Nguyễn Hữu Thọ.
 * Marker: [QA-SMOKE-20260810] in full_name. Create → smoke → delete.
 *
 * Usage (repo root):
 *   node --env-file=apps/web/.env.local scripts/qa-smoke-ephemeral-accounts.mjs create
 *   node --env-file=apps/web/.env.local scripts/qa-smoke-ephemeral-accounts.mjs delete
 *
 * Refuses non-Production URL. Does not touch operational NHT role accounts
 * (quanly.nht@… / thungan.nht@…).
 */
import { createRequire } from "node:module";
import { randomBytes, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const require = createRequire(
  path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "../apps/web/package.json",
  ),
);
const { createClient } = require("@supabase/supabase-js");

const MARKER = "[QA-SMOKE-20260810]";
const SESSION_TAG = "20260810";
const TENANT_SLUG = "comtammatu";
const BRANCH_NAME = "Nguyễn Hữu Thọ";
const OWNER_EMAIL = "owner@comtammatu.com";
const CREDENTIALS_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  `../.tmp/qa-smoke-accounts-${SESSION_TAG}.json`,
);

/** @typedef {{
 *   email: string;
 *   position_code: string;
 *   full_name: string;
 *   emp_code: string;
 * }} AccountSpec */

/** @type {AccountSpec[]} */
const ACCOUNTS = [
  {
    email: `qa.smoke.bm.${SESSION_TAG}@comtammatu.com`,
    position_code: "branch_manager",
    full_name: `QA BM NHT ${MARKER}`,
    emp_code: `QA-SMOKE-BM-${SESSION_TAG}`,
  },
  {
    email: `qa.smoke.cashier.${SESSION_TAG}@comtammatu.com`,
    position_code: "cashier",
    full_name: `QA Cashier NHT ${MARKER}`,
    emp_code: `QA-SMOKE-CASH-${SESSION_TAG}`,
  },
];

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env ${name}`);
  return value;
}

function makePassword() {
  return `QaSmk-${randomBytes(9).toString("base64url")}!`;
}

async function findUserByEmail(service, email) {
  const normalized = email.toLowerCase();
  let page = 1;
  for (;;) {
    const { data, error } = await service.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) throw error;
    const hit = data.users.find((u) => u.email?.toLowerCase() === normalized);
    if (hit) return hit;
    if (data.users.length < 200) return null;
    page += 1;
  }
}

async function createStaffUser(service, {
  email,
  password,
  fullName,
  positionCode,
  branchId,
  tenantId,
  provisionedBy,
}) {
  const token = randomUUID();
  const { error: prepareError } = await service.rpc(
    "prepare_staff_user_provisioning",
    {
      p_token: token,
      p_email: email,
      p_tenant_id: tenantId,
      p_branch_id: branchId,
      p_position_code: positionCode,
      p_full_name: fullName,
      p_provisioned_by: provisionedBy,
    },
  );
  if (prepareError) throw prepareError;

  const { data, error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: fullName,
      provisioning_token: token,
      qa_smoke_marker: MARKER,
    },
  });

  if (error) {
    await service.rpc("cancel_staff_user_provisioning", { p_token: token });
    throw error;
  }

  const { error: clearError } = await service.auth.admin.updateUserById(
    data.user.id,
    {
      user_metadata: {
        full_name: fullName,
        qa_smoke_marker: MARKER,
      },
    },
  );
  if (clearError) {
    await service.auth.admin.deleteUser(data.user.id);
    throw clearError;
  }

  return data.user;
}

async function ensureEmployee(service, tenantId, profileId, empCode) {
  const { data: existing, error: readError } = await service
    .from("employees")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("profile_id", profileId)
    .maybeSingle();
  if (readError) throw readError;

  if (existing) {
    const { error } = await service
      .from("employees")
      .update({
        employee_code: empCode,
        is_active: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id)
      .eq("tenant_id", tenantId);
    if (error) throw error;
    return { id: existing.id, created: false };
  }

  const { data, error } = await service
    .from("employees")
    .insert({
      tenant_id: tenantId,
      profile_id: profileId,
      employee_code: empCode,
      is_active: true,
      start_date: new Date().toISOString().slice(0, 10),
      contract_type: "indefinite",
    })
    .select("id")
    .single();
  if (error) throw error;
  return { id: data.id, created: true };
}

/**
 * Reassign RESTRICT/NO ACTION profile FKs to owner before auth delete.
 * Only touches rows whose actor is in the QA user id list.
 */
async function reassignProfileFks(service, tenantId, fromIds, toId) {
  const tables = [
    ["orders", "created_by"],
    ["orders", "priority_marked_by"],
    ["order_items", "priority_marked_by"],
    ["order_status_history", "changed_by"],
    ["pos_sessions", "opened_by"],
    ["pos_sessions", "closed_by"],
    ["pos_sessions", "variance_approver_user_id"],
    ["stock_movements", "created_by"],
    ["purchase_orders", "created_by"],
    ["goods_received_notes", "created_by"],
    ["goods_received_notes", "received_by"],
    ["stock_transfers", "created_by"],
    ["supplier_invoices", "created_by"],
    ["supplier_credit_notes", "created_by"],
    ["supplier_returns", "created_by"],
    ["supplier_returns", "confirmed_by"],
    ["payments", "created_by"],
    ["kds_tickets", "bumped_by"],
    ["kitchen_send_batches", "created_by"],
    ["finance_fund_entries", "created_by"],
    ["tax_invoices", "created_by"],
    ["branch_network_gate_bypasses", "activated_by"],
  ];

  const summary = [];
  for (const [table, column] of tables) {
    const { data, error } = await service
      .from(table)
      .update({ [column]: toId })
      .eq("tenant_id", tenantId)
      .in(column, fromIds)
      .select("id");
    if (error) {
      // Table/column may not exist, lack tenant_id, or be locked from service_role.
      if (
        error.code === "42P01" ||
        error.code === "42703" ||
        error.code === "42501" ||
        /column|relation|schema cache|permission denied/i.test(error.message)
      ) {
        summary.push({ table, column, skipped: error.message });
        continue;
      }
      throw error;
    }
    summary.push({ table, column, reassigned: data?.length ?? 0 });
  }
  return summary;
}

async function resolveContext(service) {
  const { data: tenant, error: tenantError } = await service
    .from("tenants")
    .select("id")
    .eq("slug", TENANT_SLUG)
    .single();
  if (tenantError) throw tenantError;

  const { data: branch, error: branchError } = await service
    .from("branches")
    .select("id, name, branch_kind")
    .eq("tenant_id", tenant.id)
    .eq("name", BRANCH_NAME)
    .eq("is_active", true)
    .single();
  if (branchError) throw branchError;
  if (branch.branch_kind !== "branch") {
    throw new Error(`${BRANCH_NAME} is not branch_kind=branch`);
  }

  const ownerUser = await findUserByEmail(service, OWNER_EMAIL);
  if (!ownerUser) throw new Error(`Owner provisioner missing: ${OWNER_EMAIL}`);

  return { tenant, branch, ownerUser };
}

async function createAccounts(service) {
  const { tenant, branch, ownerUser } = await resolveContext(service);
  const password = makePassword();
  /** @type {Array<Record<string, unknown>>} */
  const results = [];

  for (const account of ACCOUNTS) {
    let user = await findUserByEmail(service, account.email);
    let action = "updated";

    if (!user) {
      user = await createStaffUser(service, {
        email: account.email,
        password,
        fullName: account.full_name,
        positionCode: account.position_code,
        branchId: branch.id,
        tenantId: tenant.id,
        provisionedBy: ownerUser.id,
      });
      action = "created";
    } else {
      const { error: pwError } = await service.auth.admin.updateUserById(
        user.id,
        {
          password,
          email_confirm: true,
          user_metadata: {
            full_name: account.full_name,
            qa_smoke_marker: MARKER,
          },
        },
      );
      if (pwError) throw pwError;

      const { error: profileError } = await service
        .from("profiles")
        .update({
          full_name: account.full_name,
          is_active: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", user.id)
        .eq("tenant_id", tenant.id);
      if (profileError) throw profileError;
    }

    const { data: profile, error: profileReadError } = await service
      .from("profiles")
      .select("id, full_name, branch_id, is_active")
      .eq("id", user.id)
      .single();
    if (profileReadError) throw profileReadError;
    if (profile.branch_id !== branch.id) {
      throw new Error(
        `${account.email} branch_id=${profile.branch_id}, expected ${branch.id}`,
      );
    }

    const employee = await ensureEmployee(
      service,
      tenant.id,
      user.id,
      account.emp_code,
    );

    results.push({
      email: account.email,
      position_code: account.position_code,
      action,
      user_id: user.id,
      employee_id: employee.id,
      full_name: account.full_name,
      password,
    });
  }

  fs.mkdirSync(path.dirname(CREDENTIALS_PATH), { recursive: true });
  const payload = {
    marker: MARKER,
    session_tag: SESSION_TAG,
    tenant_id: tenant.id,
    branch_id: branch.id,
    branch_name: BRANCH_NAME,
    created_at: new Date().toISOString(),
    accounts: results,
  };
  fs.writeFileSync(CREDENTIALS_PATH, `${JSON.stringify(payload, null, 2)}\n`, {
    mode: 0o600,
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        mode: "create",
        credentials_path: CREDENTIALS_PATH,
        marker: MARKER,
        accounts: results.map((r) => ({
          email: r.email,
          position_code: r.position_code,
          action: r.action,
          user_id: r.user_id,
          full_name: r.full_name,
        })),
      },
      null,
      2,
    ),
  );
  console.error(
    `Credentials written to ${CREDENTIALS_PATH} (gitignored .tmp). Password not printed.`,
  );
}

async function deleteAccounts(service) {
  const { tenant, ownerUser } = await resolveContext(service);
  const userIds = [];
  const found = [];

  for (const account of ACCOUNTS) {
    const user = await findUserByEmail(service, account.email);
    if (!user) {
      found.push({ email: account.email, status: "absent" });
      continue;
    }
    userIds.push(user.id);
    found.push({ email: account.email, status: "found", user_id: user.id });
  }

  let reassign = [];
  if (userIds.length > 0) {
    reassign = await reassignProfileFks(
      service,
      tenant.id,
      userIds,
      ownerUser.id,
    );
  }

  const deleted = [];
  for (const account of ACCOUNTS) {
    const user = await findUserByEmail(service, account.email);
    if (!user) {
      deleted.push({ email: account.email, status: "already_absent" });
      continue;
    }
    const { error } = await service.auth.admin.deleteUser(user.id);
    if (error) throw error;
    deleted.push({ email: account.email, status: "deleted", user_id: user.id });
  }

  if (fs.existsSync(CREDENTIALS_PATH)) {
    fs.unlinkSync(CREDENTIALS_PATH);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        mode: "delete",
        marker: MARKER,
        found,
        reassign,
        deleted,
        credentials_removed: true,
      },
      null,
      2,
    ),
  );
}

async function main() {
  const mode = process.argv[2];
  if (mode !== "create" && mode !== "delete") {
    throw new Error("Usage: …qa-smoke-ephemeral-accounts.mjs create|delete");
  }

  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  if (!url.includes("enloyfnuerqgaqderbwb")) {
    throw new Error(`Refusing non-Production URL: ${url}`);
  }

  const service = createClient(url, requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (mode === "create") await createAccounts(service);
  else await deleteAccounts(service);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
