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
  assert.match(client, /value:\s*"document"/, "grn detail: document tab");
  assert.match(client, /value:\s*"history"/, "grn detail: history tab");
  assert.match(
    client,
    /TabsContent value="history"/,
    "grn detail: history pane",
  );
  assert.match(client, /AuditHistoryList/, "grn detail: audit list in history");
  assert.doesNotMatch(
    client,
    /collapsible=\{true\}[\s\S]*AuditHistoryList|AuditHistoryList[\s\S]*collapsible=\{true\}/,
    "grn detail: history is a tab, not collapsible section",
  );
});

test("GRN document dialog keeps tabs and CTA footer inside the dialog frame", () => {
  const client = read(
    "app/(protected)/inventory/grn/[id]/grn-detail-client.tsx",
  );
  const surface = read("app/components/surface/app-detail-footer.tsx");

  assert.match(
    client,
    /stickyList=\{!embedded && presentation !== "dialog"\}/,
    "dialog tabs must not use the Owner shell sticky offset",
  );
  assert.match(
    client,
    /presentation\?: "page" \| "dialog"/,
    "GRN DETAIL supports page and dialog presenters",
  );
  assert.match(
    client,
    /title=\{\s*<div className="flex flex-wrap items-center gap-2">[\s\S]*StatusBadge[\s\S]*label=\{statusBadge\.label\}/,
    "dialog title carries code + StatusBadge",
  );
  assert.match(
    client,
    /description=\{\s*<span>[\s\S]*grn\.supplier/,
    "dialog description carries supplier identity",
  );
  assert.match(
    client,
    /variant="outline"[\s\S]*grnMessages\.kpiLines/,
    "document body leads with KPI Item strip",
  );
  assert.match(
    surface,
    /in-\[\[data-slot=dialog-footer\]\]:static[\s\S]*in-\[\[data-slot=dialog-footer\]\]:w-full/,
    "sticky detail footers fill the dialog footer instead of floating right",
  );
  assert.match(
    surface,
    /in-\[\[data-slot=dialog-footer\]\]:border-0[\s\S]*in-\[\[data-slot=dialog-footer\]\]:bg-transparent[\s\S]*in-\[\[data-slot=dialog-footer\]\]:shadow-none/,
    "dialog footer owns its border, background, and elevation",
  );
});

test("Wave E GRN DETAIL confirmed lines use DataTable + physical-QC footer", () => {
  const client = read(
    "app/(protected)/inventory/grn/[id]/grn-detail-client.tsx",
  );
  const surface = [
    "app/components/surface/app-page.tsx",
    "app/components/surface/app-detail-footer.tsx",
    "app/components/surface/document-form-frame.tsx",
  ]
    .map((path) => read(path))
    .join("\n");

  assert.match(client, /DataTable/, "grn detail: DataTable");
  assert.match(client, /footerLineSummary/, "grn detail: line-count footer");
  assert.doesNotMatch(
    client,
    /desktopFooterRows|mobileFooter|line\.monetary/,
    "grn detail: no GRN monetary footer",
  );
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
  assert.ok(
    stripIdx >= 0 && linesIdx > stripIdx,
    "context strip precedes lines section",
  );
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
    /in-\[\[data-control-surface-scroll\]\]:-mx-3/,
    "AppDetailFooter sticky: horizontal shell bleed",
  );
  assert.match(
    surface,
    /in-\[\[data-control-surface-scroll\]\]:w-\[calc\(100%\+1\.5rem\)\]/,
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
    "draft footer leading is SSOT for count only (D091)",
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
  assert.doesNotMatch(
    client,
    /line\.monetary/,
    "draft DETAIL does not expose the PO price snapshot",
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
  assert.doesNotMatch(
    client,
    /pb-24/,
    "shared detail footer owns its layout without route-local padding",
  );
  assert.match(
    client,
    /key: "actual"[\s\S]*header: grnCopy\.lineHeaderQty[\s\S]*<LineRow[\s\S]*showHeader=\{false\}/,
    "draft desktop table edits accepted quantity in its own column",
  );
  assert.doesNotMatch(
    client,
    /key: "rejected"/,
    "draft desktop table keeps rejected goods inside the exception disclosure",
  );
  assert.doesNotMatch(
    client,
    /showDeskEditor|<aside|lg:grid-cols-\[minmax\(0,1fr\)_minmax\(18rem,22rem\)\]/,
    "draft desktop table has no side editor panel",
  );
  assert.match(
    client,
    /chrome="plain"/,
    "draft line editor uses plain chrome in sheet/desk",
  );
  assert.doesNotMatch(client, /stats\.total/, "GRN detail has no money total");
  assert.doesNotMatch(
    client,
    /lines\.map\(\(line, idx\) =>[\s\S]*<LineRow/,
    "draft no longer stacks full LineRow cards as the primary list",
  );
});
