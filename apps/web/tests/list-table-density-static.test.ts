import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const root = join(import.meta.dirname, "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

test("TableHead uses dense control_surface row height", () => {
  const table = read("../../packages/ui/src/components/table.tsx");
  assert.match(
    table,
    /function TableHead[\s\S]{0,200}"h-8 px-2 text-left align-middle/,
  );
  assert.doesNotMatch(
    table,
    /function TableHead[\s\S]{0,200}"h-10 px-2/,
  );
});

test("AppListFrame flushes Card vertical pad so toolbar/table own edge rhythm", () => {
  const surface = read("../../packages/ui/src/surface/list-frame.tsx");
  assert.match(
    surface,
    /function AppListFrame\([\s\S]*?hasHeader \? "pb-0" : "py-0"/,
  );
  assert.match(
    surface,
    /hasToolbar \?[\s\S]*?"bg-card"[\s\S]*flushTop \? "overflow-hidden rounded-t-lg"/,
  );
  assert.match(
    surface,
    /"min-w-0 overflow-hidden"[\s\S]{0,80}flushTop && !hasToolbar && "rounded-t-lg"[\s\S]{0,40}"rounded-b-lg"/,
  );
  assert.doesNotMatch(
    surface,
    /function AppListFrame\([\s\S]*?\bgap-0\b/,
  );
});

test("stuck LIST filter chrome overrides resting card-corner radius", () => {
  const surface = read("../../packages/ui/src/surface/sticky-filter-chrome.tsx");
  const stickyFn = surface.slice(
    surface.indexOf("export function AppStickyFilterChrome"),
  );
  assert.match(
    stickyFn,
    /"bg-card"[\s\S]*className,\s*\/\/ Stuck overrides[\s\S]*stuck\s*\?[\s\S]*"overflow-visible rounded-none shadow-lg"/,
  );
  assert.doesNotMatch(
    stickyFn,
    /transition-\[margin,width,border-radius,box-shadow\]/,
  );
});

test("inline LIST toolbar and pagination use compact vertical pad", () => {
  const surface = read("../../packages/ui/src/surface/toolbar.tsx");
  const pagination = read(
    "app/components/data-table/data-table-pagination.tsx",
  );
  assert.match(
    surface,
    /"gap-2 overflow-visible border-b border-border px-3 py-2"/,
  );
  assert.match(
    pagination,
    /"flex items-center justify-between gap-2 border-t px-3 py-2"/,
  );
  assert.doesNotMatch(pagination, /border-t p-3/);
});

test("DataTable stack relies on borders, not outer gap-3 chrome", () => {
  const dataTable = read("app/components/data-table/data-table.tsx");
  assert.match(dataTable, /className=\{cn\("flex flex-col", className\)\}/);
  assert.doesNotMatch(
    dataTable,
    /className=\{cn\("flex flex-col gap-3", className\)\}/,
  );
  assert.match(dataTable, /flex flex-col gap-2 px-3 py-3/);
});
