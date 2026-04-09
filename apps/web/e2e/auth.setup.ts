import { test as setup } from "@playwright/test";
import { E2E_AUTH_STORAGE } from "../playwright.config";

/**
 * Global auth setup: logs in as the test cashier and saves the session.
 * This runs once before all E2E tests.
 *
 * Required env vars (in .env.test.local):
 *   E2E_CASHIER_EMAIL    — email of the test cashier account
 *   E2E_CASHIER_PASSWORD — password of the test cashier account
 */
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
