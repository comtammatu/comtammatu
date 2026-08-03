import { test as setup } from "@playwright/test";
import {
  E2E_AUTH_STORAGE,
  E2E_AUTH_STORAGE_MANAGER,
  E2E_AUTH_STORAGE_OWNER,
} from "../playwright.config";
import { resolveUserByEmail } from "./inventory/helpers";
import {
  requireIsolatedE2EEnvironment,
  resolveConfiguredOwnerEmail,
} from "./helpers/environment";
import { createE2EServiceClient } from "./helpers/service-client";

setup.beforeAll(() => {
  requireIsolatedE2EEnvironment();
});

setup("authenticate as test cashier", async ({ page }) => {
  const email = process.env.E2E_CASHIER_EMAIL;
  const password = process.env.E2E_CASHIER_PASSWORD;

  if (!email || !password) {
    throw new Error(
      "E2E_CASHIER_EMAIL and E2E_CASHIER_PASSWORD must be set in .env.test.local",
    );
  }

  await page.goto("/login");
  await page.waitForLoadState("networkidle");

  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');

  // Wait for redirect away from /login
  await page.waitForURL((url) => !url.pathname.includes("/login"), {
    timeout: 15_000,
  });

  // Save auth state for all subsequent tests
  await page.context().storageState({ path: E2E_AUTH_STORAGE });
});

setup("authenticate as test manager", async ({ page }) => {
  const email = process.env.E2E_INVENTORY_MANAGER_EMAIL;
  const password = process.env.E2E_INVENTORY_MANAGER_PASSWORD;

  if (!email || !password) {
    throw new Error(
      "E2E_INVENTORY_MANAGER_EMAIL and E2E_INVENTORY_MANAGER_PASSWORD must be set in .env.test.local",
    );
  }

  const supabase = createE2EServiceClient();
  const manager = await resolveUserByEmail(supabase, email);
  const [
    { data: branch, error: branchError },
    { data: position, error: positionError },
  ] = await Promise.all([
    supabase
      .from("branches")
      .select("id")
      .eq("tenant_id", manager.tenantId)
      .eq("branch_kind", "branch")
      .eq("is_active", true)
      .order("id")
      .limit(1)
      .single(),
    supabase
      .from("positions")
      .select("id")
      .eq("tenant_id", manager.tenantId)
      .eq("code", "branch_manager")
      .single(),
  ]);
  if (branchError || !branch || positionError || !position) {
    throw new Error("Failed to resolve an operable branch manager fixture");
  }
  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .update({ branch_id: branch.id, position_id: position.id })
    .eq("id", manager.userId)
    .select("id")
    .single();
  if (profileErr || !profile) {
    throw new Error(
      `Failed to seed manager profile: ${profileErr?.message ?? "missing profile"}`,
    );
  }

  await page.goto("/login");
  await page.waitForLoadState("networkidle");

  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');

  // Wait for redirect away from /login
  await page.waitForURL((url) => !url.pathname.includes("/login"), {
    timeout: 15_000,
  });

  // Save auth state for all subsequent tests
  await page.context().storageState({ path: E2E_AUTH_STORAGE_MANAGER });
});

setup("authenticate as test owner", async ({ page }) => {
  const email = resolveConfiguredOwnerEmail();
  const password = process.env.E2E_OWNER_PASSWORD ?? "Test1234!";

  await page.goto("/login");
  await page.waitForLoadState("networkidle");

  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');

  await page.waitForURL((url) => !url.pathname.includes("/login"), {
    timeout: 15_000,
  });

  await page.context().storageState({ path: E2E_AUTH_STORAGE_OWNER });
});
