/**
 * Owner one-off: ensure Auth + Profile + Employee for every branch-scoped
 * position at Chi nhánh Nguyễn Hữu Thọ. Password: Test1245!
 *
 * Usage (repo root):
 *   node --env-file=apps/web/.env.local scripts/provision-branch-role-accounts.mjs
 */
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(
  path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "../apps/web/package.json",
  ),
);
const { createClient } = require("@supabase/supabase-js");

const PASSWORD = "Test1245!";
const TENANT_SLUG = "comtammatu";
const BRANCH_NAME = "Nguyễn Hữu Thọ";
const OWNER_EMAIL = "owner@comtammatu.com";

/** @typedef {{
 *   email: string;
 *   legacy_emails?: string[];
 *   position_code: string;
 *   full_name: string;
 *   emp_code: string;
 * }} AccountSpec */

/**
 * One QA account per branch-kind position at Nguyễn Hữu Thọ.
 * Email local-part = Vietnamese position label without diacritics, contiguous,
 * plus `.nht` branch tag (e.g. baove.nht@…).
 */
/** @type {AccountSpec[]} */
const BRANCH_ACCOUNTS = [
  {
    email: "quanly.nht@comtammatu.com",
    legacy_emails: [
      "quanlychinhanh.nht@comtammatu.com",
      "manager.nguyenhuutho@comtammatu.com",
    ],
    position_code: "branch_manager",
    full_name: "Quản lý Nguyễn Hữu Thọ",
    emp_code: "EMP-MGR-NHT",
  },
  {
    email: "thungan.nht@comtammatu.com",
    legacy_emails: ["cashier.nguyenhuutho@comtammatu.com"],
    position_code: "cashier",
    full_name: "Thu ngân Nguyễn Hữu Thọ",
    emp_code: "EMP-CASH-NHT",
  },
  {
    email: "bep.nht@comtammatu.com",
    legacy_emails: ["chef.nguyenhuutho@comtammatu.com"],
    position_code: "chef",
    full_name: "Bếp Nguyễn Hữu Thọ",
    emp_code: "EMP-CHEF-NHT",
  },
  {
    email: "quaylenmon.nht@comtammatu.com",
    legacy_emails: ["kitchen.counter.nguyenhuutho@comtammatu.com"],
    position_code: "kitchen_counter",
    full_name: "Quầy lên món Nguyễn Hữu Thọ",
    emp_code: "EMP-KCOUNTER-NHT",
  },
  {
    email: "phubep.nht@comtammatu.com",
    legacy_emails: ["kitchen.helper.nguyenhuutho@comtammatu.com"],
    position_code: "kitchen_helper",
    full_name: "Phụ bếp Nguyễn Hữu Thọ",
    emp_code: "EMP-KHELPER-NHT",
  },
  {
    email: "quaynuong.nht@comtammatu.com",
    legacy_emails: ["grill.counter.nguyenhuutho@comtammatu.com"],
    position_code: "grill_counter",
    full_name: "Quầy nướng Nguyễn Hữu Thọ",
    emp_code: "EMP-GRILL-NHT",
  },
  {
    email: "phucvu.nht@comtammatu.com",
    legacy_emails: ["waiter.nguyenhuutho@comtammatu.com"],
    position_code: "waiter",
    full_name: "Phục vụ Nguyễn Hữu Thọ",
    emp_code: "EMP-WAITER-NHT",
  },
  {
    email: "tapvu.nht@comtammatu.com",
    legacy_emails: ["cleaner.nguyenhuutho@comtammatu.com"],
    position_code: "cleaner",
    full_name: "Tạp vụ Nguyễn Hữu Thọ",
    emp_code: "EMP-CLEANER-NHT",
  },
  {
    email: "baove.nht@comtammatu.com",
    legacy_emails: ["guard.nguyenhuutho@comtammatu.com"],
    position_code: "guard",
    full_name: "Bảo vệ Nguyễn Hữu Thọ",
    emp_code: "EMP-GUARD-NHT",
  },
];

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env ${name}`);
  return value;
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

async function createStaffUser(service, {
  email,
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
    password: PASSWORD,
    email_confirm: true,
    user_metadata: {
      full_name: fullName,
      provisioning_token: token,
    },
  });

  if (error) {
    await service.rpc("cancel_staff_user_provisioning", { p_token: token });
    throw error;
  }

  const { error: clearError } = await service.auth.admin.updateUserById(
    data.user.id,
    { user_metadata: { full_name: fullName } },
  );
  if (clearError) {
    await service.auth.admin.deleteUser(data.user.id);
    throw clearError;
  }

  return data.user;
}

async function main() {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  if (!url.includes("enloyfnuerqgaqderbwb")) {
    throw new Error(`Refusing non-Production URL: ${url}`);
  }

  const service = createClient(url, requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });

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

  const { data: positions, error: positionError } = await service
    .from("positions")
    .select("code")
    .eq("tenant_id", tenant.id)
    .eq("is_active", true);
  if (positionError) throw positionError;
  const positionCodes = new Set(positions.map((p) => p.code));

  const ownerUser = await findUserByEmail(service, OWNER_EMAIL);
  if (!ownerUser) throw new Error(`Owner provisioner missing: ${OWNER_EMAIL}`);

  /** @type {Array<Record<string, unknown>>} */
  const results = [];

  for (const account of BRANCH_ACCOUNTS) {
    if (!positionCodes.has(account.position_code)) {
      results.push({
        email: account.email,
        status: "skipped",
        reason: `position ${account.position_code} not active`,
      });
      continue;
    }

    let user = await findUserByEmail(service, account.email);
    let action = "updated";
    let renamedFrom = null;

    if (!user) {
      for (const legacy of account.legacy_emails ?? []) {
        user = await findUserByEmail(service, legacy);
        if (user) {
          renamedFrom = legacy;
          break;
        }
      }
    }

    if (!user) {
      user = await createStaffUser(service, {
        email: account.email,
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
          email: account.email,
          password: PASSWORD,
          email_confirm: true,
          user_metadata: { full_name: account.full_name },
        },
      );
      if (pwError) throw pwError;
      if (renamedFrom && renamedFrom !== account.email) {
        action = "renamed";
      }

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
      ...(renamedFrom ? { renamed_from: renamedFrom } : {}),
      position_code: account.position_code,
      action,
      user_id: user.id,
      branch_id: profile.branch_id,
      branch_name: BRANCH_NAME,
      employee_id: employee.id,
      employee_created: employee.created,
      password: PASSWORD,
    });
  }

  console.log(
    JSON.stringify(
      { tenant_id: tenant.id, branch_id: branch.id, results },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
