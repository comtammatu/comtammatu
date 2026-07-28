import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

/**
 * Inventory DETAIL+DOC — Wave E (GRN DETAIL visible archetype converge).
 *
 * page-archetypes DETAIL exemplar: tabs (document + Lịch sử), confirmed lines
 * via DataTable + footers, sticky AppDetailFooter. Draft lines use the same
 * DataTable / mobile-card / desk-editor density as create DOC.
 */

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

test("Wave E GRN DETAIL uses AppPageTabs document/history", () => {
  const client = read(
    "app/(protected)/inventory/grn/[id]/grn-detail-client.tsx",
  );

  assert.match(client, /AppPageTabs/, "grn detail: AppPageTabs");
  assert.match(
    client,
    /value:\s*"document"/,
    "grn detail: document tab",
  );
  assert.match(client, /value:\s*"history"/, "grn detail: history tab");
  assert.match(client, /TabsContent value="history"/, "grn detail: history pane");
  assert.match(client, /AuditHistoryList/, "grn detail: audit list in history");
  assert.doesNotMatch(
    client,
    /collapsible=\{true\}[\s\S]*AuditHistoryList|AuditHistoryList[\s\S]*collapsible=\{true\}/,
    "grn detail: history is a tab, not collapsible section",
  );
});

test("Wave E GRN DETAIL confirmed lines use DataTable + sticky footer", () => {
  const client = read(
    "app/(protected)/inventory/grn/[id]/grn-detail-client.tsx",
  );
  const surface = read("app/components/surface.tsx");

  assert.match(client, /DataTable/, "grn detail: DataTable");
  assert.match(
    client,
    /desktopFooterRows/,
    "grn detail: desktopFooterRows totals",
  );
  assert.match(client, /mobileFooter/, "grn detail: mobileFooter totals");
  assert.match(
    client,
    /<AppDetailFooter[\s\S]*sticky/,
    "grn detail: sticky AppDetailFooter",
  );
  assert.match(
    client,
    /<AppPage[\s\S]*footer=\{footer\}/,
    "grn detail: AppPage footer slot (outside max-width column)",
  );
  assert.doesNotMatch(
    client,
    /title=\{grnCopy\.qcSummary\}/,
    "grn detail: no tall QC summary AppSection above lines",
  );
  assert.match(
    client,
    /contextStrip/,
    "grn detail: dense context strip before lines",
  );
  const linesIdx = client.indexOf("inspectionItemsTitle");
  const stripIdx = client.indexOf("contextStrip");
  assert.ok(stripIdx >= 0 && linesIdx > stripIdx, "context strip precedes lines section");
  assert.match(
    surface,
    /footer\?: ReactNode/,
    "AppPage accepts full-width footer slot",
  );
  assert.match(
    surface,
    /mt-auto w-full shrink-0/,
    "AppPage footer docks to bottom on short pages",
  );
  assert.match(
    surface,
    /in-\[\[data-owner-shell-scroll\]\]:-mx-3/,
    "AppDetailFooter sticky: horizontal shell bleed",
  );
  assert.match(
    surface,
    /in-\[\[data-owner-shell-scroll\]\]:w-\[calc\(100%\+1\.5rem\)\]/,
    "AppDetailFooter sticky: widen border box (w-full + -mx does not bleed)",
  );
  assert.match(
    surface,
    /APP_PAGE_STICKY_FOOTER_SHELL_BLEED_CLASSNAME/,
    "surface exports shell bleed helper",
  );
  assert.match(
    surface,
    /footer=\{footer\}/,
    "DocumentFormFrame forwards footer to AppPage slot",
  );
});

test("Wave E GRN DETAIL draft aligns with create DOC density", () => {
  const client = read(
    "app/(protected)/inventory/grn/[id]/grn-detail-client.tsx",
  );
  const card = read(
    "app/(protected)/inventory/grn/[id]/views/draft-grn-line-card.tsx",
  );

  assert.match(client, /draftColumns/, "draft: DataTable columns declared");
  assert.match(
    client,
    /isDraft \?[\s\S]*draftLinesSection[\s\S]*confirmedLinesSection/,
    "draft vs confirmed line sections split",
  );
  assert.match(
    client,
    /setAddDialogOpen\(true\)/,
    "draft: Thêm dòng / add opens picker (not always-on catalog)",
  );
  assert.match(
    client,
    /AddGrnLineDialog/,
    "draft: add opens dialog picker, not a second AppSection catalog",
  );
  assert.doesNotMatch(
    client,
    /catalogSection|catalogTitle|Danh mục nguyên liệu/,
    "draft DETAIL does not stack a catalog AppSection under lines",
  );
  assert.match(
    client,
    /DraftGrnLineCard/,
    "draft: compact mobile cards (not inline LineRow stack)",
  );
  assert.match(card, /DraftGrnLineCard/, "draft card module exists");
  assert.match(
    client,
    /footerLineSummary/,
    "draft footer leading is SSOT for count only (D089)",
  );
  assert.doesNotMatch(
    client,
    /footerLineSummary\(\s*lines\.length\s*,\s*stats\.total/,
    "draft footer must not show warehouse money total before PO sync",
  );
  assert.doesNotMatch(
    client,
    /priceRequired/,
    "draft DETAIL cost column must not warn Nhập giá when cost is 0",
  );
  assert.match(
    client,
    /line\.monetary && line\.monetary\.unitCost > 0[\s\S]*inventoryCommon\.noValue/,
    "draft DETAIL shows — until unit_cost synced",
  );
  assert.doesNotMatch(
    client,
    /priceOnPoShort/,
    "draft DETAIL must not show mixed-language Giá … PO",
  );
  assert.doesNotMatch(
    card,
    /priceRequired/,
    "draft mobile card must not warn Nhập giá",
  );
  assert.doesNotMatch(
    card,
    /priceOnPoShort/,
    "draft mobile card omits Giá … PO when cost is 0",
  );
  assert.match(
    client,
    /isDraft[\s\S]*receivingWarehouse[\s\S]*branchName/,
    "draft context strip shows Kho nhận",
  );
  assert.doesNotMatch(
    client,
    /draftQcHint/,
    "draft section has no instructional fluff description",
  );
  assert.match(
    client,
    /pb-24/,
    "draft workspace reserves sticky footer clearance",
  );
  assert.match(
    client,
    /showDeskEditor &&[\s\S]*lg:grid-cols-\[minmax\(0,1fr\)_minmax\(18rem,22rem\)\]/,
    "draft desk editor column only when a line is open",
  );
  assert.match(
    client,
    /lg:sticky lg:top-3[\s\S]*lg:max-h-\[calc\(100dvh-8\.5rem\)\][\s\S]*lg:overflow-hidden/,
    "draft desk editor sticks and scrolls above sticky footer",
  );
  assert.match(
    client,
    /contentClassName="min-h-0 flex-1 gap-3 overflow-y-auto"/,
    "draft desk editor fields scroll independently inside panel",
  );
  assert.match(
    client,
    /chrome="plain"/,
    "draft line editor uses plain chrome in sheet/desk",
  );
  assert.match(
    client,
    /!isDraft \?[\s\S]*stats\.total[\s\S]*: null/,
    "draft strip does not restate footer running total",
  );
  assert.doesNotMatch(
    client,
    /lines\.map\(\(line, idx\) =>[\s\S]*<LineRow/,
    "draft no longer stacks full LineRow cards as the primary list",
  );
});
