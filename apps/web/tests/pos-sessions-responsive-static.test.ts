import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const source = readFileSync(
  resolve(
    repoRoot,
    "apps/web/app/(protected)/br/[branchId]/(operator)/pos-sessions/pos-sessions-client.tsx",
  ),
  "utf8",
);

test("POS session history stays immediately reachable on touch layouts", () => {
  assert.match(source, /const isTouchLayout = useIsMobile\(1280\)/);
  assert.match(source, /open=\{sessionHistoryOpen\}/);
  assert.match(source, /onClick=\{\(\) => setSessionHistoryOpen\(true\)\}/);
  assert.match(source, /onClick=\{onSessionSelect\}/);
  assert.match(
    source,
    /<Button[\s\S]*?size="touch"[\s\S]*?posSessions\.sessionHistory/,
  );
  assert.equal((source.match(/<SessionHistoryPanel/g) ?? []).length, 1);
  assert.doesNotMatch(source, /order-2 min-w-0 xl:order-1/);
  assert.doesNotMatch(source, /selectedSession \? <div \/> : null/);
});
