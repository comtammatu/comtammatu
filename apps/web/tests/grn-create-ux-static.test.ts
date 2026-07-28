import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

/**
 * Owner GRN create/operate UX — source picker + line form.
 * Complements Wave A/C chrome ratchets with visible operator layout contracts.
 */

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

test("GRN new page opens multi-supplier create without source picker", () => {
  const page = read("app/(protected)/inventory/grn/new/page.tsx");

  assert.match(page, /loadGrnCreatePageData/);
  assert.match(page, /GrnCreateClient/);
  assert.doesNotMatch(page, /SupplierPicker/);
  assert.doesNotMatch(page, /DocumentFormFrame/);
});

test("GRN create uses Wave-E-like context + progressive desk editor", () => {
  const client = read(
    "app/(protected)/inventory/grn/new/[supplierId]/grn-create-client.tsx",
  );
  const editor = read(
    "app/(protected)/inventory/_components/grn-line-editor.tsx",
  );
  const copy = read("lib/inventory/grn-create-copy.ts");

  assert.match(client, /DocumentFormFrame/);
  assert.match(client, /density="compact"/);
  assert.match(client, /const contextStrip =/);
  assert.match(client, /draftLinesSection/);
  assert.match(client, /catalogPickerDialog/);
  assert.match(client, /AppDialog/);
  assert.match(
    client,
    /showDeskEditor &&[\s\S]*lg:grid-cols-\[minmax\(0,1fr\)_minmax\(18rem,22rem\)\]/,
    "desk editor column only when a line is open",
  );
  assert.match(
    client,
    /contextStrip[\s\S]*draftLinesSection/,
    "reading order: context → single lines region",
  );
  assert.doesNotMatch(
    client,
    /catalogSection/,
    "catalog is not a second always-on AppSection",
  );
  assert.match(
    client,
    /action=\{\s*<Button[\s\S]*GRN_CREATE_COPY\.addItem/,
    "lines section exposes Thêm mặt hàng add affordance",
  );
  assert.match(
    client,
    /pickCatalogIngredient/,
    "picker selects ingredient then opens progressive line editor",
  );
  assert.match(client, /pb-24/, "workspace reserves sticky footer clearance");
  assert.match(
    client,
    /lg:sticky lg:top-3[\s\S]*lg:max-h-\[calc\(100dvh-8\.5rem\)\][\s\S]*lg:overflow-hidden/,
    "desk editor sticks and scrolls above sticky footer",
  );
  assert.match(
    client,
    /contentClassName="min-h-0 flex-1 gap-3 overflow-y-auto"/,
    "desk editor fields scroll independently inside panel",
  );
  assert.match(
    client,
    /<AppDetailFooter[\s\S]*sticky[\s\S]*leading=/,
    "sticky footer shows leading line summary",
  );
  assert.match(
    client,
    /footerLineSummary/,
    "footer leading is SSOT for line count (D091 — no money / PO price clause)",
  );
  assert.doesNotMatch(
    client,
    /footerLineSummary\(\s*controller\.lineCount\s*,\s*controller\.total/,
    "create footer must not pass warehouse money total before PO sync",
  );
  assert.match(
    client,
    /GRN_CREATE_COPY\.reviewBeforeConfirm\(/,
    "CTA label is short — no duplicated count/total args",
  );
  assert.match(
    client,
    /title=\{GRN_CREATE_COPY\.newReceiptTitle\}/,
    "page title is Phiếu nhập mới",
  );
  assert.match(
    client,
    /controller\.supplierSummary/,
    "context shows supplier summary from draft lines",
  );
  assert.doesNotMatch(
    client,
    /description=\{GRN_CREATE_COPY\.(newReceiptDescription|catalogDescription)\}/,
    "no instructional page/catalog fluff above the work surface",
  );
  assert.doesNotMatch(
    client,
    /contextStrip[\s\S]*moneyVnd\(controller\.total\)/,
    "context strip does not restate footer running total",
  );
  assert.match(
    client,
    /title=\{GRN_CREATE_COPY\.draftLinesTitle\}/,
    "draft section title stays fixed (count lives in footer)",
  );
  assert.match(
    client,
    /<DocumentFormFrame[\s\S]*footer=\{footer\}/,
    "GRN create: AppPage footer slot via DocumentFormFrame (outside max-width)",
  );
  assert.match(
    client,
    /trailing=\{\s*<Button[\s\S]*sm:min-w-80/,
    "primary CTA is direct trailing Button (no inset wrapper gap)",
  );
  assert.match(client, /GrnLineEditSheet/);
  assert.match(client, /backToList|discardDraft|submit/);
  assert.doesNotMatch(client, /panelEmptyTitle|panelEmptyDescription/);
  assert.doesNotMatch(
    client,
    /lg:grid lg:grid-cols-\[minmax\(0,1fr\)_22rem\][\s\S]*panelEmpty/,
  );
  assert.doesNotMatch(
    editor,
    /grn-line-note|optionalNote|notePlaceholder/,
    "create line editor must not keep a generic QC-note field",
  );
  assert.match(
    editor,
    /grn-line-supplier|supplierLabel/,
    "line editor exposes NCC when ingredient has multiple suppliers",
  );

  assert.match(
    client,
    /DataTable/,
    "draft lines use DataTable (Wave-E-like grid on desktop)",
  );
  assert.match(
    client,
    /draftLineColumns/,
    "draft line columns are declared for the DataTable",
  );
  assert.doesNotMatch(
    client,
    /unitCostTitle/,
    "GRN draft must not render a dead purchase-price column",
  );
  assert.match(
    client,
    /mobileCardRender/,
    "draft lines keep a mobile card pattern",
  );
  assert.match(
    client,
    /showBranchPicker \?[\s\S]*FormField[\s\S]*showLocationPicker \?/,
    "branch and location fields render independently (no always-on pair)",
  );
  assert.match(
    client,
    /showBothReceivingPickers[\s\S]*receivingBranch[\s\S]*receivingWarehouse/,
    "when both pickers show: Chi nhánh + Kho nhận",
  );
  assert.match(
    client,
    /getGrnLocationKindLabel\(location\)/,
    "location options use kind labels (not branch · name duplication)",
  );
  assert.match(
    client,
    /receivingWarehouse\}{" "\}/,
    "collapsed strip uses Kho nhận (glossary receiving warehouse)",
  );
  assert.doesNotMatch(
    client,
    /desktopFooterRows|mobileFooter/,
    "draft table does not duplicate footer running total",
  );

  assert.match(copy, /draftEmptyTitle/);
  assert.match(copy, /catalogTitle/);
  assert.match(copy, /addItem:\s*"Thêm mặt hàng"/);
  assert.match(copy, /addLineToReceipt/);
  assert.match(copy, /footerLineSummary/);
  assert.match(
    copy,
    /footerLineSummary:\s*\(lineCount: number\) =>/,
    "footer is qty/count only — no money arg before sync",
  );
  assert.match(
    copy,
    /footerLineSummary:[\s\S]*mặt hàng`/,
    "footer copy is count-only (no Giá … PO clause)",
  );
  assert.doesNotMatch(
    copy,
    /Giá mua trên PO|Giá trên PO|priceOnPoShort/,
    "warehouse draft surfaces must not show mixed-language Giá … PO",
  );
  assert.doesNotMatch(
    copy,
    /priceRequired:\s*"Nhập giá"|linePriceRequired:|toastMissingPrices:/,
    "stale warehouse price-required copy must not remain in create SSOT",
  );
  assert.match(
    copy,
    /draftEmptyDescription:\s*"Nhấn Thêm mặt hàng/,
    "empty copy points at the add affordance, not a below-catalog section",
  );
  assert.match(
    copy,
    /reviewBeforeConfirm:\s*\(lineCount: number\) =>/,
    "CTA copy omits count/total (footer SSOT)",
  );
  assert.match(
    copy,
    /receivingBranch:\s*"Chi nhánh"/,
    "branch picker uses glossary chi nhánh when location also choosable",
  );
  assert.match(
    copy,
    /receivingLocation:\s*"Kho nhận"/,
    "location picker aligns to Kho nhận (not Nơi nhập)",
  );
  assert.match(
    copy,
    /receivingLocationHint:/,
    "hint clarifies location is stock position within the branch",
  );
  assert.doesNotMatch(
    copy,
    /receivingLocation:\s*"Nơi nhập"/,
    "create copy no longer uses Nơi nhập for the location field",
  );
  assert.doesNotMatch(copy, /newReceiptDescription|catalogDescription/);
  assert.doesNotMatch(copy, /panelEmptyTitle/);
  assert.doesNotMatch(
    copy,
    /priceSetOnPoHint|\(PO\)|Giá mua trên PO|Giá trên PO/,
    "warehouse create copy has no mixed-language PO price hint (D091)",
  );
  assert.doesNotMatch(
    copy,
    /unitCostTitle|priorPriceLine|unitPriceUnit/,
    "GRN create copy must not carry purchase-price display helpers",
  );
  assert.doesNotMatch(
    editor,
    /MoneyVndInput|grn-line-unit-cost/,
    "shared line fields do not collect warehouse unit cost (D091)",
  );
  assert.doesNotMatch(
    editor,
    /priceSetOnPoHint/,
    "shared line fields omit redundant PO price hint",
  );
});
