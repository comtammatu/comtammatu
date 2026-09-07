import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../../..", import.meta.url));

function read(relativePath: string): string {
  return readFileSync(`${repositoryRoot}/${relativePath}`, "utf8");
}

test("Domain 5 - Audio settings conforms to 48px touch controls, size-4 icons, and dictionary copy", () => {
  const audioForm = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/settings/audio/audio-form.tsx",
  );
  const settingsMessages = read("apps/web/lib/messages/settings.ts");

  // Select triggers and text inputs use touch size
  assert.match(
    audioForm,
    /<SelectTrigger size="touch">/,
    "Audio form select triggers must use size touch",
  );
  assert.match(
    audioForm,
    /controlSize="touch"/,
    "Audio form custom voice input must use controlSize touch",
  );

  // Action buttons use size="touch"
  assert.match(
    audioForm,
    /<Button[^>]*size="touch"/,
    "Audio form preview and save buttons must use size touch",
  );

  // Standard icon size
  assert.match(
    audioForm,
    /<Play className="size-4"/,
    "Play icon must use canonical size-4",
  );
  assert.match(
    audioForm,
    /<Spinner className="size-4"/,
    "Spinner icon must use canonical size-4",
  );
  assert.doesNotMatch(
    audioForm,
    /h-4 w-4/,
    "Audio form must not use raw h-4 w-4 utility classes",
  );

  // Messages dictionary coverage
  assert.match(
    settingsMessages,
    /previewFailed:/,
    "Settings messages must define audio previewFailed key",
  );
  assert.match(
    settingsMessages,
    /defaultVoiceSuffix:/,
    "Settings messages must define audio defaultVoiceSuffix key",
  );
  assert.doesNotMatch(
    audioForm,
    /toast\.error\("Không thể phát âm thanh xem trước\."\)/,
    "Audio form must not use inline Vietnamese error string",
  );
});

test("Domain 5 - Close Day and POS Sessions conform to 48px touch, multi-column grids, and canonical icons", () => {
  const closeDay = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/close-day/close-day-client.tsx",
  );
  const posSessions = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/pos-sessions/pos-sessions-client.tsx",
  );

  // Close Day checks
  assert.doesNotMatch(
    closeDay,
    /size-3\.5/,
    "Close Day client must not contain forbidden size-3.5 icons",
  );
  assert.match(
    closeDay,
    /<ChevronUp className="size-4" data-icon="inline-start" \/>/,
    "Close Day ChevronUp must use canonical size-4",
  );
  assert.match(
    closeDay,
    /<ChevronDown className="size-4" data-icon="inline-start" \/>/,
    "Close Day ChevronDown must use canonical size-4",
  );
  assert.match(
    closeDay,
    /min-h-12/,
    "Close Day rows must enforce 48px touch height",
  );
  assert.match(
    closeDay,
    /lg:grid-cols-2/,
    "Close Day must use responsive multi-column layout on desktop",
  );

  // POS Sessions checks
  assert.match(
    posSessions,
    /useIsMobile\(1280\)/,
    "POS Sessions client must adapt layout for touch viewports at 1280px threshold",
  );
  assert.match(
    posSessions,
    /<Drawer open=\{sessionHistoryOpen\}/,
    "POS Sessions must use drawer for session history on mobile/touch screens",
  );
  assert.match(
    posSessions,
    /lg:grid-cols-\[minmax\(18rem,22rem\)_minmax\(0,1fr\)\]/,
    "POS Sessions must use multi-column desktop grid for cashier screens",
  );
  assert.match(
    posSessions,
    /size="touch"/,
    "POS Sessions interactive triggers must use touch size",
  );
});

test("Domain 5 - Tables and Zones settings enforce 48px touch triggers, responsive grids, and Pattern A tabs", () => {
  const tablesClient = read(
    "apps/web/app/(protected)/br/_shared/settings/tables/tables-client.tsx",
  );
  const tableTable = read(
    "apps/web/app/(protected)/br/_shared/settings/tables/table-table.tsx",
  );
  const zoneTable = read(
    "apps/web/app/(protected)/br/_shared/settings/tables/zone-table.tsx",
  );

  // Pattern A tabs
  assert.match(
    tablesClient,
    /<TabsList size="touch" layout="equal">/,
    "Tables client must use Pattern A tabs with size touch and equal layout",
  );

  // Action buttons
  assert.match(
    tablesClient,
    /<Button[^>]*size="touch"/,
    "Tables client actions must use size touch",
  );

  // Responsive grids and 48px touch row action menus
  assert.match(
    tableTable,
    /grid gap-2 sm:grid-cols-2 lg:grid-cols-3/,
    "Table cards must render in responsive multi-column grid",
  );
  assert.match(
    tableTable,
    /triggerSize=\{touch \? "icon-touch" : "icon-lg"\}/,
    "Table actions menu must use touch-sized trigger",
  );
  assert.match(
    tableTable,
    /min-h-12/,
    "Dining table cards must enforce 48px min-h-12",
  );

  assert.match(
    zoneTable,
    /grid gap-2 sm:grid-cols-2 lg:grid-cols-3/,
    "Zone cards must render in responsive multi-column grid",
  );
  assert.match(
    zoneTable,
    /triggerSize=\{touch \? "icon-touch" : "icon-lg"\}/,
    "Zone actions menu must use touch-sized trigger",
  );
  assert.match(
    zoneTable,
    /min-h-12/,
    "Zone cards must enforce 48px min-h-12",
  );
});

test("Domain 5 - KDS Stations, POS Terminals, and Printers enforce touch controls and responsive density", () => {
  const stationsClient = read(
    "apps/web/app/(protected)/br/_shared/settings/kds/stations-client.tsx",
  );
  const terminalsClient = read(
    "apps/web/app/(protected)/br/_shared/settings/pos/terminals-client.tsx",
  );
  const printersClient = read(
    "apps/web/app/(protected)/br/_shared/settings/printers/printers-client.tsx",
  );

  // Stations client
  assert.match(
    stationsClient,
    /size=\{embedded \? "touch" : "field"\}/,
    "Stations client branch select trigger must support touch size",
  );
  assert.match(
    stationsClient,
    /size="touch"/,
    "Stations client action buttons must use size touch",
  );
  assert.match(
    stationsClient,
    /size="icon-touch"/,
    "Stations client edit action must use icon-touch",
  );
  assert.match(
    stationsClient,
    /grid gap-2 sm:grid-cols-2 lg:grid-cols-3/,
    "Stations cards must render in responsive multi-column grid",
  );
  assert.match(
    stationsClient,
    /min-h-12/,
    "Station cards must enforce 48px min-h-12",
  );

  // Terminals client
  assert.match(
    terminalsClient,
    /size=\{embedded \? "touch" : "field"\}/,
    "Terminals client branch select trigger must support touch size",
  );
  assert.match(
    terminalsClient,
    /size="touch"/,
    "Terminals client action buttons must use size touch",
  );
  assert.match(
    terminalsClient,
    /size="icon-touch"/,
    "Terminals client edit action must use icon-touch",
  );
  assert.match(
    terminalsClient,
    /grid gap-2 sm:grid-cols-2 lg:grid-cols-3/,
    "Terminal cards must render in responsive multi-column grid",
  );
  assert.match(
    terminalsClient,
    /min-h-12/,
    "Terminal cards must enforce 48px min-h-12",
  );

  // Printers client
  assert.match(
    printersClient,
    /controlSize=\{controlSize\}/,
    "Printers client form inputs must support touch controlSize",
  );
  assert.match(
    printersClient,
    /size="touch"/,
    "Printers client test and edit buttons must use size touch",
  );
  assert.match(
    printersClient,
    /min-h-12/,
    "Printer cards must enforce 48px min-h-12",
  );
});

test("Domain 5 - Feedback and Feedback QR enforce 48px touch controls, 56px Hero CTAs, and Pattern A tabs", () => {
  const tabs = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/feedback/_components/branch-feedback-tabs.tsx",
  );
  const inboxList = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/feedback/_components/branch-feedback-inbox-list.tsx",
  );
  const qrClient = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/feedback/_components/branch-feedback-qr-client.tsx",
  );

  // Pattern A tabs
  assert.match(
    tabs,
    /<TabsList[\s\S]*?size="touch"[\s\S]*?layout="equal"/,
    "Feedback tabs must use Pattern A touch tabs with equal layout",
  );

  // Inbox list 48px touch and multi-column grid
  assert.match(
    inboxList,
    /grid gap-2 sm:grid-cols-2 lg:grid-cols-2/,
    "Feedback inbox items must display in responsive multi-column grid",
  );
  assert.match(
    inboxList,
    /min-h-12/,
    "Feedback inbox item must enforce 48px min-h-12",
  );
  assert.match(
    inboxList,
    /<Button[^>]*size="touch"/,
    "Feedback pager buttons must use size touch",
  );

  // Feedback QR client
  assert.match(
    qrClient,
    /size="touch"/,
    "Feedback QR create trigger must use size touch",
  );
  assert.match(
    qrClient,
    /size="touch-lg"/,
    "Feedback QR sheet submit must use 56px touch-lg Hero CTA",
  );
  assert.match(
    qrClient,
    /controlSize="touch"/,
    "Feedback QR label input must use touch controlSize",
  );
  assert.match(
    qrClient,
    /triggerSize="icon-touch"/,
    "Feedback QR row actions menu must use icon-touch trigger",
  );
  assert.match(
    qrClient,
    /min-h-12/,
    "Feedback QR items must enforce 48px min-h-12",
  );
});

test("Domain 5 - Má Tư Design System strict rule adherence: zero font-bold, zero raw Card imports, zero forbidden icon sizes", () => {
  const domain5Files = [
    "apps/web/app/(protected)/br/[branchId]/(operator)/settings/audio/audio-form.tsx",
    "apps/web/app/(protected)/br/[branchId]/(operator)/settings/page.tsx",
    "apps/web/app/(protected)/br/[branchId]/(operator)/settings/pos/page.tsx",
    "apps/web/app/(protected)/br/[branchId]/(operator)/settings/printers/page.tsx",
    "apps/web/app/(protected)/br/[branchId]/(operator)/settings/tables/page.tsx",
    "apps/web/app/(protected)/br/[branchId]/(operator)/settings/network/page.tsx",
    "apps/web/app/(protected)/br/[branchId]/(operator)/close-day/close-day-client.tsx",
    "apps/web/app/(protected)/br/[branchId]/(operator)/close-day/page.tsx",
    "apps/web/app/(protected)/br/[branchId]/(operator)/pos-sessions/pos-sessions-client.tsx",
    "apps/web/app/(protected)/br/[branchId]/(operator)/pos-sessions/page.tsx",
    "apps/web/app/(protected)/br/[branchId]/(operator)/feedback/_components/branch-feedback-inbox-list.tsx",
    "apps/web/app/(protected)/br/[branchId]/(operator)/feedback/_components/branch-feedback-qr-client.tsx",
    "apps/web/app/(protected)/br/[branchId]/(operator)/feedback/_components/branch-feedback-tabs.tsx",
    "apps/web/app/(protected)/br/_shared/settings/tables/tables-client.tsx",
    "apps/web/app/(protected)/br/_shared/settings/tables/table-table.tsx",
    "apps/web/app/(protected)/br/_shared/settings/tables/zone-table.tsx",
    "apps/web/app/(protected)/br/_shared/settings/kds/stations-client.tsx",
    "apps/web/app/(protected)/br/_shared/settings/pos/terminals-client.tsx",
    "apps/web/app/(protected)/br/_shared/settings/printers/printers-client.tsx",
  ];

  for (const file of domain5Files) {
    const content = read(file);
    assert.doesNotMatch(
      content,
      /\bfont-bold\b/,
      `${file} must not contain forbidden font-bold class`,
    );
    assert.doesNotMatch(
      content,
      /from "@comtammatu\/ui\/components\/card"/,
      `${file} must not import raw Card component`,
    );
    assert.doesNotMatch(
      content,
      /\bsize-(?:3\.5|7|9|11)\b/,
      `${file} must not use non-canonical icon sizes (3.5, 7, 9, 11)`,
    );
  }
});
