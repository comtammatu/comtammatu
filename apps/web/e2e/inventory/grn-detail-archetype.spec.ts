import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@comtammatu/database";
import { E2E_AUTH_STORAGE_OWNER } from "../../playwright.config";
import {
  createServiceClient,
  ensureIngredient,
  ensureInventoryLocation,
  ensureSupplier,
  ensureSupplierItemMapping,
  resolveIngredientBaseUnitId,
  resolveTenantId,
} from "./helpers";

test.use({ storageState: E2E_AUTH_STORAGE_OWNER });
test.describe.configure({ timeout: 60_000 });

const VIEWPORTS = [
  { name: "phone", width: 390, height: 844 },
  { name: "desktop", width: 1280, height: 900 },
] as const;

async function requireOwnerSession(
  page: import("@playwright/test").Page,
  path: string,
) {
  await page.goto(path);
  if (page.url().includes("/login")) {
    test.skip(
      true,
      "GRN archetype smoke needs a live E2E_OWNER session (playwright setup authenticate as test owner).",
    );
  }
}

test.describe("GRN list-first document dialog", () => {
  let centralSupplyId: number;

  test.beforeAll(async () => {
    const supabase = createServiceClient();
    const tenantId = await resolveTenantId(supabase);
    const { data: centralSupply, error } = await supabase
      .from("branches")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("branch_kind", "central_supply")
      .eq("is_active", true)
      .single();
    if (error || !centralSupply) {
      throw new Error("E2E central supply branch is missing.");
    }

    const ingredient = await ensureIngredient(supabase, tenantId, "GRN dialog");
    const supplierId = await ensureSupplier(supabase, tenantId);
    await ensureSupplierItemMapping(
      supabase,
      tenantId,
      supplierId,
      ingredient.id,
    );
    await ensureInventoryLocation(
      supabase,
      tenantId,
      centralSupply.id,
      "warehouse",
    );
    const entryUnitId = await resolveIngredientBaseUnitId(
      supabase,
      tenantId,
      ingredient.id,
    );
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key =
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) {
      throw new Error("E2E Supabase public credentials are missing.");
    }
    const ownerClient = createClient<Database>(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: signInError } = await ownerClient.auth.signInWithPassword({
      email: process.env.E2E_OWNER_EMAIL ?? "keeper@comtammatu.vn",
      password: process.env.E2E_OWNER_PASSWORD ?? "Test1234!",
    });
    if (signInError) throw new Error("Failed to authenticate E2E owner.");

    const { data: requestResult, error: requestError } = await ownerClient.rpc(
      "save_purchase_request" as never,
      {
        p_request_id: null,
        p_branch_id: centralSupply.id,
        p_needed_by: null,
        p_notes: "GRN dialog E2E",
        p_lines: [
          {
            ingredient_id: ingredient.id,
            quantity: 10,
            entry_unit_id: entryUnitId,
          },
        ],
        p_submit: true,
        p_idempotency_key: crypto.randomUUID(),
      } as never,
    );
    const requestId = Number(
      (requestResult as { request_id?: unknown } | null)?.request_id,
    );
    if (requestError || !Number.isSafeInteger(requestId)) {
      throw new Error("Failed to seed E2E purchase request.");
    }

    const { data: requestLine, error: requestLineError } = await ownerClient
      .from("purchase_request_items")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("purchase_request_id", requestId)
      .single();
    if (requestLineError || !requestLine) {
      throw new Error("Failed to resolve E2E purchase request line.");
    }

    const { data: poResult, error: poError } = await ownerClient.rpc(
      "save_purchase_orders_from_request" as never,
      {
        p_request_id: requestId,
        p_orders: [
          {
            supplier_id: supplierId,
            expected_delivery_date: null,
            lines: [
              {
                request_item_id: requestLine.id,
                quantity: 10,
                unit_price: 10000,
              },
            ],
          },
        ],
        p_send: true,
        p_idempotency_key: crypto.randomUUID(),
      } as never,
    );
    const poId = Number(
      (
        poResult as {
          purchase_orders?: Array<{ po_id?: unknown }>;
        } | null
      )?.purchase_orders?.[0]?.po_id,
    );
    if (poError || !Number.isSafeInteger(poId)) {
      throw new Error("Failed to seed E2E purchase order.");
    }

    const { error: grnError } = await ownerClient.rpc(
      "create_grn_draft_from_po" as never,
      {
        p_po_id: poId,
        p_idempotency_key: crypto.randomUUID(),
      } as never,
    );
    if (grnError) throw new Error("Failed to seed E2E GRN.");
    centralSupplyId = centralSupply.id;
  });

  for (const vp of VIEWPORTS) {
    test(`${vp.name}: URL restores the document while the list stays mounted`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await requireOwnerSession(
        page,
        `/inventory/grn?branchId=${centralSupplyId}`,
      );

      const rowCode = page.getByText(/^GRN-/).first();
      await expect(rowCode).toBeVisible({ timeout: 30_000 });
      await rowCode.click();
      await expect(page).toHaveURL(
        /\/inventory\/grn\?.*grnId=\d+.*mode=(receive|view)/,
      );

      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await expect(page.locator("[data-owner-shell-scroll]")).toBeVisible();

      await page.reload();
      await expect(page.getByRole("dialog")).toBeVisible();

      if (vp.name === "phone") {
        const box = await dialog.boundingBox();
        expect(box?.width).toBeGreaterThanOrEqual(vp.width - 2);
        expect(box?.height).toBeGreaterThanOrEqual(vp.height - 2);
      }

      await page.goBack();
      await expect(page).toHaveURL(
        `/inventory/grn?branchId=${centralSupplyId}`,
      );
      await expect(page.getByRole("dialog")).toBeHidden();
      await expect(rowCode).toBeVisible();
    });
  }
});
