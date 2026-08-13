import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

test("Branch printer dialog has a semantic form and associated touch controls", () => {
  const source = read(
    "app/(protected)/br/_shared/settings/printers/printers-client.tsx",
  );

  assert.match(source, /const PRINTER_FORM_ID = "branch-printer-form"/);
  assert.match(source, /<form[\s\S]*?id=\{PRINTER_FORM_ID\}[\s\S]*?onSubmit=/);
  assert.match(source, /type="submit"\s+form=\{PRINTER_FORM_ID\}/);
  assert.doesNotMatch(source, /onClick=\{save\}/);
  assert.match(source, /const controlSize = embedded \? "touch" : "field"/);
  assert.match(source, /const optionSize = embedded \? "touch" : "default"/);

  for (const name of [
    "branch_id",
    "name",
    "lan_host",
    "lan_port",
    "paper_width_mm",
    "is_active",
    "print_types",
    "category_ids",
  ]) {
    assert.match(source, new RegExp(`name="${name}"`));
  }

  assert.doesNotMatch(source, /code_page|codePage|Code page/);

  for (const field of [
    "branch",
    "name",
    "lanHost",
    "lanPort",
    "paperWidth",
    "active",
  ]) {
    assert.match(
      source,
      new RegExp(`htmlFor=\\{PRINTER_FIELD_IDS\\.${field}\\}`),
    );
    assert.match(source, new RegExp(`id=\\{PRINTER_FIELD_IDS\\.${field}\\}`));
  }

  assert.match(source, /name="lan_port"[\s\S]*?type="number"/);
  assert.match(
    source,
    /lan_port: form\.lan_port \? Number\(form\.lan_port\) : null/,
  );
  assert.match(source, /<Switch[\s\S]*?checked=\{form\.is_active\}/);
  assert.match(source, /size=\{embedded \? "touch" : "default"\}/);
  assert.equal(source.match(/<FieldSet>/g)?.length, 2);
  assert.doesNotMatch(source, /ROLE_ORDER|Vị trí máy in/);
  assert.match(source, /role="alert"/);
});

test("leave and checkout decisions use named touch action sizes", () => {
  const leave = read("lib/staff-runtime/leave/leave-client.tsx");
  const checkout = read(
    "lib/staff-runtime/checkout-approvals/checkout-approvals-client.tsx",
  );

  assert.match(
    leave,
    /variant="ghost"\s+size="icon-touch"[\s\S]*?aria-label=\{copy\.cancelRequest\}/,
  );
  assert.match(
    checkout,
    /footerClassName="shrink-0 flex-row gap-3 pt-2"[\s\S]*?variant="outline"\s+size="touch"[\s\S]*?<Button[\s\S]*?size="touch"/,
  );
  assert.match(
    checkout,
    /footerClassName="pt-2"[\s\S]*?variant="destructive"\s+size="touch"/,
  );
});

test("Branch waste opts into a named touch preview link without changing Owner caller density", () => {
  const photoInput = read("app/components/form/photo-upload-input.tsx");
  const wastePhoto = read(
    "app/(protected)/inventory/_components/waste-photo-upload.tsx",
  );
  const wasteForm = read(
    "app/(protected)/inventory/waste/waste-operational-form.tsx",
  );
  const ownerWaste = read(
    "app/(protected)/inventory/waste/new/waste-create-client.tsx",
  );

  assert.match(photoInput, /previewSize\?: "default" \| "touch"/);
  assert.match(
    photoInput,
    /previewSize === "touch"[\s\S]*?variant="link"\s+size=\{isTouchLayout \? "touch" : "default"\}[\s\S]*?render=\{<a href=\{value\}/,
  );
  assert.match(wastePhoto, /previewSize=\{previewSize\}/);
  assert.match(
    wasteForm,
    /<WastePhotoUpload[\s\S]*?previewSize=\{isTouchLayout \? "touch" : "default"\}/,
  );
  assert.doesNotMatch(ownerWaste, /previewSize=/);
});
