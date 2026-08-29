/**
 * Performance contract for Inventory list-first document dialogs (YCM/PO/GRN).
 * Assertions encode the fixed open path: History-API overlay URL, gated dialog
 * bodies, GRN client detail fetch, and cheap document overlay paint.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

test("document overlay URL primitive exists for History-API dialog keys", () => {
  const hookPath = resolve(
    repoRoot,
    "apps/web/lib/navigation/use-document-overlay-url.ts",
  );
  assert.equal(existsSync(hookPath), true);
  const hook = read("apps/web/lib/navigation/use-document-overlay-url.ts");
  assert.match(hook, /history\.pushState/);
  assert.match(hook, /history\.replaceState/);
  assert.match(hook, /popstate/);
  assert.doesNotMatch(hook, /router\.(push|replace)/);
});

test("PO workspace list RSC does not bind dialog-only demandId/poId", () => {
  const page = read(
    "apps/web/app/(protected)/inventory/purchase-orders/page.tsx",
  );
  assert.doesNotMatch(
    page,
    /searchParams: Promise<\{[\s\S]*demandId\?:[\s\S]*poId\?:/,
  );
});

test("YCM/PO clients open overlays via document overlay URL, not router.push of entity ids", () => {
  const demand = read(
    "apps/web/app/(protected)/inventory/purchase-requests/purchase-requests-client.tsx",
  );
  const orders = read(
    "apps/web/app/(protected)/inventory/purchase-orders/purchase-orders-client.tsx",
  );
  assert.match(demand, /useDocumentOverlayUrl/);
  assert.match(orders, /useDocumentOverlayUrl/);
  assert.doesNotMatch(
    demand,
    /router\[history\]\(`\$\{pathname\}\?\$\{params\}`/,
  );
  assert.doesNotMatch(
    orders,
    /router\[history\]\(`\$\{pathname\}\?\$\{params\}`/,
  );
});

test("YCM create dialog does not map ingredients inside closed dialog body", () => {
  const client = read(
    "apps/web/app/(protected)/inventory/purchase-requests/purchase-requests-client.tsx",
  );
  assert.match(client, /ingredientOptions/);
  assert.doesNotMatch(client, /options=\{ingredients\.map/);
});

test("GRN list page does not RSC-mount GRNDetailClient presentation=dialog", () => {
  const page = read("apps/web/app/(protected)/inventory/grn/page.tsx");
  assert.doesNotMatch(page, /presentation="dialog"/);
  assert.doesNotMatch(page, /loadGrnDetailResult/);
  assert.doesNotMatch(page, /GRNDetailClient/);
});

test("AppDialog gates children when closed", () => {
  const source = read("apps/web/app/components/form/form-dialog.tsx");
  const appDialog = source.slice(source.indexOf("export function AppDialog"));
  assert.match(appDialog, /gatedChildren\s*=\s*open\s*\?\s*children\s*:\s*null/);
});

test("document Dialog overlay avoids backdrop-blur paint cost", () => {
  const dialog = read("packages/ui/src/components/dialog.tsx");
  assert.doesNotMatch(dialog, /supports-backdrop-filter:backdrop-blur/);
});

test("Stock issues client opens detail overlays via document overlay URL", () => {
  const issuesClient = read(
    "apps/web/app/(protected)/inventory/issues/issues-client.tsx",
  );
  assert.match(issuesClient, /useDocumentOverlayUrl/);
  assert.match(issuesClient, /<IssueDocumentDialogHost/);
  assert.match(
    issuesClient,
    /issueOverlay\.patchOverlay\(\{\s*issueId:\s*item\.id,\s*mode:\s*"view"\s*\},\s*"push"\)/,
  );
});

test("Stock issues detail routes are REDIRECT-SHIMs to list overlay", () => {
  const consumptionDetail = read(
    "apps/web/app/(protected)/inventory/consumption/[id]/page.tsx",
  );
  const issueDetail = read(
    "apps/web/app/(protected)/inventory/issues/[id]/page.tsx",
  );
  assert.match(
    consumptionDetail,
    /redirect\(`\/inventory\/consumption\?\$\{qs\.toString\(\)\}`\)/,
  );
  assert.match(
    issueDetail,
    /redirect\(`\/inventory\/consumption\?\$\{qs\.toString\(\)\}`\)/,
  );
  assert.doesNotMatch(
    consumptionDetail + issueDetail,
    /IssueDetailPageContent/,
  );
});
