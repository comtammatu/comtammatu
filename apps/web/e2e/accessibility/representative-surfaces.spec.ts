import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import {
  E2E_AUTH_STORAGE,
  E2E_AUTH_STORAGE_MANAGER,
  E2E_AUTH_STORAGE_OWNER,
} from "../../playwright.config";
import { getCashierProfile, getManagerProfile } from "../helpers/supabase";

const VIEWPORTS = [
  { label: "mobile", width: 390, height: 844 },
  { label: "desktop", width: 1440, height: 900 },
] as const;

const RESPONSIVE_VIEWPORTS = [
  { width: 320, height: 844 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
] as const;

async function expectNoSeriousOrCriticalViolations(
  page: Page,
  surface: string,
) {
  await page.waitForLoadState("load");
  await page.locator("body").waitFor({ state: "visible" });
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  const violations = results.violations.filter(
    (violation) =>
      violation.impact === "serious" || violation.impact === "critical",
  );
  const summary = violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    help: violation.help,
    targets: violation.nodes.map((node) => node.target),
  }));

  expect(violations, `${surface}: ${JSON.stringify(summary, null, 2)}`).toEqual(
    [],
  );
}

async function verifyAtRepresentativeViewports(
  page: Page,
  path: string,
  surface: string,
) {
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await page.goto(path, { waitUntil: "domcontentloaded" });
    await expectNoSeriousOrCriticalViolations(
      page,
      `${surface} (${viewport.label})`,
    );
  }
}

test("login has no serious or critical axe violations", async ({ browser }) => {
  const context = await browser.newContext({
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    storageState: { cookies: [], origins: [] },
  });
  const page = await context.newPage();
  try {
    await verifyAtRepresentativeViewports(page, "/login", "login");
  } finally {
    await context.close();
  }
});

test("offline fallback has no serious or critical axe violations", async ({
  browser,
}) => {
  const context = await browser.newContext({
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    storageState: { cookies: [], origins: [] },
  });
  const page = await context.newPage();
  try {
    await verifyAtRepresentativeViewports(page, "/offline", "offline fallback");
    await page.setViewportSize(VIEWPORTS[0]);
    await page.goto("/offline", { waitUntil: "domcontentloaded" });
    const retryBounds = await page.getByRole("button", { name: "Thử lại" }).boundingBox();
    expect(retryBounds?.width ?? 0).toBeGreaterThanOrEqual(44);
    expect(retryBounds?.height ?? 0).toBeGreaterThanOrEqual(44);
  } finally {
    await context.close();
  }
});

test("access denied recovery has no serious or critical axe violations", async ({
  browser,
}) => {
  const context = await browser.newContext({
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    storageState: { cookies: [], origins: [] },
  });
  const page = await context.newPage();
  try {
    await verifyAtRepresentativeViewports(
      page,
      "/access-denied?reason=insufficient-permission&from=%2Ffinance",
      "access denied recovery",
    );
  } finally {
    await context.close();
  }
});

test("self-order unavailable state has no serious or critical axe violations", async ({
  browser,
}) => {
  const context = await browser.newContext({
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    storageState: { cookies: [], origins: [] },
  });
  const page = await context.newPage();
  try {
    await verifyAtRepresentativeViewports(
      page,
      "/q/invalid-token",
      "self-order unavailable state",
    );
    for (const viewport of RESPONSIVE_VIEWPORTS) {
      await page.setViewportSize(viewport);
      await page.goto("/q/invalid-token", { waitUntil: "domcontentloaded" });
      await page.locator("#main-content").waitFor({ state: "visible" });
      const bounds = await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        innerHeight: window.innerHeight,
        scrollHeight: document.documentElement.scrollHeight,
        scrollWidth: document.documentElement.scrollWidth,
      }));
      expect(bounds.scrollWidth).toBeLessThanOrEqual(bounds.clientWidth);
      expect(bounds.scrollHeight).toBeLessThanOrEqual(bounds.innerHeight);
    }
  } finally {
    await context.close();
  }
});

test("branch operator landing has no serious or critical axe violations", async ({
  browser,
}) => {
  const { branchId } = await getCashierProfile();
  const context = await browser.newContext({
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    storageState: E2E_AUTH_STORAGE,
  });
  const page = await context.newPage();
  try {
    await verifyAtRepresentativeViewports(
      page,
      `/br/${branchId}`,
      "branch operator landing",
    );
  } finally {
    await context.close();
  }
});

test("checkout approvals has no serious or critical axe violations", async ({
  browser,
}) => {
  const { branchId } = await getManagerProfile();
  const context = await browser.newContext({
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    storageState: E2E_AUTH_STORAGE_MANAGER,
  });
  const page = await context.newPage();
  try {
    await verifyAtRepresentativeViewports(
      page,
      `/br/${branchId}/shift/checkout-approvals`,
      "checkout approvals",
    );
  } finally {
    await context.close();
  }
});

test("owner inventory list has no serious or critical axe violations", async ({
  browser,
}) => {
  const context = await browser.newContext({
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    storageState: E2E_AUTH_STORAGE_OWNER,
  });
  const page = await context.newPage();
  try {
    await verifyAtRepresentativeViewports(
      page,
      "/inventory/stock",
      "owner inventory stock",
    );
  } finally {
    await context.close();
  }
});
