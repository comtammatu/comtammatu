import assert from "node:assert/strict";
import {
  expect,
  test,
  type Locator,
  type Page,
  type TestInfo,
} from "@playwright/test";
import { E2E_AUTH_STORAGE_OWNER } from "../../playwright.config";
import { resolveConfiguredOwnerEmail } from "../helpers/environment";
import {
  createE2EServiceClient,
  type E2EServiceClient,
} from "../helpers/service-client";
import { resolveUserByEmail } from "./helpers";

test.use({ storageState: E2E_AUTH_STORAGE_OWNER });
test.describe.configure({ timeout: 120_000 });

type ServiceClient = E2EServiceClient;
type Dimension = "mass" | "volume";

type UnitSeed = {
  key: string;
  code: string;
  name: string;
  dimension?: Dimension;
  isStandard?: boolean;
  standardFactor?: number;
};

type FixtureDefinition = {
  baseKey: string;
  ingredientName: string;
  ingredientSku: string;
  units: UnitSeed[];
};

type FixtureKeys = {
  ingredientName: string;
  ingredientSku: string;
  unitCodes: readonly string[];
};

type SeededFixture = {
  ingredientId: number;
  tenantId: number;
  unitByKey: Map<string, { id: number; name: string }>;
};

async function cleanupFixture(
  supabase: ServiceClient,
  tenantId: number | null,
  fixture: FixtureKeys,
) {
  if (tenantId == null) return;

  const cleanupFailures: string[] = [];
  const { error: ingredientError } = await supabase
    .from("ingredients")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("name", fixture.ingredientName)
    .eq("sku", fixture.ingredientSku);
  if (ingredientError) cleanupFailures.push("ingredient");

  const { error: unitError } = await supabase
    .from("units")
    .delete()
    .eq("tenant_id", tenantId)
    .in("code", [...fixture.unitCodes]);
  if (unitError) cleanupFailures.push("units");

  if (cleanupFailures.length > 0) {
    throw new Error(
      `Failed to clean up E2E fixture rows: ${cleanupFailures.join(", ")}.`,
    );
  }
}

async function reportCleanupFailure(testInfo: TestInfo, cleanupError: unknown) {
  const description =
    cleanupError instanceof Error
      ? cleanupError.message
      : "Unknown E2E fixture cleanup failure.";
  testInfo.annotations.push({ type: "cleanup-failure", description });
  try {
    await testInfo.attach("cleanup-failure", {
      body: Buffer.from(description),
      contentType: "text/plain",
    });
  } catch {
    // The annotation still reports cleanup failure without masking the test error.
  }
}

function fixtureKeys(definition: FixtureDefinition): FixtureKeys {
  return {
    ingredientName: definition.ingredientName,
    ingredientSku: definition.ingredientSku,
    unitCodes: definition.units.map((unit) => unit.code),
  };
}

async function seedBaseOnlyIngredient(
  supabase: ServiceClient,
  tenantId: number,
  definition: FixtureDefinition,
): Promise<SeededFixture> {
  const { data: insertedUnits, error: unitError } = await supabase
    .from("units")
    .insert(
      definition.units.map((unit) => ({
        tenant_id: tenantId,
        code: unit.code,
        name: unit.name,
        dimension: unit.dimension ?? null,
        is_active: true,
        is_standard: unit.isStandard === true,
        standard_factor: unit.standardFactor ?? null,
      })),
    )
    .select("id, code");
  if (
    unitError ||
    insertedUnits == null ||
    insertedUnits.length !== definition.units.length
  ) {
    throw new Error("Failed to seed E2E unit fixtures.");
  }

  const unitByKey = new Map<string, { id: number; name: string }>();
  for (const unit of definition.units) {
    const inserted = insertedUnits.find((row) => row.code === unit.code);
    if (inserted == null) throw new Error(`Missing seeded unit: ${unit.key}.`);
    unitByKey.set(unit.key, { id: inserted.id, name: unit.name });
  }
  const baseUnit = unitByKey.get(definition.baseKey);
  if (baseUnit == null) throw new Error("The E2E base unit is missing.");

  const { data: ingredient, error: ingredientError } = await supabase
    .from("ingredients")
    .insert({
      tenant_id: tenantId,
      name: definition.ingredientName,
      sku: definition.ingredientSku,
      item_kind: "raw_material",
      storage_type: "ambient",
      min_stock_level: 0,
      receipt_unit_id: baseUnit.id,
      issue_unit_id: baseUnit.id,
      production_unit_id: null,
      is_active: true,
    })
    .select("id")
    .single();
  if (ingredientError || ingredient == null) {
    throw new Error("Failed to seed the E2E ingredient fixture.");
  }

  const { error: baseError } = await supabase.from("ingredient_units").insert({
    tenant_id: tenantId,
    ingredient_id: ingredient.id,
    unit_id: baseUnit.id,
    to_base_factor: 1,
    is_base: true,
    anchor_unit_id: null,
    anchor_factor: null,
    sort_order: 0,
    is_active: true,
  });
  if (baseError) throw new Error("Failed to seed the E2E base-unit row.");

  return { ingredientId: ingredient.id, tenantId, unitByKey };
}

async function withBaseOnlyFixture(
  testInfo: TestInfo,
  definition: FixtureDefinition,
  run: (fixture: SeededFixture, supabase: ServiceClient) => Promise<void>,
) {
  const keys = fixtureKeys(definition);
  const supabase = createE2EServiceClient();
  let tenantId: number | null = null;
  let primaryError: unknown;
  let testFailed = false;
  let cleanupError: unknown;

  try {
    const owner = await resolveUserByEmail(
      supabase,
      resolveConfiguredOwnerEmail(),
    );
    if (owner.role !== "owner") {
      throw new Error(
        "Configured E2E Owner identity does not have Owner role.",
      );
    }
    tenantId = owner.tenantId;
    const seeded = await seedBaseOnlyIngredient(supabase, tenantId, definition);
    await run(seeded, supabase);
  } catch (error) {
    testFailed = true;
    primaryError = error;
  } finally {
    try {
      await cleanupFixture(supabase, tenantId, keys);
    } catch (error) {
      cleanupError = error;
    }
  }

  if (testFailed) {
    if (cleanupError != null) {
      await reportCleanupFailure(testInfo, cleanupError);
    }
    throw primaryError;
  }
  if (cleanupError != null) throw cleanupError;
}

function createChainDefinition(label: string): FixtureDefinition {
  const runId = crypto.randomUUID().replaceAll("-", "").slice(0, 10);
  return {
    baseKey: "ml",
    ingredientName: `E2E ${label} ${runId}`,
    ingredientSku: `E2E-${label}-${runId}`,
    units: [
      {
        key: "ml",
        code: `e2e-${label}-${runId}-ml`,
        name: `ml ${runId}`,
      },
      {
        key: "chai",
        code: `e2e-${label}-${runId}-chai`,
        name: `Chai ${runId}`,
      },
      {
        key: "thung",
        code: `e2e-${label}-${runId}-thung`,
        name: `Thùng ${runId}`,
      },
    ],
  };
}

function createStandardDefinition(): FixtureDefinition {
  const runId = crypto.randomUUID().replaceAll("-", "").slice(0, 10);
  return {
    baseKey: "gram",
    ingredientName: `E2E standard ${runId}`,
    ingredientSku: `E2E-standard-${runId}`,
    units: [
      {
        key: "gram",
        code: `e2e-standard-${runId}-g`,
        name: `g ${runId}`,
        dimension: "mass",
        isStandard: true,
        standardFactor: 1,
      },
      {
        key: "kilogram",
        code: `e2e-standard-${runId}-kg`,
        name: `kg ${runId}`,
        dimension: "mass",
        isStandard: true,
        standardFactor: 1000,
      },
      {
        key: "milliliter",
        code: `e2e-standard-${runId}-ml`,
        name: `ml ${runId}`,
        dimension: "volume",
        isStandard: true,
        standardFactor: 1,
      },
    ],
  };
}

function requiredUnit(fixture: SeededFixture, key: string) {
  const unit = fixture.unitByKey.get(key);
  if (unit == null) throw new Error(`Missing E2E unit key: ${key}.`);
  return unit;
}

function ingredientCatalogEntry(page: Page, ingredientName: string) {
  const name = page.getByText(ingredientName, { exact: true });
  const desktopRow = page.getByRole("row").filter({ has: name });
  const responsiveCard = page.getByRole("button").filter({ has: name });
  return desktopRow.or(responsiveCard);
}

async function openIngredientEditor(page: Page, ingredientName: string) {
  await page.goto("/inventory/ingredients");
  await page
    .getByRole("searchbox", { name: "Tìm theo tên hoặc mã hàng" })
    .fill(ingredientName);
  const entry = ingredientCatalogEntry(page, ingredientName);
  await expect(entry).toHaveCount(1);
  await entry.click();
  const dialog = page.getByRole("dialog", { name: "Chỉnh sửa nguyên liệu" });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function addUnitThroughUi(page: Page, dialog: Locator, unitName: string) {
  await dialog.getByRole("combobox", { name: "Thêm đơn vị mới" }).click();
  await page.getByRole("option", { name: unitName, exact: true }).click();
  await expect(relationRow(dialog, unitName)).toHaveCount(1);
}

async function selectAnchorThroughUi(
  page: Page,
  dialog: Locator,
  unitName: string,
  anchorName: string,
) {
  const anchor = dialog.getByLabel(`Quy đổi ${unitName} sang đơn vị`);
  await anchor.click();
  await page.getByRole("option", { name: anchorName, exact: true }).click();
  await expect(anchor).toContainText(anchorName);
}

async function configureManualRelation(
  page: Page,
  dialog: Locator,
  unitName: string,
  anchorName: string,
  factor: string,
) {
  await dialog
    .getByLabel(`Số lượng đơn vị đích trong 1 ${unitName}`)
    .fill(factor);
  await selectAnchorThroughUi(page, dialog, unitName, anchorName);
}

function relationRow(dialog: Locator, unitName: string) {
  return dialog.getByRole("listitem").filter({ hasText: unitName });
}

async function readUnitGraph(supabase: ServiceClient, fixture: SeededFixture) {
  const { data, error } = await supabase
    .from("ingredient_units")
    .select("unit_id, to_base_factor, is_base, anchor_unit_id, anchor_factor")
    .eq("tenant_id", fixture.tenantId)
    .eq("ingredient_id", fixture.ingredientId)
    .order("sort_order", { ascending: true });
  if (error || data == null)
    throw new Error("Failed to read the E2E unit graph.");
  return data.map((row) => ({
    unitId: row.unit_id,
    toBase: Number(row.to_base_factor),
    isBase: row.is_base,
    anchorId: row.anchor_unit_id,
    anchorFactor: row.anchor_factor == null ? null : Number(row.anchor_factor),
  }));
}

async function expectTouchTarget(locator: Locator) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThanOrEqual(48);
  expect(box!.height).toBeGreaterThanOrEqual(48);
}

test("owner builds and persists a three-unit chain through the ingredient editor", async ({
  page,
}, testInfo) => {
  const definition = createChainDefinition("roundtrip");
  await withBaseOnlyFixture(testInfo, definition, async (fixture, supabase) => {
    const unitNames = {
      ml: requiredUnit(fixture, "ml").name,
      chai: requiredUnit(fixture, "chai").name,
      thung: requiredUnit(fixture, "thung").name,
    };
    const mlId = requiredUnit(fixture, "ml").id;
    const chaiId = requiredUnit(fixture, "chai").id;
    const thungId = requiredUnit(fixture, "thung").id;
    let dialog = await openIngredientEditor(page, definition.ingredientName);

    await expect(dialog.getByRole("listitem")).toHaveCount(0);
    await addUnitThroughUi(page, dialog, unitNames.chai);
    await addUnitThroughUi(page, dialog, unitNames.thung);
    await configureManualRelation(
      page,
      dialog,
      unitNames.chai,
      unitNames.ml,
      "250",
    );
    await configureManualRelation(
      page,
      dialog,
      unitNames.thung,
      unitNames.chai,
      "24",
    );

    await dialog.getByRole("button", { name: "Cập nhật" }).click();
    await expect(dialog).toBeHidden({ timeout: 30_000 });
    assert.deepEqual(await readUnitGraph(supabase, fixture), [
      {
        unitId: mlId,
        toBase: 1,
        isBase: true,
        anchorId: null,
        anchorFactor: null,
      },
      {
        unitId: chaiId,
        toBase: 250,
        isBase: false,
        anchorId: mlId,
        anchorFactor: 250,
      },
      {
        unitId: thungId,
        toBase: 6000,
        isBase: false,
        anchorId: chaiId,
        anchorFactor: 24,
      },
    ]);

    dialog = await openIngredientEditor(page, definition.ingredientName);
    await dialog
      .getByLabel(`Số lượng đơn vị đích trong 1 ${unitNames.chai}`)
      .fill("330");
    await dialog.getByRole("button", { name: "Cập nhật" }).click();
    await expect(dialog).toBeHidden({ timeout: 30_000 });
    assert.deepEqual(await readUnitGraph(supabase, fixture), [
      {
        unitId: mlId,
        toBase: 1,
        isBase: true,
        anchorId: null,
        anchorFactor: null,
      },
      {
        unitId: chaiId,
        toBase: 330,
        isBase: false,
        anchorId: mlId,
        anchorFactor: 330,
      },
      {
        unitId: thungId,
        toBase: 7920,
        isBase: false,
        anchorId: chaiId,
        anchorFactor: 24,
      },
    ]);

    await page.setViewportSize({ width: 820, height: 1180 });
    dialog = await openIngredientEditor(page, definition.ingredientName);
    await expect(
      dialog.getByLabel(`Quy đổi ${unitNames.thung} sang đơn vị`),
    ).toContainText(unitNames.chai);
    await expect(
      dialog.getByLabel(`Quy đổi ${unitNames.chai} sang đơn vị`),
    ).toContainText(unitNames.ml);
  });
});

test("blocks dependent deletion until reassigned and keeps tablet controls reachable", async ({
  page,
}, testInfo) => {
  const definition = createChainDefinition("dependency");
  await withBaseOnlyFixture(testInfo, definition, async (fixture) => {
    const unitNames = {
      ml: requiredUnit(fixture, "ml").name,
      chai: requiredUnit(fixture, "chai").name,
      thung: requiredUnit(fixture, "thung").name,
    };
    await page.setViewportSize({ width: 820, height: 1180 });
    const dialog = await openIngredientEditor(page, definition.ingredientName);
    await addUnitThroughUi(page, dialog, unitNames.chai);
    await addUnitThroughUi(page, dialog, unitNames.thung);
    await configureManualRelation(
      page,
      dialog,
      unitNames.chai,
      unitNames.ml,
      "250",
    );
    await configureManualRelation(
      page,
      dialog,
      unitNames.thung,
      unitNames.chai,
      "24",
    );

    await dialog
      .getByRole("button", { name: `Bỏ đơn vị ${unitNames.chai}` })
      .click();
    await expect(
      dialog.getByText(
        `Không thể bỏ ${unitNames.chai} vì ${unitNames.thung} đang quy đổi theo đơn vị này. Hãy đổi đơn vị đích trước.`,
      ),
    ).toBeVisible();
    const thungAnchor = dialog.getByLabel(
      `Quy đổi ${unitNames.thung} sang đơn vị`,
    );
    await selectAnchorThroughUi(page, dialog, unitNames.thung, unitNames.ml);
    await dialog
      .getByRole("button", { name: `Bỏ đơn vị ${unitNames.chai}` })
      .click();
    await expect(relationRow(dialog, unitNames.chai)).toHaveCount(0);

    const thungFactor = dialog.getByLabel(
      `Số lượng đơn vị đích trong 1 ${unitNames.thung}`,
    );
    await expectTouchTarget(
      dialog.getByRole("combobox", { name: "Thêm đơn vị mới" }),
    );
    await expectTouchTarget(thungFactor);
    await expectTouchTarget(thungAnchor);
    await expectTouchTarget(
      dialog.getByRole("button", { name: `Bỏ đơn vị ${unitNames.thung}` }),
    );
  });
});

test("preserves physical ratios when the base changes by keyboard", async ({
  page,
}, testInfo) => {
  const definition = createChainDefinition("rebase");
  await withBaseOnlyFixture(testInfo, definition, async (fixture, supabase) => {
    const unitNames = {
      ml: requiredUnit(fixture, "ml").name,
      chai: requiredUnit(fixture, "chai").name,
      thung: requiredUnit(fixture, "thung").name,
    };
    const mlId = requiredUnit(fixture, "ml").id;
    const chaiId = requiredUnit(fixture, "chai").id;
    const thungId = requiredUnit(fixture, "thung").id;
    const dialog = await openIngredientEditor(page, definition.ingredientName);
    await addUnitThroughUi(page, dialog, unitNames.chai);
    await addUnitThroughUi(page, dialog, unitNames.thung);
    await configureManualRelation(
      page,
      dialog,
      unitNames.chai,
      unitNames.ml,
      "250",
    );
    await configureManualRelation(
      page,
      dialog,
      unitNames.thung,
      unitNames.chai,
      "24",
    );

    const baseSelect = dialog.getByRole("combobox", {
      name: "Đơn vị chuẩn",
    });
    await expect(baseSelect).toBeVisible();
    await baseSelect.click();
    await page
      .getByRole("option", { name: unitNames.chai, exact: true })
      .click();
    await expect(baseSelect).toContainText(unitNames.chai);

    await dialog.getByRole("button", { name: "Cập nhật" }).click();
    await expect(dialog).toBeHidden({ timeout: 30_000 });
    assert.deepEqual(await readUnitGraph(supabase, fixture), [
      {
        unitId: mlId,
        toBase: 0.004,
        isBase: false,
        anchorId: chaiId,
        anchorFactor: 0.004,
      },
      {
        unitId: chaiId,
        toBase: 1,
        isBase: true,
        anchorId: null,
        anchorFactor: null,
      },
      {
        unitId: thungId,
        toBase: 24,
        isBase: false,
        anchorId: chaiId,
        anchorFactor: 24,
      },
    ]);
  });
});

test("handles automatic standards and invalid manual drafts with retry", async ({
  page,
}, testInfo) => {
  const definition = createStandardDefinition();
  await withBaseOnlyFixture(testInfo, definition, async (fixture, supabase) => {
    const gram = requiredUnit(fixture, "gram");
    const kilogram = requiredUnit(fixture, "kilogram");
    const milliliter = requiredUnit(fixture, "milliliter");
    const dialog = await openIngredientEditor(page, definition.ingredientName);

    await addUnitThroughUi(page, dialog, kilogram.name);
    const kilogramRow = relationRow(dialog, kilogram.name);
    // Standard unit auto-derives its factor from the base; the row renders
    // a read-only <output> instead of an editable factor input. formatDecimal
    // uses vi-VN grouping (".") so 1000 renders as "1.000".
    await expect(
      kilogramRow.getByText("1.000", { exact: true }),
    ).toBeVisible();

    await addUnitThroughUi(page, dialog, milliliter.name);
    const volumeFactor = dialog.getByLabel(
      `Số lượng đơn vị đích trong 1 ${milliliter.name}`,
    );
    await volumeFactor.fill("1,");
    await volumeFactor.blur();
    await expect(volumeFactor).toHaveAttribute("aria-invalid", "true");
    await expect(volumeFactor).toHaveValue("1,");
    await volumeFactor.fill("1");
    await dialog.getByRole("button", { name: "Cập nhật" }).click();
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByText(
        "Các đơn vị chuẩn phải cùng loại đo lường (khối lượng hoặc thể tích)",
      ),
    ).toBeVisible();
    await expect(volumeFactor).toHaveValue("1");

    await dialog
      .getByRole("button", { name: `Bỏ đơn vị ${milliliter.name}` })
      .click();
    await dialog.getByRole("button", { name: "Cập nhật" }).click();
    await expect(dialog).toBeHidden({ timeout: 30_000 });
    assert.deepEqual(await readUnitGraph(supabase, fixture), [
      {
        unitId: gram.id,
        toBase: 1,
        isBase: true,
        anchorId: null,
        anchorFactor: null,
      },
      {
        unitId: kilogram.id,
        toBase: 1000,
        isBase: false,
        anchorId: null,
        anchorFactor: null,
      },
    ]);
  });
});
