import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

test("shared RHF fields resolve responsive density at the Owner shell cutover", () => {
  const controlSize = read("apps/web/app/components/form/control-size.ts");

  assert.match(controlSize, /useIsMobile\(1024\)/);
  assert.match(
    controlSize,
    /controlSize === "responsive"[\s\S]*?isTouchLayout[\s\S]*?"touch"[\s\S]*?"field"/,
  );

  for (const path of [
    "apps/web/app/components/form/text-field.tsx",
    "apps/web/app/components/form/number-field.tsx",
    "apps/web/app/components/form/select-field.tsx",
    "apps/web/app/components/form/combobox-field.tsx",
  ]) {
    const source = read(path);
    assert.match(source, /controlSize = "responsive"/);
    assert.match(source, /useFormControlSize\(controlSize\)/);
  }
});

test("shared field primitives receive named field and touch sizes", () => {
  const input = read("packages/ui/src/components/input.tsx");
  const textField = read("apps/web/app/components/form/text-field.tsx");
  const numberField = read("apps/web/app/components/form/number-field.tsx");
  const selectField = read("apps/web/app/components/form/select-field.tsx");
  const comboboxField = read("apps/web/app/components/form/combobox-field.tsx");

  assert.match(input, /field: "h-10"/);
  assert.match(input, /touch: "min-h-12/);
  assert.match(input, /inputVariants\(\{ size: controlSize \}\)/);
  assert.match(textField, /controlSize=\{resolvedControlSize\}/);
  assert.match(numberField, /controlSize=\{resolvedControlSize\}/);
  assert.match(
    selectField,
    /<SelectTrigger[\s\S]*?size=\{resolvedControlSize\}/,
  );
  assert.match(
    selectField,
    /size=\{resolvedControlSize === "touch" \? "touch" : "default"\}/,
  );
  assert.match(comboboxField, /size=\{resolvedControlSize\}/);
});

test("touch Combobox density includes popup search and options", () => {
  const combobox = read("packages/ui/src/components/combobox.tsx");

  assert.match(
    combobox,
    /isTouchSize = size === "touch" \|\| size === "touch-lg"/,
  );
  assert.match(
    combobox,
    /<BaseCombobox\.Input[\s\S]*?isTouchSize[\s\S]*?"min-h-12 px-3 text-sm"/,
  );
  assert.match(
    combobox,
    /<BaseCombobox\.Item[\s\S]*?isTouchSize[\s\S]*?"min-h-12 py-2 text-sm"/,
  );
  assert.match(combobox, /: "h-8 px-2 text-xs\/relaxed"/);
  assert.match(combobox, /: "min-h-7 py-1\.5 text-xs\/relaxed"/);
  assert.doesNotMatch(combobox, /BaseCombobox\.Empty className=/);
  assert.equal(
    combobox.match(
      /<BaseCombobox\.Empty>\s*<div className="py-4 text-center text-xs\/relaxed">/g,
    )?.length,
    2,
  );
});

test("supplier invoice toolbar consumes the responsive control contract", () => {
  const source = read(
    "apps/web/app/(protected)/finance/supplier-invoices/supplier-invoice-list-ui.tsx",
  );

  assert.match(source, /const controlSize = useFormControlSize\(\)/);
  assert.match(source, /<InputGroup size=\{controlSize\}/);
  assert.match(source, /aria-label=\{copy\.searchPlaceholder\}/);
  assert.match(source, /<AppToolbar[\s\S]*?min-w-64[\s\S]*?search=\{/);
  assert.match(source, /<Combobox[\s\S]*?size=\{controlSize\}/);
  assert.equal(
    source.match(/<SelectTrigger\s[\s\S]*?size=\{controlSize\}/g)?.length,
    2,
  );
  assert.ok(
    (source.match(/size=\{controlSize/g) ?? []).length >= 8,
    "supplier invoice toolbar must wire responsive controlSize throughout",
  );
});
