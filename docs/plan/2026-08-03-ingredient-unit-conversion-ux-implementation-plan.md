# Kế hoạch triển khai UX quy đổi đơn vị nguyên liệu

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cho phép Owner khai báo chuỗi quy đổi tự do như `Thùng → Chai → ml`, xem hệ số suy ra về đơn vị chuẩn và mở lại form mà quan hệ đã nhập không bị làm phẳng.

**Architecture:** Giữ `ingredient_units.to_base_factor` là hệ số hiệu lực cho ledger và dùng `anchor_unit_id` cùng `anchor_factor` làm quan hệ Owner đã khai báo. Một mô hình TypeScript thuần đọc, kiểm tra, suy hệ số, đổi đơn vị chuẩn và tạo payload; dialog chỉ quản lý trường form và hiển thị kết quả của mô hình này. RPC hiện tại tiếp tục là biên atomic xác nhận chuỗi và quy đổi dữ liệu tồn.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 6 strict, React Hook Form 7, Zod 4, Supabase JS 2, Base UI qua `@comtammatu/ui`, Node test runner và Playwright 1.61.

## Global Constraints

- TypeScript giữ `strict` và `noUncheckedIndexedAccess: true`.
- Client runtime không import database barrel; thay đổi này không cần import Supabase vào client.
- Mọi Server Action input vẫn được Zod kiểm tra và không hiển thị lỗi PostgreSQL thô.
- `to_base_factor` vẫn là hệ số hiệu lực về đúng một đơn vị chuẩn; ledger, tồn, ngưỡng và giá vốn không đổi mô hình lưu trữ.
- Quan hệ neo chỉ được trỏ tới đơn vị đang chọn trên cùng nguyên liệu, không tự trỏ và không tạo vòng lặp.
- Thao tác gỡ tách khỏi hành động chính và không được làm mất quan hệ phụ thuộc âm thầm.
- Dùng component Má Tư hiện có; không tạo token, primitive hoặc design system song song.
- Mobile/touch là baseline, nhưng route `/inventory/ingredients` phải giữ cùng kiến trúc thông tin trên tablet và desktop.
- Không tạo migration hoặc chạy apply database cho kế hoạch này.
- Worktree đang có thay đổi không thuộc task; chỉ sửa các file được liệt kê trong từng task.
- Không commit hoặc push nếu Owner chưa yêu cầu trong task hiện tại.

---

## Cấu trúc file

- `apps/web/app/(protected)/inventory/ingredients/ingredient-unit-form-model.ts`: mô hình đồ thị quy đổi thuần, không phụ thuộc React
- `apps/web/tests/ingredient-unit-form-model.test.ts`: kiểm thử chuỗi, vòng lặp, dữ liệu mở lại, gỡ phụ thuộc và đổi đơn vị chuẩn
- `apps/web/app/(protected)/inventory/ingredients/ingredient-dialog.tsx`: schema React Hook Form, thêm/sửa/gỡ dòng, chọn đích và bản xem trước
- `apps/web/lib/messages/inventory-master.ts`: nội dung tiếng Việt cho trường, preview và lỗi có hướng khắc phục
- `apps/web/tests/inventory-unit-anchor-ui-static.test.ts`: guard tĩnh chống quay lại mô hình hardcode mọi dòng về đơn vị chuẩn
- `apps/web/e2e/inventory/ingredient-unit-conversion.spec.ts`: round-trip Owner UI và dữ liệu `ingredient_units`
- `docs/ref/inventory.md`: hợp đồng Inventory cho chuỗi neo không vòng lặp

### Task 1: Xây mô hình đồ thị quy đổi thuần

**Files:**

- Modify: `apps/web/app/(protected)/inventory/ingredients/ingredient-unit-form-model.ts`
- Modify: `apps/web/tests/ingredient-unit-form-model.test.ts`

**Interfaces:**

- Consumes: `UnitOption` và các trường `unit_id`, `to_base_factor`, `is_base`, `anchor_unit_id`, `anchor_factor`
- Produces: `UnitRelationModel`, `deriveEffectiveUnitFactor`, `deriveEffectiveUnitFactors`, `buildCatalogUnits`, `readCatalogUnitModel`, `rebaseUnitRelations`, `findDirectDependents`, `wouldCreateUnitCycle`

- [ ] **Step 1: Thay kiểm thử payload trực tiếp bằng kiểm thử chuỗi neo đang thất bại**

Thay test “packaging units use a direct manual anchor to the base” bằng:

```typescript
test("packaging units can form an acyclic chain to the base", () => {
  const rows = buildCatalogUnits({
    unitIds: [7, 6, 3],
    baseUnitId: 3,
    anchorUnitIds: { 7: 6, 6: 3 },
    anchorFactors: { 7: 24, 6: 250 },
    unitOptions: units,
  });

  assert.deepEqual(rows.find((row) => row.unit_id === 7), {
    unit_id: 7,
    to_base_factor: 6000,
    is_base: false,
    anchor_unit_id: 6,
    anchor_factor: 24,
  });
  assert.deepEqual(rows.find((row) => row.unit_id === 6), {
    unit_id: 6,
    to_base_factor: 250,
    is_base: false,
    anchor_unit_id: 3,
    anchor_factor: 250,
  });
});
```

- [ ] **Step 2: Thêm kiểm thử dữ liệu mở lại, vòng lặp, phụ thuộc và rebase**

Thêm `deriveEffectiveUnitFactor`, `findDirectDependents` và `rebaseUnitRelations` vào import từ model, rồi thêm các test sau vào cùng file:

```typescript
test("stored anchors survive a form round trip", () => {
  const model = readCatalogUnitModel(
    [
      {
        unit_id: 7,
        to_base_factor: 6000,
        is_base: false,
        anchor_unit_id: 6,
        anchor_factor: 24,
      },
      {
        unit_id: 6,
        to_base_factor: 250,
        is_base: false,
        anchor_unit_id: 3,
        anchor_factor: 250,
      },
      {
        unit_id: 3,
        to_base_factor: 1,
        is_base: true,
        anchor_unit_id: null,
        anchor_factor: null,
      },
    ],
    3,
    units,
  );

  assert.equal(model.baseUnitId, 3);
  assert.deepEqual(model.anchorUnitIds, { 7: 6, 6: 3, 3: null });
  assert.deepEqual(model.anchorFactors, { 7: 24, 6: 250, 3: null });
});

test("self anchors and multi-hop cycles fail closed", () => {
  for (const anchorUnitIds of [{ 7: 7, 6: 3 }, { 7: 6, 6: 7 }]) {
    assert.throws(
      () =>
        buildCatalogUnits({
          unitIds: [7, 6, 3],
          baseUnitId: 3,
          anchorUnitIds,
          anchorFactors: { 7: 24, 6: 250 },
          unitOptions: units,
        }),
      (error: unknown) =>
        error instanceof IngredientUnitModelError &&
        error.message === "unit_anchor_cycle",
    );
  }
});

test("removal reports direct dependents", () => {
  assert.deepEqual(findDirectDependents({ 7: 6, 6: 3 }, 6), [7]);
  assert.deepEqual(findDirectDependents({ 7: 6, 6: 3 }, 7), []);
});

test("one incomplete unrelated row does not hide a valid preview", () => {
  const factor = deriveEffectiveUnitFactor(
    {
      unitIds: [7, 6, 5, 3],
      baseUnitId: 3,
      anchorUnitIds: { 7: 6, 6: 3, 5: null },
      anchorFactors: { 7: 24, 6: 250, 5: null },
      unitOptions: units,
    },
    7,
  );
  assert.equal(factor, 6000);
});

test("changing the base preserves physical ratios and safe edges", () => {
  const result = rebaseUnitRelations({
    unitIds: [7, 6, 3],
    oldBaseUnitId: 3,
    newBaseUnitId: 6,
    anchorUnitIds: { 7: 6, 6: 3, 3: null },
    anchorFactors: { 7: 24, 6: 250, 3: null },
    unitOptions: units,
  });

  assert.deepEqual(result.anchorUnitIds, { 7: 6, 6: null, 3: 6 });
  assert.equal(result.anchorFactors[7], 24);
  assert.equal(result.anchorFactors[6], null);
  assert.equal(result.anchorFactors[3], 0.004);
});
```

- [ ] **Step 3: Chạy test để xác nhận trạng thái đỏ**

Run:

```powershell
corepack pnpm --filter @comtammatu/web exec tsx --test tests/ingredient-unit-form-model.test.ts
```

Expected: FAIL vì các tham số và helper đồ thị mới chưa tồn tại.

- [ ] **Step 4: Khai báo lỗi và interface đồ thị**

Thay union lỗi và thêm các type sau trong `ingredient-unit-form-model.ts`:

```typescript
export type IngredientUnitModelErrorCode =
  | "unit_not_found"
  | "base_unit_not_selected"
  | "anchor_unit_not_selected"
  | "invalid_factor"
  | "unit_anchor_cycle"
  | "standard_unit_dimension_mismatch";

export type UnitRelationModel = {
  baseUnitId: number | null;
  anchorUnitIds: Record<number, number | null>;
  anchorFactors: Record<number, number | null>;
};

export class IngredientUnitModelError extends Error {
  constructor(message: IngredientUnitModelErrorCode) {
    super(message);
    this.name = "IngredientUnitModelError";
  }
}
```

- [ ] **Step 5: Cài đặt resolver đệ quy và payload giữ anchor**

Đổi `buildCatalogUnits` sang interface sau:

```typescript
export function buildCatalogUnits(input: {
  unitIds: readonly number[];
  baseUnitId: number;
  anchorUnitIds: Readonly<Record<number, number | null>>;
  anchorFactors: Readonly<Record<number, number | null>>;
  unitOptions: readonly UnitOption[];
}): CatalogUnitPayload[];
```

Cài đặt `deriveEffectiveUnitFactors` theo resolver sau; `isAutomaticStandardRelation` chỉ đúng khi dòng trỏ thẳng tới base, factor để trống và hai đơn vị chuẩn cùng `dimension`:

```typescript
export function deriveEffectiveUnitFactors(input: {
  unitIds: readonly number[];
  baseUnitId: number;
  anchorUnitIds: Readonly<Record<number, number | null>>;
  anchorFactors: Readonly<Record<number, number | null>>;
  unitOptions: readonly UnitOption[];
}): Record<number, number> {
  const selected = [...new Set(input.unitIds)];
  const selectedSet = new Set(selected);
  const unitsById = new Map(input.unitOptions.map((unit) => [unit.id, unit]));
  const memo: Record<number, number> = { [input.baseUnitId]: 1 };

  if (!selectedSet.has(input.baseUnitId)) {
    throw new IngredientUnitModelError("base_unit_not_selected");
  }

  const resolve = (unitId: number, path: ReadonlySet<number>): number => {
    const cached = memo[unitId];
    if (cached != null) return cached;
    if (path.has(unitId)) {
      throw new IngredientUnitModelError("unit_anchor_cycle");
    }

    const unit = unitsById.get(unitId);
    const base = unitsById.get(input.baseUnitId);
    if (!unit || !base) throw new IngredientUnitModelError("unit_not_found");

    const anchorUnitId = input.anchorUnitIds[unitId];
    if (anchorUnitId == null || !selectedSet.has(anchorUnitId)) {
      throw new IngredientUnitModelError("anchor_unit_not_selected");
    }
    if (anchorUnitId === unitId) {
      throw new IngredientUnitModelError("unit_anchor_cycle");
    }

    const manualFactor = input.anchorFactors[unitId];
    const automatic =
      anchorUnitId === input.baseUnitId &&
      manualFactor == null &&
      unit.is_standard &&
      base.is_standard;
    const edgeFactor = automatic
      ? standardFactor(unit, base)
      : Number(manualFactor);
    if (!Number.isFinite(edgeFactor) || edgeFactor <= 0) {
      throw new IngredientUnitModelError("invalid_factor");
    }

    const nextPath = new Set(path);
    nextPath.add(unitId);
    const value = edgeFactor * resolve(anchorUnitId, nextPath);
    memo[unitId] = value;
    return value;
  };

  for (const unitId of selected) resolve(unitId, new Set());
  return memo;
}
```

Tách resolver nội bộ để `deriveEffectiveUnitFactor(input, unitId)` chỉ duyệt đường đi của một dòng. `deriveEffectiveUnitFactors(input)` gọi cùng resolver cho mọi đơn vị và tiếp tục fail-closed khi tạo payload.

`buildCatalogUnits` dùng kết quả resolver làm `to_base_factor`. Dòng tự động gửi `anchor_unit_id: null` và `anchor_factor: null`; dòng Owner khai báo gửi đúng đích cùng hệ số cạnh, không thay bằng base.

- [ ] **Step 6: Cài đặt đọc dữ liệu cũ, phụ thuộc, cycle preview và rebase**

`readCatalogUnitModel` nhận thêm `unitOptions`. Với dòng có anchor, giữ nguyên cặp đã lưu. Với dòng cũ không có anchor, đặt đích là base; dùng `null` cho quan hệ chuẩn tự động và dùng `to_base_factor` cho quan hệ thủ công legacy.

Thêm các chữ ký sau:

```typescript
export function findDirectDependents(
  anchorUnitIds: Readonly<Record<number, number | null>>,
  targetUnitId: number,
): number[];

export function wouldCreateUnitCycle(
  anchorUnitIds: Readonly<Record<number, number | null>>,
  unitId: number,
  candidateAnchorUnitId: number,
): boolean;

export function rebaseUnitRelations(input: {
  unitIds: readonly number[];
  oldBaseUnitId: number;
  newBaseUnitId: number;
  anchorUnitIds: Readonly<Record<number, number | null>>;
  anchorFactors: Readonly<Record<number, number | null>>;
  unitOptions: readonly UnitOption[];
}): {
  anchorUnitIds: Record<number, number | null>;
  anchorFactors: Record<number, number | null>;
};
```

`rebaseUnitRelations` phải tính effective factor cũ trước. Hàm giữ cạnh nếu đường đi của dòng gặp base mới; các dòng còn lại trỏ trực tiếp tới base mới với `oldEffective[unitId] / oldEffective[newBaseUnitId]`. Nếu cạnh mới là quan hệ chuẩn tự động, lưu factor `null`.

- [ ] **Step 7: Cập nhật toàn bộ test cũ sang interface anchor và chạy xanh**

Các test standard dùng `anchorUnitIds` trỏ về base và `anchorFactors` là `null`. Các test packaging trực tiếp dùng đích base cùng factor hiện có.

Run:

```powershell
corepack pnpm --filter @comtammatu/web exec tsx --test tests/ingredient-unit-form-model.test.ts
```

Expected: toàn bộ test trong file PASS.

- [ ] **Step 8: Rà diff phạm vi Task 1**

Run:

```powershell
git diff -- 'apps/web/app/(protected)/inventory/ingredients/ingredient-unit-form-model.ts' 'apps/web/tests/ingredient-unit-form-model.test.ts'
```

Expected: chỉ có mô hình thuần và test; không có thay đổi React, SQL hoặc file ngoài task.

### Task 2: Nối mô hình chuỗi vào dialog nguyên liệu

**Files:**

- Modify: `apps/web/app/(protected)/inventory/ingredients/ingredient-dialog.tsx`
- Modify: `apps/web/lib/messages/inventory-master.ts`
- Create: `apps/web/tests/inventory-unit-anchor-ui-static.test.ts`

**Interfaces:**

- Consumes: toàn bộ helper từ Task 1
- Produces: form fields `unit_anchor_ids`, `unit_factors`, mỗi dòng có factor, bộ chọn đích và preview về base

- [ ] **Step 1: Viết static guard đang thất bại**

Tạo `inventory-unit-anchor-ui-static.test.ts`:

```typescript
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const dialog = readFileSync(
  resolve(
    repoRoot,
    "apps/web/app/(protected)/inventory/ingredients/ingredient-dialog.tsx",
  ),
  "utf8",
);
const model = readFileSync(
  resolve(
    repoRoot,
    "apps/web/app/(protected)/inventory/ingredients/ingredient-unit-form-model.ts",
  ),
  "utf8",
);

test("ingredient unit editor owns per-row anchor targets and derived previews", () => {
  assert.match(dialog, /unit_anchor_ids: z\.record/);
  assert.match(dialog, /name: "unit_anchor_ids\./);
  assert.match(dialog, /deriveEffectiveUnitFactor/);
  assert.match(dialog, /wouldCreateUnitCycle/);
  assert.match(dialog, /findDirectDependents/);
  assert.match(dialog, /previewCanonical/);
});

test("catalog payload preserves selected anchors instead of flattening to base", () => {
  assert.match(model, /anchor_unit_id: anchorUnitId/);
  assert.match(model, /anchor_factor: edgeFactor/);
  assert.doesNotMatch(
    model,
    /anchor_unit_id: registryFactor == null \? baseUnitId/,
  );
});
```

- [ ] **Step 2: Chạy static guard để xác nhận trạng thái đỏ**

Run:

```powershell
corepack pnpm --filter @comtammatu/web exec tsx --test tests/inventory-unit-anchor-ui-static.test.ts
```

Expected: FAIL vì dialog chưa có `unit_anchor_ids` và preview đồ thị.

- [ ] **Step 3: Mở rộng schema và giá trị mặc định**

Thêm field vào schema:

```typescript
unit_anchor_ids: z.record(z.string(), z.string()),
unit_factors: z.record(z.string(), z.string()),
```

`toFormValues` chuyển `UnitRelationModel` sang chuỗi cho React Hook Form:

```typescript
unit_anchor_ids: Object.fromEntries(
  Object.entries(unitModel.anchorUnitIds).map(([unitId, anchorUnitId]) => [
    unitId,
    anchorUnitId == null ? "" : String(anchorUnitId),
  ]),
),
unit_factors: Object.fromEntries(
  Object.entries(unitModel.anchorFactors).map(([unitId, factor]) => [
    unitId,
    factor == null ? "" : String(factor),
  ]),
),
```

Trong `superRefine`, dựng input số và gọi `buildCatalogUnits`. Ánh xạ `IngredientUnitModelError` vào đúng path của dòng; `unit_anchor_cycle` gắn vào `unit_anchor_ids`, `invalid_factor` gắn vào `unit_factors`.

- [ ] **Step 4: Cập nhật submit để gửi đúng quan hệ Owner chọn**

Đổi lời gọi `buildCatalogUnits` thành:

```typescript
const units = buildCatalogUnits({
  unitIds: values.unit_ids.map(Number),
  baseUnitId: Number(values.base_unit_id),
  anchorUnitIds: Object.fromEntries(
    Object.entries(values.unit_anchor_ids).map(([id, anchorId]) => [
      Number(id),
      anchorId ? Number(anchorId) : null,
    ]),
  ),
  anchorFactors: Object.fromEntries(
    Object.entries(values.unit_factors).map(([id, factor]) => [
      Number(id),
      factor ? Number(factor) : null,
    ]),
  ),
  unitOptions,
});
```

Giữ `IngredientUnitModelError` trong client và trả về copy nghiệp vụ, không trả `error.message` thô.

- [ ] **Step 5: Cập nhật thêm, đổi base và gỡ đơn vị**

Khi thêm dòng có base hiện tại, đặt đích mặc định là base. Để factor rỗng cho quan hệ chuẩn tự động; các quan hệ khác yêu cầu Owner nhập factor.

Khi đổi base, gọi `rebaseUnitRelations`, cập nhật cả `unit_anchor_ids` và `unit_factors`, rồi mới gọi `baseField.onChange`.

Khi gỡ, kiểm tra phụ thuộc trực tiếp:

```typescript
const dependents = findDirectDependents(anchorUnitIds, unitId).filter((id) =>
  selectedUnitIds.includes(id),
);
if (dependents.length > 0) {
  for (const dependentId of dependents) {
    form.setError(`unit_anchor_ids.${dependentId}`, {
      type: "manual",
      message: copy.units.reassignBeforeRemove(
        unitsById.get(dependentId)?.name ?? copy.units.unitPending,
        unitsById.get(unitId)?.name ?? copy.units.unitPending,
      ),
    });
  }
  return;
}
```

Sau khi gỡ thành công, xóa key tương ứng khỏi cả hai record bằng một object mới và gọi `setValue` với `shouldDirty` cùng `shouldValidate`.

- [ ] **Step 6: Thay `UnitFactorField` bằng dòng quy đổi có đích tự do**

Đổi component thành:

```typescript
function UnitConversionField({
  control,
  unit,
  baseUnit,
  anchorOptions,
  effectiveFactor,
  automatic,
}: {
  control: Control<IngredientFormValues>;
  unit: UnitOption;
  baseUnit: UnitOption;
  anchorOptions: Array<{ value: string; label: string }>;
  effectiveFactor: number | null;
  automatic: boolean;
}) {
  const factorName = `unit_factors.${unit.id}` as FieldPath<IngredientFormValues>;
  const anchorName =
    `unit_anchor_ids.${unit.id}` as FieldPath<IngredientFormValues>;
  const factor = useController({ control, name: factorName });
  const anchor = useController({ control, name: anchorName });

  return (
    <Field data-invalid={Boolean(factor.fieldState.error || anchor.fieldState.error)}>
      <Item variant="outline" size="sm" className="flex-col items-stretch gap-3">
        <ItemContent>
          <ItemTitle>{unit.name}</ItemTitle>
        </ItemContent>
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <FormattedNumberInput
            name={factorName}
            value={automatic ? "" : String(factor.field.value ?? "")}
            onValueChange={factor.field.onChange}
            disabled={automatic}
            maxFractionDigits={12}
            aria-label={copy.units.factorAria(unit.name)}
          />
          <Select value={String(anchor.field.value ?? "")} onValueChange={anchor.field.onChange}>
            <SelectTrigger aria-label={copy.units.anchorAria(unit.name)}>
              <SelectValue placeholder={copy.units.anchorPlaceholder} />
            </SelectTrigger>
            <SelectContent>
              {anchorOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <p className="text-sm text-muted-foreground tabular-nums">
          {effectiveFactor == null
            ? copy.units.previewInvalid
            : copy.units.previewCanonical(
                unit.name,
                formatDecimal(effectiveFactor, 12),
                baseUnit.name,
              )}
        </p>
        {automatic ? <Badge variant="outline">{copy.units.autoStandard}</Badge> : null}
      </Item>
      {factor.fieldState.error ? (
        <FieldError errors={[factor.fieldState.error]} />
      ) : null}
      {anchor.fieldState.error ? (
        <FieldError errors={[anchor.fieldState.error]} />
      ) : null}
    </Field>
  );
}
```

Import `formatDecimal` từ `@comtammatu/shared/format`. Trước khi render, gọi `deriveEffectiveUnitFactor` riêng cho từng dòng trong `useMemo`; chỉ dòng có đường đi chưa hợp lệ hiển thị `previewInvalid`. `anchorOptions` loại chính dòng đó và mọi candidate làm `wouldCreateUnitCycle` trả `true`.

- [ ] **Step 7: Bổ sung copy tiếng Việt có hướng khắc phục**

Trong `INGREDIENT_FORM_VI.units`, thay nội dung hardcode “về đơn vị chuẩn” và thêm:

```typescript
sectionLabel: "Đơn vị và quy đổi",
conversionSection: "Quy đổi theo quy cách thực tế",
anchorAria: (unit: string) => `Quy đổi ${unit} sang đơn vị`,
factorAria: (unit: string) => `Số lượng đơn vị đích trong 1 ${unit}`,
anchorRequired: "Chọn đơn vị cần quy đổi sang",
anchorSelf: "Một đơn vị không thể quy đổi sang chính nó",
anchorCycle: "Quan hệ này tạo vòng lặp. Chọn đơn vị đích khác",
reassignBeforeRemove: (dependent: string, target: string) =>
  `${dependent} đang quy đổi sang ${target}. Hãy đổi đơn vị đích trước`,
previewInvalid: "Hoàn tất hệ số và đơn vị đích để xem kết quả",
previewCanonical: (unit: string, factor: string, base: string) =>
  `Quy đổi về đơn vị chuẩn: 1 ${unit} = ${factor} ${base}`,
```

- [ ] **Step 8: Chạy model test, static guard, typecheck và UI component audit**

Run:

```powershell
corepack pnpm audit:ui-components --component Select
corepack pnpm --filter @comtammatu/web exec tsx --test tests/ingredient-unit-form-model.test.ts tests/inventory-unit-anchor-ui-static.test.ts
corepack pnpm --filter @comtammatu/web typecheck
```

Expected: audit xác nhận dùng shared `Select`; toàn bộ test PASS; TypeScript không có lỗi.

- [ ] **Step 9: Rà diff phạm vi Task 2**

Run:

```powershell
git diff -- 'apps/web/app/(protected)/inventory/ingredients/ingredient-dialog.tsx' 'apps/web/lib/messages/inventory-master.ts' 'apps/web/tests/inventory-unit-anchor-ui-static.test.ts'
```

Expected: UI chỉ dùng component chung, có label truy cập và không có raw database error.

### Task 3: Khóa hợp đồng round-trip và cập nhật tài liệu Inventory

**Files:**

- Create: `apps/web/e2e/inventory/ingredient-unit-conversion.spec.ts`
- Modify: `docs/ref/inventory.md`
- Modify: `apps/web/tests/inventory-unit-system-phase-a2-static.test.ts`

**Interfaces:**

- Consumes: dialog và payload từ Task 2, RPC `save_ingredient_catalog` hiện tại
- Produces: bằng chứng UI → Server Action → RPC → đọc lại giữ `Thùng → Chai → ml`

- [ ] **Step 1: Cập nhật static contract A2 cho editor mới**

Trong test “current catalog save rebases base quantities and keeps the editor unlocked”, thêm:

```typescript
assert.match(ingredientDialog, /unit_anchor_ids: z\.record/);
assert.match(ingredientDialog, /deriveEffectiveUnitFactor/);
assert.match(ingredientDialog, /findDirectDependents/);
assert.doesNotMatch(
  ingredientDialog,
  /conversionSection\(baseUnit\.name\)/,
);
```

Run:

```powershell
corepack pnpm --filter @comtammatu/web exec tsx --test tests/inventory-unit-system-phase-a2-static.test.ts
```

Expected: PASS vì Task 2 đã nối dialog mới; assertion này khóa hợp đồng cho các thay đổi sau.

- [ ] **Step 2: Viết Playwright round-trip cho chuỗi ba đơn vị**

Tạo spec dùng `E2E_AUTH_STORAGE_OWNER`, `createServiceClient` và `resolveTenantId`. Seed một nguyên liệu riêng với ba đơn vị custom, trong đó `ml` là base, `Chai → ml = 250` và `Thùng → Chai = 24`.

Test phải thực hiện đúng chuỗi sau:

```typescript
await page.goto("/inventory/ingredients");
await page.getByRole("searchbox", { name: "Tìm theo tên hoặc mã hàng" }).fill(name);
await page.getByText(name, { exact: true }).first().click();
await expect(page.getByRole("dialog", { name: "Chỉnh sửa nguyên liệu" })).toBeVisible();

await expect(page.getByLabel("Quy đổi Thùng sang đơn vị")).toContainText("Chai");
await expect(page.getByLabel("Quy đổi Chai sang đơn vị")).toContainText("ml");
await expect(page.getByText("Quy đổi về đơn vị chuẩn: 1 Thùng = 6.000 ml")).toBeVisible();

await page.getByLabel("Số lượng đơn vị đích trong 1 Chai").fill("330");
await expect(page.getByText("Quy đổi về đơn vị chuẩn: 1 Thùng = 7.920 ml")).toBeVisible();
await page.getByRole("button", { name: "Cập nhật" }).click();
```

Sau khi lưu, query `ingredient_units` và assert:

```typescript
assert.deepEqual(
  rows.map((row) => ({
    unitId: row.unit_id,
    toBase: Number(row.to_base_factor),
    anchorId: row.anchor_unit_id,
    anchorFactor:
      row.anchor_factor == null ? null : Number(row.anchor_factor),
  })),
  [
    { unitId: mlId, toBase: 1, anchorId: null, anchorFactor: null },
    { unitId: chaiId, toBase: 330, anchorId: mlId, anchorFactor: 330 },
    { unitId: thungId, toBase: 7920, anchorId: chaiId, anchorFactor: 24 },
  ],
);
```

Mở lại dialog ở viewport tablet `820 × 1180` và assert hai bộ chọn đích cùng preview `7.920 ml` vẫn hiển thị. Dùng `try/finally`; trong `finally`, xóa ingredient fixture trước rồi xóa ba unit fixture để không để lại dữ liệu test.

- [ ] **Step 3: Cập nhật hợp đồng hệ đơn vị**

Thay đoạn mô hình hình sao tại `docs/ref/inventory.md` §2.1 bằng:

```markdown
Mỗi đơn vị không phải Đơn vị chuẩn có thể quy đổi sang một đơn vị đang hoạt động
khác của cùng nguyên liệu qua `anchor_unit_id` và `anchor_factor`. Chuỗi neo phải
kết thúc tại Đơn vị chuẩn, không tự trỏ và không tạo vòng lặp. Ví dụ:
`1 Thùng = 24 Chai`, `1 Chai = 250 ml`, với `ml` là Đơn vị chuẩn.

`ingredient_units.to_base_factor` là hệ số hiệu lực đã suy qua toàn bộ chuỗi.
Ledger, tồn, ngưỡng và giá vốn chỉ dùng hệ số hiệu lực này. Hai đơn vị chuẩn cùng
`dimension` mặc định lấy tỷ lệ từ `units.standard_factor`; Owner có thể khai báo
đích khác khi cần quy cách riêng. Khi đổi Đơn vị chuẩn, RPC quy đổi hệ số, số
lượng và đơn giá để giữ nguyên lượng vật lý và tổng giá trị tồn.
```

- [ ] **Step 4: Chạy targeted tests và Playwright**

Run:

```powershell
corepack pnpm --filter @comtammatu/web exec tsx --test tests/ingredient-unit-form-model.test.ts tests/inventory-unit-anchor-ui-static.test.ts tests/inventory-unit-system-phase-a2-static.test.ts
corepack pnpm --filter @comtammatu/web exec playwright test --project=chromium e2e/inventory/ingredient-unit-conversion.spec.ts
```

Expected: Node tests PASS; Playwright PASS ở desktop và tablet với anchor round-trip giữ nguyên.

- [ ] **Step 5: Rà diff phạm vi Task 3**

Run:

```powershell
git diff -- apps/web/e2e/inventory/ingredient-unit-conversion.spec.ts apps/web/tests/inventory-unit-system-phase-a2-static.test.ts docs/ref/inventory.md
```

Expected: không có migration, không sửa quyền, không sửa ledger và không làm thay đổi snapshot chứng từ.

### Task 4: Xác minh đầy đủ và bàn giao

**Files:**

- Review only: toàn bộ file từ Task 1 đến Task 3
- Preserve: mọi file dirty ngoài phạm vi kế hoạch

**Interfaces:**

- Consumes: tất cả deliverable trước đó
- Produces: bằng chứng targeted, UI contract và hard gates của repository

- [ ] **Step 1: Chạy toàn bộ test web và UI contract lint**

Run:

```powershell
corepack pnpm --filter @comtammatu/web test
corepack pnpm lint:ui-contract
```

Expected: toàn bộ test web PASS; UI contract lint PASS.

- [ ] **Step 2: Chạy hard gates bắt buộc**

Run:

```powershell
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm build
```

Expected: cả ba lệnh exit code `0`; đọc output để xác nhận không dựa vào thông báo nền hoặc cache cũ.

- [ ] **Step 3: Kiểm tra thủ công các trạng thái tương tác đã thay đổi**

Trên `/inventory/ingredients`, kiểm tra desktop và tablet:

1. Tạo chuỗi `Thùng → Chai → ml` và xem preview `6000 ml`
2. Đổi factor của `Chai` và thấy preview `Thùng` cập nhật trước khi lưu
3. Thử chọn quan hệ tạo vòng lặp và xác nhận option bị loại hoặc form báo lỗi theo dòng
4. Thử gỡ `Chai` khi `Thùng` đang trỏ tới và xác nhận form yêu cầu đổi đích
5. Đổi base từ `ml` sang `Chai` và xác nhận tỷ lệ vật lý được giữ
6. Dùng bàn phím đi qua radio base, input factor, select đích, nút gỡ và nút cập nhật
7. Xác nhận loading, invalid, submit pending, success và server error không làm mất draft

- [ ] **Step 4: Kiểm tra diff cuối và trạng thái worktree**

Run:

```powershell
git diff --check
git status --short
git diff -- 'apps/web/app/(protected)/inventory/ingredients/ingredient-unit-form-model.ts' 'apps/web/app/(protected)/inventory/ingredients/ingredient-dialog.tsx' 'apps/web/lib/messages/inventory-master.ts' 'apps/web/tests/ingredient-unit-form-model.test.ts' 'apps/web/tests/inventory-unit-anchor-ui-static.test.ts' 'apps/web/tests/inventory-unit-system-phase-a2-static.test.ts' 'apps/web/e2e/inventory/ingredient-unit-conversion.spec.ts' 'docs/ref/inventory.md'
```

Expected: `git diff --check` sạch; diff chỉ chứa file thuộc kế hoạch; các thay đổi dirty có sẵn của Owner vẫn được giữ nguyên.

- [ ] **Step 5: Báo cáo bàn giao mà không commit**

Báo cáo các file đã đổi, kết quả targeted tests, Playwright, `typecheck`, `lint`, `build`, và mọi giới hạn môi trường nếu có. Không phát hành directive commit, push hoặc pull request vì task hiện tại chưa cấp quyền Git mutation.
