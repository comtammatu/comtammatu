import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

const ownerChrome =
  /\bFeedbackInbox\b|\bQrManagement\b|\bFeedbackSubNav\b|\bCreateFeedbackQrButton\b|\bAppListFrame\b|\bDataTable\b|\bFormDialog\b|\bAppToolbar\b|presentation="branch"/;

test("Branch feedback inbox is a native touch LIST isolated from Owner FeedbackInbox", () => {
  const route = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/feedback/page.tsx",
  );
  const list = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/feedback/_components/branch-feedback-inbox-list.tsx",
  );
  const tabs = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/feedback/_components/branch-feedback-tabs.tsx",
  );
  const ownerInbox = read(
    "apps/web/app/(protected)/feedback/_components/feedback-inbox.tsx",
  );
  const ownerPage = read("apps/web/app/(protected)/feedback/page.tsx");

  assert.match(route, /<BranchFeedbackInboxList/);
  assert.match(route, /<BranchFeedbackTabs/);
  assert.match(route, /<BranchFeedbackPage/);
  assert.match(route, /listFeedbackInbox/);
  assert.doesNotMatch(route, ownerChrome);

  assert.match(list, /BranchOperatorPanel/);
  assert.match(list, /ItemGroup/);
  assert.match(list, /flex-nowrap/);
  assert.match(list, /size="touch"/);
  assert.doesNotMatch(list, ownerChrome);
  assert.doesNotMatch(list, /\bfont-bold\b|style=\{\{/);

  assert.match(tabs, /ToggleGroup/);
  assert.match(tabs, /size="touch"/);
  assert.doesNotMatch(tabs, /AppToolbar|FeedbackSubNav|flex-wrap/);

  const chrome = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/feedback/_components/branch-feedback-page.tsx",
  );
  assert.match(chrome, /BranchOperatorPage/);
  assert.doesNotMatch(chrome, /hideHeaderOnMobile/);
  assert.doesNotMatch(
    chrome,
    /BranchOperatorControlBar|ACTIONS_VI\.back|IconArrowLeft/,
  );

  assert.match(ownerPage, /<FeedbackInbox/);
  assert.match(ownerInbox, /\bDataTable\b/);
  assert.match(ownerInbox, /\bAppListFrame\b/);
});

test("Branch feedback QR is a native touch LIST isolated from Owner QrManagement", () => {
  const route = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/feedback/qr/page.tsx",
  );
  const client = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/feedback/_components/branch-feedback-qr-client.tsx",
  );
  const ownerQr = read(
    "apps/web/app/(protected)/feedback/_components/qr-management.tsx",
  );
  const ownerPage = read("apps/web/app/(protected)/feedback/qr/page.tsx");
  const ownerCreate = read(
    "apps/web/app/(protected)/feedback/_components/create-feedback-qr-button.tsx",
  );

  assert.match(route, /<BranchFeedbackQrClient/);
  assert.match(route, /<BranchFeedbackTabs/);
  assert.match(route, /<BranchFeedbackPage/);
  assert.match(route, /listFeedbackQrCodes/);
  assert.doesNotMatch(route, ownerChrome);

  assert.match(client, /BranchOperatorPanel/);
  assert.match(client, /ItemGroup/);
  assert.match(client, /flex-nowrap/);
  assert.match(client, /<AppSheet/);
  assert.match(client, /RowActionsMenu/);
  assert.match(client, /QrCodeImage/);
  assert.doesNotMatch(client, /NumberPadSheet/);
  assert.match(client, /createFeedbackQr/);
  assert.match(client, /size="touch"/);
  assert.match(client, /triggerSize="icon-touch"/);
  assert.match(client, /<SelectTrigger[\s\S]*size="touch"/);
  assert.match(client, /<SelectItem[\s\S]*size="touch"/);
  assert.doesNotMatch(client, ownerChrome);
  assert.doesNotMatch(client, /\bfont-bold\b|style=\{\{/);
  assert.doesNotMatch(
    client,
    /\b(?:w|h|min-w|min-h|max-w|max-h|gap|p|px|py)-\[[^\]\r\n]*\]/,
  );

  assert.match(ownerPage, /<QrManagement/);
  assert.match(ownerPage, /CreateFeedbackQrButton/);
  assert.match(ownerQr, /\bDataTable\b/);
  assert.match(ownerQr, /\bAppListFrame\b/);
  assert.match(ownerCreate, /FormDialog/);
});
