import { readSql } from "./_lib/active-sql.ts";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) =>
  String(path).includes("supabase/migrations/")
    ? readSql(repoRoot, String(path).replace(/^.*?(supabase\/)/, "supabase/"))
    : readFileSync(resolve(repoRoot, path), "utf8");

test("global skip navigation lands in every primary route plane", () => {
  const rootLayout = read("apps/web/app/layout.tsx");
  assert.match(rootLayout, /href="#main-content"/);
  assert.match(rootLayout, /messages\.common\.skipNavigation/);

  const routePlanes = [
    [
      "Owner",
      "apps/web/app/components/app-shell.tsx",
      /<SidebarInset[\s\S]*?id="main-content"[\s\S]*?tabIndex=\{-1\}/,
    ],
    [
      "operator",
      "apps/web/app/(protected)/br/[branchId]/(operator)/layout.tsx",
      /id="main-content"\s+tabIndex=\{-1\}[\s\S]*role="main"/,
    ],
    [
      "POS",
      "apps/web/app/(protected)/br/[branchId]/pos/layout.tsx",
      /<main[\s\S]*id="main-content"\s+tabIndex=\{-1\}/,
    ],
    [
      "KDS",
      "apps/web/app/(protected)/br/[branchId]/kds/layout.tsx",
      /<main[\s\S]*id="main-content"\s+tabIndex=\{-1\}/,
    ],
    [
      "Pickup",
      "apps/web/app/(protected)/br/[branchId]/pickup/layout.tsx",
      /<main[\s\S]*id="main-content"\s+tabIndex=\{-1\}/,
    ],
    [
      "self-order",
      "apps/web/app/q/[token]/self-order-client.tsx",
      /id="main-content"\s+tabIndex=\{-1\}/,
    ],
    [
      "login",
      "apps/web/app/(public)/(auth)/login/page.tsx",
      /<main[\s\S]*id="main-content"\s+tabIndex=\{-1\}/,
    ],
    [
      "access denied",
      "apps/web/app/(public)/access-denied/layout.tsx",
      /<main[\s\S]*id="main-content"\s+tabIndex=\{-1\}/,
    ],
    [
      "offline",
      "apps/web/app/offline/page.tsx",
      /id="main-content"\s+tabIndex=\{-1\}/,
    ],
    [
      "not found",
      "apps/web/app/not-found.tsx",
      /<main[\s\S]*id="main-content"\s+tabIndex=\{-1\}/,
    ],
    [
      "error",
      "apps/web/app/error.tsx",
      /<main[\s\S]*id="main-content"\s+tabIndex=\{-1\}/,
    ],
  ] as const;

  for (const [name, path, landmark] of routePlanes) {
    assert.match(read(path), landmark, `${name} must own the skip-link target`);
  }

  const selfOrderClient = read("apps/web/app/q/[token]/self-order-client.tsx");
  assert.equal(
    selfOrderClient.match(/id="main-content"\s+tabIndex=\{-1\}/g)?.length,
    3,
    "Every self-order state must keep a programmatically focusable skip target",
  );
  assert.match(
    read("apps/web/app/components/surface/app-page.tsx"),
    /tabIndex\?: -1/,
    "AppPage must accept the focus-only target contract",
  );
});
