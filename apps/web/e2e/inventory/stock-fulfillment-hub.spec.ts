import { expect, test, type Browser, type Page } from "@playwright/test";
import { E2E_AUTH_STORAGE_OWNER } from "../../playwright.config";
import { createServiceClient, resolveUserByEmail } from "./helpers";

const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1440, height: 900 },
] as const;

async function expectHub(
  page: Page,
  path: string,
  actionLabel: RegExp,
  ctaHref: RegExp,
) {
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await page.goto(path, { waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("heading", { name: "Giao nhận" }),
    ).toBeVisible();
    await expect(
      page.getByRole("combobox", { name: "Phân loại" }),
    ).toBeVisible();
    await expect(
      page.getByRole("combobox", { name: "Trạng thái" }),
    ).toBeVisible();
    await expect(page.getByRole("tab")).toHaveCount(0);
    const cta = page.getByRole("link", { name: actionLabel });
    await expect(cta).toHaveAttribute("href", ctaHref);
    const bounds = await cta.boundingBox();
    expect(bounds?.height ?? 0).toBeGreaterThanOrEqual(44);
  }
}

async function login(browser: Browser, email: string, password: string) {
  const context = await browser.newContext({
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
  });
  const page = await context.newPage();
  await page.goto("/login");
  await page.getByRole("textbox", { name: /email/i }).fill(email);
  await page.getByLabel(/mật khẩu|password/i).fill(password);
  await page.getByRole("button", { name: /đăng nhập/i }).click();
  await page.waitForURL((url) => !url.pathname.includes("/login"));
  return { context, page };
}

test("owner sees the central fulfillment queues at required viewports", async ({
  browser,
}) => {
  const context = await browser.newContext({
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    storageState: E2E_AUTH_STORAGE_OWNER,
  });
  const page = await context.newPage();
  try {
    await expectHub(
      page,
      "/inventory/transfers",
      /Điều chuyển thủ công/,
      /^\/inventory\/transfers\/new/,
    );
  } finally {
    await context.close();
  }
});

test("branch and central operators see only their fulfillment workspace", async ({
  browser,
}) => {
  const email = process.env.E2E_INVENTORY_MANAGER_EMAIL;
  const password = process.env.E2E_INVENTORY_MANAGER_PASSWORD;
  test.skip(
    !email || !password,
    "Inventory operator credentials are required.",
  );

  const service = createServiceClient();
  const user = await resolveUserByEmail(service, email!);
  const { data: original, error: originalError } = await service
    .from("profiles")
    .select("position_id, branch_id")
    .eq("id", user.userId)
    .single();
  if (originalError || !original) throw originalError;

  const roles = [
    {
      code: "branch_manager",
      branchKind: "branch",
      path: (branchId: number) => `/br/${branchId}/stock/transfer`,
      actionLabel: /Yêu cầu hàng/,
      cta: (branchId: number) =>
        new RegExp(`^/br/${branchId}/stock/requests/new$`),
    },
    {
      code: "central_supply_ops",
      branchKind: "central_supply",
      path: () => "/inventory/transfers",
      actionLabel: /Điều chuyển thủ công/,
      cta: (branchId: number) =>
        new RegExp(`^/inventory/transfers/new\\?branchId=${branchId}$`),
    },
    {
      code: "central_kitchen_lead",
      branchKind: "central_kitchen",
      path: () => "/inventory/transfers",
      actionLabel: /Yêu cầu Kho Tổng/,
      cta: (branchId: number) =>
        new RegExp(
          `^/inventory/stock-requests/new\\?branchId=${branchId}$`,
        ),
    },
  ] as const;

  try {
    for (const role of roles) {
      const [{ data: position }, { data: branch }] = await Promise.all([
        service
          .from("positions")
          .select("id")
          .eq("tenant_id", user.tenantId)
          .eq("code", role.code)
          .single(),
        service
          .from("branches")
          .select("id")
          .eq("tenant_id", user.tenantId)
          .eq("branch_kind", role.branchKind)
          .eq("is_active", true)
          .limit(1)
          .single(),
      ]);
      if (!position || !branch) throw new Error(`Missing ${role.code} fixture`);

      const { error } = await service
        .from("profiles")
        .update({ position_id: position.id, branch_id: branch.id })
        .eq("id", user.userId);
      if (error) throw error;

      const { context, page } = await login(browser, email!, password!);
      try {
        await expectHub(
          page,
          role.path(branch.id),
          role.actionLabel,
          role.cta(branch.id),
        );
      } finally {
        await context.close();
      }
    }
  } finally {
    await service
      .from("profiles")
      .update({
        position_id: original.position_id,
        branch_id: original.branch_id,
      })
      .eq("id", user.userId);
  }
});
