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
  assert.match(source, /const isInsightRailLayout = !useIsMobile\(1536\)/);
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

test("POS session workspace keeps context visible while each desktop pane scrolls", () => {
  assert.match(source, /paramKey="view"/);
  assert.match(source, /<BranchOperatorControlBar className="sticky top-0 z-10 bg-card">/);
  assert.match(
    source,
    /className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden"/,
  );
  assert.match(
    source,
    /scrollable && "flex-1 overflow-y-auto overscroll-contain"/,
  );
  assert.match(source, /key=\{selectedSession\.id\}/);
  assert.match(source, /gap-px overflow-hidden bg-border has-data-\[size=sm\]:gap-px/);
  assert.match(source, /rounded-none border-0 bg-card/);
  assert.match(source, /className="min-h-0 flex-1 overflow-hidden"/);
  assert.match(
    source,
    /value="bills"[\s\S]*?overflow-y-auto overscroll-contain/,
  );
  assert.match(source, /isInsightRailLayout \? \(/);
  assert.match(source, /const sessionContext = selectedSession \? \(/);
  assert.match(
    source,
    /<div className="flex min-h-0 flex-col gap-2">\s*\{sessionContext\}\s*\{billsPanel\}/,
  );
  assert.doesNotMatch(source, /session=\{isTouchLayout \? undefined : selectedSession\}/);
  assert.match(
    source,
    /grid-cols-\[minmax\(0,1fr\)_auto\]/,
  );
  assert.match(source, /grid w-full min-w-0 grid-cols-\[minmax\(0,1fr\)_auto\] items-center/);
  assert.match(source, /className="justify-self-end"/);
  assert.match(source, /whitespace-nowrap text-xs text-muted-foreground/);
  assert.match(source, /<ItemContent>\s*<div className="flex min-w-0 items-center justify-between gap-2">/);
});

test("POS session workspace keeps one touch scroll region and one mid-width insight drawer", () => {
  assert.equal((source.match(/<TabsContent/g) ?? []).length, 3);
  assert.match(source, /<AppDrawer[\s\S]*open=\{insightsOpen\}/);
  assert.match(source, /contentClassName="flex h-full flex-col overflow-hidden"/);
  assert.match(source, /posSessions\.billsTab/);
  assert.doesNotMatch(source, /settlementOpen|reportOpen/);
});
