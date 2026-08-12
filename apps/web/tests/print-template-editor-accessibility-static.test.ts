import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const source = readFileSync(
  join(
    process.cwd(),
    "app/(protected)/settings/printers/templates/templates-client.tsx",
  ),
  "utf8",
);

test("print-template blocks keep stable editor identities through list operations", () => {
  assert.match(source, /const editorIdPrefix = useId\(\)/);
  assert.match(
    source,
    /const \[blockEditorIdsByKind, setBlockEditorIdsByKind\]/,
  );
  assert.match(source, /setBlockEditorIds\(nextEditorIds\)/);
  assert.match(
    source,
    /setBlockEditorIds\(blockEditorIds\.filter\(\(_, i\) => i !== index\)\)/,
  );
  assert.match(
    source,
    /setBlockEditorIds\(\[\.\.\.blockEditorIds, createBlockEditorId\(\)\]\)/,
  );
  assert.match(source, /<Item key=\{blockEditorId\}/);
  assert.match(source, /idPrefix=\{blockEditorId\}/);
});

test("print-template editor fields have per-block labels and unique control ids", () => {
  const inputs = source.match(/<Input\b[\s\S]*?\/>/g) ?? [];
  const textareas = source.match(/<Textarea\b[\s\S]*?\/>/g) ?? [];
  const selectTriggers = source.match(/<SelectTrigger\b[\s\S]*?>/g) ?? [];

  assert.equal(inputs.length, 8);
  assert.equal(
    inputs.every((tag) => /\bid=/.test(tag)),
    true,
  );
  assert.equal(textareas.length, 2);
  assert.equal(
    textareas.every((tag) => /\bid=/.test(tag)),
    true,
  );
  assert.equal(selectTriggers.length, 3);
  assert.equal(
    selectTriggers.every((tag) => /\bid=/.test(tag)),
    true,
  );
  assert.match(source, /<FormattedNumberInput\s+id=\{`\$\{idPrefix\}-lines`\}/);
  assert.match(source, /htmlFor=\{`\$\{idPrefix\}-bold`\}/);
  assert.match(source, /htmlFor=\{`\$\{idPrefix\}-double`\}/);
  assert.match(source, /<Label htmlFor=\{id\} className="sr-only">/);
  assert.doesNotMatch(source, /toggle-style-(?:bold|double)/);
});

test("print-template controls are touch-safe below lg and retain compact desktop sizing", () => {
  assert.match(
    source,
    /const isTouchLayout = useIsMobile\((?:1024|OWNER_SHELL_BREAKPOINT)\)/,
  );
  assert.equal(
    source.match(/size=\{isTouchLayout \? "icon-touch" : "icon-sm"\}/g)?.length,
    3,
  );
  assert.ok(
    (source.match(/size=\{isTouchLayout \? "touch" : "default"\}/g) ?? [])
      .length >= 8,
  );
  assert.ok(
    (
      source.match(/controlSize=\{isTouchLayout \? "touch" : "default"\}/g) ??
      []
    ).length >= 9,
  );
  assert.match(source, /flex flex-col gap-2 sm:flex-row sm:items-end/);
  assert.match(source, /className="w-full gap-1 sm:w-auto"/);
  assert.doesNotMatch(source, /min-h-12[^"\n]*lg:min-h-0/);
  assert.doesNotMatch(source, /className="[^"]*size-12/);
});
