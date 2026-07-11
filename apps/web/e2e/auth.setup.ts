import { test as setup } from "@playwright/test";
import { E2E_AUTH_STORAGE, E2E_AUTH_STORAGE_MANAGER, E2E_AUTH_STORAGE_OWNER } from "../playwright.config";
import { createServiceClient } from "./inventory/helpers";

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

  // Bind manager profile to Kho Tong (ID = 3) so that session JWT carries branch_id = 3.
  // This satisfies Postgres checks on stock_transfer_mark_in_transit/receive.
  const supabase = createServiceClient();
  const { error: profileErr } = await supabase
    .from("profiles")
    .update({ branch_id: 3 })
    .eq("id", "a0000003-0000-4000-8000-000000000003");
  if (profileErr) {
    throw new Error(`Failed to seed manager profile branch_id: ${profileErr.message}`);
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
  const email = process.env.E2E_OWNER_EMAIL ?? "keeper@comtammatu.vn";
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
