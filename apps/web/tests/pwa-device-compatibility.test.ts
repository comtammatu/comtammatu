import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("POS never expands its dynamic viewport with a large viewport minimum", () => {
  const source = readFileSync(
    new URL("../app/(protected)/br/[branchId]/pos/layout.tsx", import.meta.url),
    "utf8",
  );
  const shell = source.match(/<main[\s\S]*?className="([^"]+)"/)?.[1];
  assert.ok(shell);
  assert.match(shell, /\bh-dvh\b/);
  assert.doesNotMatch(
    shell,
    /(?:^|\s)(?:\S+:)?(?:min-h-screen|h-screen)(?:\s|$)/,
  );
});

test("PWA Chrome support does not promise browsers below the Tailwind 4 floor", () => {
  const contract = readFileSync(
    new URL("../../../docs/spec/pwa.md", import.meta.url),
    "utf8",
  );
  assert.match(contract, /Android 12 \+ Chrome 111\+/);
  assert.doesNotMatch(contract, /Chrome 108\+/);
});
