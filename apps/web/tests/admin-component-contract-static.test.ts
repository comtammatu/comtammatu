import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

const DATA_TABLE = "apps/web/app/components/data-table/data-table.tsx";
const SURFACE = "apps/web/app/components/surface.tsx";
const PACKAGE_JSON = "package.json";
const UI_AUDIT = "scripts/audit-ui-components.mjs";
const UI_CONTRACT = "scripts/check-ui-contract.mjs";
const UI_COMPONENT_REGISTRY = "scripts/ui-component-registry.mjs";
const UI_GUARD_REPORTING = "scripts/ui-contract-guard-reporting.mjs";
const UI_CONTRACT_SCOPE = "scripts/ui-contract-scope.mjs";
const PAGE_ARCHETYPES = "scripts/page-archetypes.mjs";
const ROOT_LOADING = "apps/web/app/loading.tsx";
const DESIGN_SYSTEM = "docs/spec/design-system.md";
const UI_MODULE = "docs/modules/ui.md";
const UI_BUTTON = "packages/ui/src/components/button.tsx";
const UI_SELECT = "packages/ui/src/components/select.tsx";
const STATUS_BADGE = "apps/web/app/components/status-badge.tsx";
const SHARED_LABELS = "packages/shared/src/labels/vi.ts";
const BRANCH_TABLE = "apps/web/app/(protected)/branches/branch-table.tsx";
const PRINT_JOBS =
  "apps/web/app/(protected)/admin/settings/printers/jobs/print-jobs-client.tsx";
const STAFF_AUDIT = "apps/web/app/(protected)/hr/staff/audit/page.tsx";
const STAFF_AUDIT_TABLE =
  "apps/web/app/(protected)/hr/staff/audit/permission-audit-table.tsx";
const HR_DATA_TABLE_FILES = [
  "apps/web/app/(protected)/hr/attendance-table.tsx",
  "apps/web/app/(protected)/hr/leave-requests-table.tsx",
  "apps/web/app/(protected)/hr/employee-table.tsx",
  "apps/web/app/(protected)/hr/shifts-table.tsx",
  "apps/web/app/(protected)/hr/payroll/payroll-list-client.tsx",
  "apps/web/app/(protected)/hr/payroll/[periodId]/payroll-detail-client.tsx",
];

function extractConstObjectBody(source: string, name: string): string {
  const anchor = source.indexOf(`const ${name} = {`);
  assert.notEqual(anchor, -1, `${name} object is missing`);
  const start = source.indexOf("{", anchor);
  assert.notEqual(start, -1, `${name} object body is missing`);

  let depth = 0;
  for (let index = start; index < source.length; index += 1) {
    const char = source.charAt(index);
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start + 1, index);
    }
  }

  assert.fail(`${name} object body is not closed`);
}

function extractConstArrayBody(source: string, name: string): string {
  const anchor = source.indexOf(`const ${name} = [`);
  assert.notEqual(anchor, -1, `${name} array is missing`);
  const start = source.indexOf("[", anchor);
  assert.notEqual(start, -1, `${name} array body is missing`);

  let depth = 0;
  let inString: string | null = null;
  for (let index = start; index < source.length; index += 1) {
    const char = source.charAt(index);
    if (inString) {
      if (char === inString && source[index - 1] !== "\\") inString = null;
    } else if (char === '"' || char === "'" || char === "`") {
      inString = char;
    } else if (char === "[") {
      depth += 1;
    } else if (char === "]") {
      depth -= 1;
      if (depth === 0) return source.slice(start + 1, index);
    }
  }

  assert.fail(`${name} array body is not closed`);
}

function extractTopLevelObjectKeys(body: string): string[] {
  return [...body.matchAll(/^\s{2}([A-Za-z][A-Za-z0-9]*):/gm)].map((match) => {
    const key = match[1];
    assert.ok(key, "object key capture is missing");
    return key;
  });
}

function extractGuardIds(body: string): string[] {
  const guardIds = new Set<string>();
  for (const match of body.matchAll(/guardIds:\s*\[([\s\S]*?)\]/g)) {
    for (const guardIdMatch of (match[1] ?? "").matchAll(/"([a-z0-9-]+)"/g)) {
      const guardId = guardIdMatch[1];
      assert.ok(guardId, "guard id capture is missing");
      guardIds.add(guardId);
    }
  }
  return [...guardIds].sort();
}

function extractArrayObjectIds(body: string): string[] {
  return [...body.matchAll(/\bid:\s*"([^"]+)"/g)]
    .map((match) => {
      const id = match[1];
      assert.ok(id, "array object id capture is missing");
      return id;
    })
    .sort();
}

function extractObjectPropertyBody(source: string, name: string): string {
  const anchor = source.indexOf(`${name}: {`);
  assert.notEqual(anchor, -1, `${name} object is missing`);
  const start = source.indexOf("{", anchor);
  assert.notEqual(start, -1, `${name} object body is missing`);

  let depth = 0;
  for (let index = start; index < source.length; index += 1) {
    const char = source.charAt(index);
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start + 1, index);
    }
  }

  assert.fail(`${name} object body is not closed`);
}

function extractStringNumberObject(body: string): Array<[string, number]> {
  return [...body.matchAll(/"([^"]+)":\s*(\d+)/g)]
    .map((match): [string, number] => {
      const key = match[1];
      assert.ok(key, "string-number object key capture is missing");
      return [key, Number(match[2])];
    })
    .sort(([left], [right]) => left.localeCompare(right));
}

function extractGuardAllowlist(source: string, guardId: string) {
  const idAnchor = source.indexOf(`id: "${guardId}"`);
  assert.notEqual(idAnchor, -1, `${guardId} guard is missing`);
  const keyAnchor = source.indexOf("allowlist:", idAnchor);
  assert.notEqual(keyAnchor, -1, `${guardId} allowlist is missing`);
  const start = source.indexOf("{", keyAnchor);
  assert.notEqual(start, -1, `${guardId} allowlist body is missing`);

  let depth = 0;
  for (let index = start; index < source.length; index += 1) {
    const char = source.charAt(index);
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return extractStringNumberObject(source.slice(start + 1, index));
      }
    }
  }

  assert.fail(`${guardId} allowlist body is not closed`);
}

function hasUiContractGuard(source: string, guardId: string): boolean {
  return source.includes(`id: "${guardId}"`) || source.includes(`${guardId}:`);
}

test("DataTable renders the toolbar contract it exposes", () => {
  const dataTable = read(DATA_TABLE);
  const surface = read(SURFACE);

  assert.match(dataTable, /import \{ Input \}/);
  assert.match(dataTable, /SelectTrigger/);
  assert.match(dataTable, /<AppToolbar[\s\S]*variant="inline"/);
  assert.match(dataTable, /searchable === true/);
  assert.match(dataTable, /filters\.map/);
  assert.match(dataTable, /actions=\{actions\}/);
  assert.match(dataTable, /mobileCardRender\(row, index \+ pageOffset\)/);
  assert.match(surface, /variant\?: "card" \| "inline"/);
});

test("Batch 1 admin screens use DataTable instead of raw table/card layout", () => {
  for (const file of [BRANCH_TABLE, PRINT_JOBS, STAFF_AUDIT_TABLE]) {
    const source = read(file);
    assert.match(source, /@\/components\/data-table\/data-table/);
    assert.doesNotMatch(source, /@comtammatu\/ui\/components\/table/);
  }

  assert.doesNotMatch(read(STAFF_AUDIT), /@comtammatu\/ui\/components\/card/);
  assert.doesNotMatch(read(STAFF_AUDIT), /@comtammatu\/ui\/components\/table/);
  assert.match(read(STAFF_AUDIT), /PermissionAuditTable/);
});

test("Print job monitor keeps owner recovery filter through DataTable filters", () => {
  const source = read(PRINT_JOBS);

  assert.match(source, /PRINT_JOB_ATTENTION_STATUS = "needs_attention"/);
  assert.match(source, /filters=\{filters\}/);
  assert.match(source, /filterValues=\{\{/);
  assert.match(source, /onFilterChange=\{\(key, value\) =>/);
  assert.match(source, /retryJobFromMonitor/);
});

test("UI contract guard freezes Admin Finance Branch component drift", () => {
  const source = read(UI_CONTRACT);
  const designSystem = read(DESIGN_SYSTEM);
  const uiModule = read(UI_MODULE);
  const buttonPrimitive = read(UI_BUTTON);
  const selectPrimitive = read(UI_SELECT);

  for (const id of [
    "admin-finance-branch-raw-table-import",
    "admin-finance-branch-raw-card-import",
    "admin-finance-branch-toolbar-fixed-control",
    "operator-office-route-boundary",
    "focus-ring-contrast",
    "radius-scale",
    "radius-tier-baseline",
    "gap-scale",
    "primitive-radius-scale",
    "primitive-transition-all",
    "app-transition-all",
    "app-loading-spinner-ssot",
    "surface-clone-ssot",
    "root-viewport-allows-zoom",
    "app-presentation-state-copy",
    "app-action-data-state-copy",
    "finance-page-local-formatter",
    "app-page-local-number-formatter",
    "vnd-format-ssot",
    "date-format-ssot",
    "status-label-ssot",
    "stat-card-ssot",
    "no-native-dialog",
    "responsive-double-render",
    "use-is-mobile-budget",
    "shell-registry-bespoke-main",
    "nav-shell-inline-literal",
    "operator-office-shell-boundary",
    "heading-scale",
    "icon-size",
    "uppercase-label-scale",
    "app-arbitrary-sizing",
    "tint-opacity",
    "raw-card-import-file-baseline",
    "raw-table-import-file-baseline",
    "raw-dialog-import-file-baseline",
    "raw-alert-dialog-import-file-baseline",
    "primitive-runtime-arbitrary-px-rem-sizing",
    "primitive-arbitrary-shadow",
    "primitive-shadow-overrun",
    "card-content-named-layout-props",
    "card-content-classname-baseline",
    "card-title-classname-baseline",
    "app-section-content-named-layout-props",
    "scrollarea-no-max-height-only",
    "status-chip-wrapper-baseline",
    "pos-kds-touch-reveal-baseline",
    "space-y-baseline",
    "raw-padding-baseline",
    "gap-atypical-baseline",
    "inline-chrome-baseline",
    "hand-rolled-page-heading-baseline",
    "hover-shadow-rung",
    "app-effect-shadow-rung",
    "resting-shadow-rung",
    "resting-shadow-baseline",
    "custom-shadow-baseline",
    "motion-color-duration",
  ]) {
    assert.match(source, new RegExp(`id: "${id}"`));
  }
  assert.doesNotMatch(source, /app-action-data-state-copy-baseline/);

  for (const marker of [
    "extractJsxOpeningTagSpans",
    "countNativeInteractiveElement",
    "countIconButtonAriaRisk",
    "NATIVE_INTERACTIVE_EXCEPTIONS",
    "native-interactive-element",
    "icon-button-accessible-name",
    "route-boundary-adapters",
    "route-boundary-coverage",
    "raw-empty-import-route-code",
    "page-padding:",
    "button-height-on-button",
    "BUTTON_HEIGHT_BASELINE",
    "operator-embedded-button-density",
    "operator-embedded-page-header-boundary",
    'endsWith("/loading.tsx")',
    'endsWith("/error.tsx")',
    "href=[\"']#",
    "frozenPrimitiveImportBaselines",
    "formatterGuardBaselines",
    'component: "card"',
    'component: "table"',
    'component: "dialog"',
    'component: "alert-dialog"',
    "raw-table-element",
    "<table\\b",
    "SURFACE_CLONE_ADAPTER_IMPLEMENTATIONS",
    "SURFACE_CLONE_EXCEPTIONS",
    "countLocalSurfaceClone",
    "LOCAL_SURFACE_CLONE_RE",
    "validateAuditSignalGuardCoverage",
    "audit-to-guard-map",
    "SIGNAL_GUARD_COVERAGE",
    "extractTopLevelObjectEntries",
    "extractConstArrayBody",
    "extractArrayObjectIds",
    "extractObjectPropertyBody",
    "extractGuardAllowlist",
    "guardGroup",
    "exceptionAllowlistGuard",
    "exceptionAllowlistGroup",
    "exceptionAllowlist",
    "blocking-exception",
  ]) {
    assert.match(
      source,
      new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    );
  }

  const embeddedDensityFiles = extractConstArrayBody(
    source,
    "OPERATOR_EMBEDDED_BUTTON_DENSITY_FILES",
  );
  const embeddedHeaderFiles = extractConstArrayBody(
    source,
    "OPERATOR_EMBEDDED_PAGE_HEADER_FILES",
  );
  for (const registry of [embeddedDensityFiles, embeddedHeaderFiles]) {
    assert.doesNotMatch(
      registry,
      /apps\/web\/app\/\(protected\)\/inventory\/stock\/stock-client\.tsx/,
      "Office-only stock client must not be classified as an embedded operator adapter",
    );
  }

  assert.match(designSystem, /High-level primitive import governance/);
  assert.match(
    designSystem,
    /shadcn-ui and Web Interface Guidelines are advisory checklists only/,
  );
  assert.match(
    designSystem,
    /scripts\/check-ui-contract\.mjs/,
  );
  assert.match(designSystem, /scripts\/ui-component-registry\.mjs/);
  assert.match(uiModule, /scripts\/check-ui-contract\.mjs/);
  assert.match(uiModule, /scripts\/ui-component-registry\.mjs/);
  assert.match(uiModule, /corepack pnpm audit:ui-components/);
  assert.doesNotMatch(uiModule, /## Component Audit/);
  assert.doesNotMatch(uiModule, /## Shared Component Registry/);
  assert.match(buttonPrimitive, /field:\s*"h-10/);
  assert.match(selectPrimitive, /"field" \| "touch"/);
  assert.match(selectPrimitive, /data-\[size=field\]:h-10/);
  assert.match(buttonPrimitive, /field:\s*"h-10/);
  assert.match(selectPrimitive, /"field" \| "touch"/);
  assert.match(selectPrimitive, /data-\[size=field\]:h-10/);

  assert.doesNotMatch(
    source,
    new RegExp(BRANCH_TABLE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
  );
  assert.doesNotMatch(
    source,
    new RegExp(PRINT_JOBS.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
  );
  assert.doesNotMatch(
    source,
    new RegExp(STAFF_AUDIT.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
  );
});

test("UI component audit command stays wired for route-family drill-down", () => {
  const packageJson = JSON.parse(read(PACKAGE_JSON)) as {
    scripts?: Record<string, string>;
  };
  const auditScript = read(UI_AUDIT);
  const uiContract = read(UI_CONTRACT);
  const componentRegistry = read(UI_COMPONENT_REGISTRY);
  const designSystem = read(DESIGN_SYSTEM);
  const uiModule = read(UI_MODULE);

  assert.equal(
    packageJson.scripts?.["audit:ui-components"],
    "node scripts/audit-ui-components.mjs",
  );

  for (const marker of [
    "ROUTE_FAMILIES",
    "PRIMITIVES",
    "ADAPTERS",
    "ADAPTER_IMPLEMENTATIONS",
    "STATUS_MAP_IMPLEMENTATIONS",
    "RESPONSIVE_ADAPTER_IMPLEMENTATIONS",
    "APP_ADAPTER_REGISTRY",
    "validateUiComponentRegistry",
    "Component Selection Coverage",
    "Page Archetype Coverage",
    "parseOptions",
    "transitionAll",
    "nativeInteractiveElement",
    "iconButtonAriaRisk",
    "actionHeightDrift",
    "localSurfaceClone",
    "loadingSpinnerDrift",
    "LOADING_SPINNER_DRIFT_RE",
    "ACTION_HEIGHT_TOKEN_RE",
    "LOCAL_SURFACE_CLONE_RE",
    "LOCAL_SECTION_CLONE_RE",
    "LOCAL_TOOLBAR_CLONE_RE",
    "LOCAL_TABLE_CLONE_RE",
    "LOCAL_DIALOG_CLONE_RE",
    "extractJsxOpeningTags",
    "countNativeInteractiveElement",
    "hasDirectAsChildPrimitiveParent",
    "countIconButtonAriaRisk",
    "countActionHeightDrift",
    "countLocalDefinition",
    "countLocalSurfaceClone",
    "skipDynamic",
    "TouchButton",
    "action height",
    "surface clone",
    "pageLocalFormatter",
    "routeLocalStateCopy",
    "actionDataStateCopy",
    "ROUTE_LOCAL_STATE_COPY_RE",
    "PAGE_LOCAL_FORMATTER_RE",
    "isActionDataSourceFile",
    "USE_IS_MOBILE_RE",
    "STATUS_MAP_RE",
    "countUseIsMobile",
    "countStatusMap",
    "isUiSourceFile",
    "rawPrimitiveImportBaseline",
    "FROZEN_PRIMITIVE_IMPORTS",
    "countFrozenPrimitiveImport",
    "SIGNAL_GUARD_COVERAGE",
    "SIGNAL_GUARD_STATUSES",
    "validateSignalGuardCoverage",
    "guardIdExists",
    "Signal Guard Coverage",
    "blocking-exception",
    "--family",
    "--all",
  ]) {
    assert.match(auditScript, new RegExp(marker));
  }
  assert.match(auditScript, /ADAPTER_IMPLEMENTATIONS\.has\(file\.file\)/);
  assert.match(
    auditScript,
    /!file\.includes\("\/\(protected\)\/br\/\[branchId\]\/pos\/"\)/,
  );
  assert.match(
    auditScript,
    /!file\.includes\("\/\(protected\)\/br\/\[branchId\]\/kds\/"\)/,
  );
  assert.match(
    auditScript,
    /!file\.includes\("\/\(protected\)\/br\/\[branchId\]\/runner\/"\)/,
  );
  assert.match(
    componentRegistry,
    /apps\/web\/app\/components\/data-table\/data-table\.tsx/,
  );
  assert.match(
    componentRegistry,
    /apps\/web\/app\/components\/app-header\.tsx/,
  );
  assert.match(
    componentRegistry,
    /apps\/web\/app\/components\/page-skeleton\.tsx/,
  );
  assert.match(
    componentRegistry,
    /apps\/web\/app\/_components\/boneyard-skeleton\.tsx/,
  );
  assert.match(auditScript, /const STATUS_MAP_RE =/);
  assert.doesNotMatch(auditScript, /statusMap:[\s\S]*\[\{\[\]/);
  assert.match(auditScript, /signal\(source, file\)/);
  assert.match(auditScript, /ROUTE_LOCAL_STATE_COPY_RE =[\s\S]*\[\^\\n/);
  assert.match(auditScript, /STATUS_MAP_IMPLEMENTATIONS\.has\(file\)/);
  assert.match(auditScript, /RESPONSIVE_ADAPTER_IMPLEMENTATIONS\.has\(file\)/);
  assert.match(auditScript, /RESPONSIVE_COMPOSITION_EXCEPTIONS\.has\(file\)/);
  assert.match(auditScript, /NATIVE_INTERACTIVE_EXCEPTIONS\.has\(file\)/);
  assert.match(auditScript, /LOCAL_SURFACE_CLONE_EXCEPTIONS\.has\(file\)/);
  assert.match(auditScript, /href=\["'\]#/);
  assert.match(auditScript, /sr-only/);
  assert.match(auditScript, /aria-labelledby/);
  assert.match(auditScript, /target=\["'\]_blank/);
  assert.match(auditScript, /useIsMobile: countUseIsMobile/);
  assert.match(
    auditScript,
    /rawPrimitiveImportBaseline: countFrozenPrimitiveImport/,
  );
  assert.match(
    auditScript,
    /rawPrimitiveImportBaseline: \{\s*status: "blocking-exception"[\s\S]*guardGroup: "frozenPrimitiveImportBaselines"[\s\S]*raw-card-import-file-baseline[\s\S]*raw-alert-dialog-import-file-baseline[\s\S]*exceptionAllowlistGroup: "frozenPrimitiveImportBaselines"/,
  );
  assert.match(auditScript, /pageLocalFormatter: PAGE_LOCAL_FORMATTER_RE/);
  assert.match(
    auditScript,
    /pageLocalFormatter: \{\s*status: "blocking-zero"[\s\S]*guardGroup: "formatterGuardBaselines"[\s\S]*finance-page-local-formatter[\s\S]*app-page-local-number-formatter[\s\S]*vnd-format-ssot[\s\S]*date-format-ssot/,
  );
  assert.match(
    auditScript,
    /rawTableElement: \{\s*status: "blocking-zero"[\s\S]*guardIds: \["raw-table-element"\]/,
  );
  assert.match(
    auditScript,
    /transitionAll: \{\s*status: "blocking-zero"[\s\S]*guardIds: \["app-transition-all"\]/,
  );
  assert.match(
    auditScript,
    /useIsMobile: \{\s*status: "blocking-exception"[\s\S]*guardIds: \["use-is-mobile-budget"\][\s\S]*reason:/,
  );
  assert.match(
    auditScript,
    /statusMap: \{\s*status: "blocking-exception"[\s\S]*guardIds: \["status-label-ssot"\][\s\S]*reason:/,
  );
  assert.match(
    auditScript,
    /statCardDef: \{\s*status: "blocking-exception"[\s\S]*guardIds: \["stat-card-ssot"\][\s\S]*reason:/,
  );
  assert.match(auditScript, /exceptionAllowlistGuard: "use-is-mobile-budget"/);
  assert.match(
    auditScript,
    /exceptionAllowlistGroup: "frozenPrimitiveImportBaselines"/,
  );
  assert.match(auditScript, /exceptionAllowlistGuard: "status-label-ssot"/);
  assert.match(auditScript, /exceptionAllowlistGuard: "stat-card-ssot"/);
  assert.match(
    auditScript,
    /actionDataStateCopy: \{\s*status: "blocking-zero"[\s\S]*guardIds: \["app-action-data-state-copy"\]/,
  );

  const signalsBody = extractConstObjectBody(auditScript, "SIGNALS");
  const guardCoverageBody = extractConstObjectBody(
    auditScript,
    "SIGNAL_GUARD_COVERAGE",
  );
  assert.deepEqual(
    extractTopLevelObjectKeys(guardCoverageBody).sort(),
    extractTopLevelObjectKeys(signalsBody).sort(),
  );
  for (const guardId of extractGuardIds(guardCoverageBody)) {
    assert.ok(
      hasUiContractGuard(uiContract, guardId),
      `audit signal points at missing UI contract guard ${guardId}`,
    );
  }

  assert.deepEqual(
    extractGuardIds(
      extractObjectPropertyBody(
        guardCoverageBody,
        "rawPrimitiveImportBaseline",
      ),
    ),
    extractArrayObjectIds(
      extractConstArrayBody(uiContract, "frozenPrimitiveImportBaselines"),
    ),
    "rawPrimitiveImportBaseline guardIds must match frozenPrimitiveImportBaselines",
  );
  assert.deepEqual(
    extractGuardIds(
      extractObjectPropertyBody(guardCoverageBody, "pageLocalFormatter"),
    ),
    extractArrayObjectIds(
      extractConstArrayBody(uiContract, "formatterGuardBaselines"),
    ),
    "pageLocalFormatter guardIds must match formatterGuardBaselines",
  );

  const rawPrimitiveEntry = extractObjectPropertyBody(
    guardCoverageBody,
    "rawPrimitiveImportBaseline",
  );
  const rawPrimitiveAuditAllowlist = new Map(
    extractStringNumberObject(
      extractObjectPropertyBody(rawPrimitiveEntry, "exceptionAllowlist"),
    ),
  );
  const rawPrimitiveGuardAllowlist = new Map<string, number>();
  for (const guardId of extractGuardIds(rawPrimitiveEntry)) {
    for (const [file, count] of extractGuardAllowlist(uiContract, guardId)) {
      rawPrimitiveGuardAllowlist.set(
        file,
        (rawPrimitiveGuardAllowlist.get(file) ?? 0) + count,
      );
    }
  }
  assert.deepEqual(
    [...rawPrimitiveAuditAllowlist].sort(([left], [right]) =>
      left.localeCompare(right),
    ),
    [...rawPrimitiveGuardAllowlist].sort(([left], [right]) =>
      left.localeCompare(right),
    ),
    "raw primitive exception allowlist must match the union of its guard group",
  );

  for (const [signal, guardId] of [
    ["useIsMobile", "use-is-mobile-budget"],
    ["statusMap", "status-label-ssot"],
    ["statCardDef", "stat-card-ssot"],
  ] as const) {
    const entryBody = extractObjectPropertyBody(guardCoverageBody, signal);
    const auditAllowlist = extractStringNumberObject(
      extractObjectPropertyBody(entryBody, "exceptionAllowlist"),
    );
    assert.deepEqual(
      auditAllowlist,
      extractGuardAllowlist(uiContract, guardId),
      `${signal} exception allowlist must match ${guardId}`,
    );
  }

  assert.match(uiModule, /corepack pnpm audit:ui-components/);
  assert.match(uiModule, /scripts\/ui-contract-guard-reporting\.mjs/);
  assert.match(uiModule, /scripts\/ui-contract-scope\.mjs/);
  assert.match(designSystem, /scripts\/ui-contract-guard-reporting\.mjs/);
  assert.match(designSystem, /scripts\/ui-contract-scope\.mjs/);
});

test("Every route page family stays inside the archetype and boundary contract", async () => {
  const auditScript = read(UI_AUDIT);
  const uiContract = read(UI_CONTRACT);
  const archetypeSource = read(PAGE_ARCHETYPES);
  const archetypeModule = (await import(
    pathToFileURL(resolve(repoRoot, PAGE_ARCHETYPES)).href
  )) as {
    PAGE_ARCHETYPES: Record<string, string>;
  };

  assert.equal(
    archetypeModule.PAGE_ARCHETYPES["apps/web/app/offline/page.tsx"],
    "GATE/AUTH",
  );
  assert.equal(
    archetypeModule.PAGE_ARCHETYPES["apps/web/app/q/[token]/page.tsx"],
    "PUBLIC-WORKFLOW",
  );
  assert.match(archetypeSource, /PUBLIC-WORKFLOW/);
  assert.match(uiContract, /walkFiles\("apps\/web\/app", \["\.tsx"\]\)/);
  assert.match(uiContract, /findNearestRouteBoundary/);
  assert.match(uiContract, /route-boundary-coverage/);
  assert.match(auditScript, /missingPageArchetypes/);
  assert.match(auditScript, /stalePageArchetypes/);
  assert.match(read(ROOT_LOADING), /<PageSpinner fullScreen \/>/);
});

test("UI contract guard reporting stays reverse-complete", async () => {
  const auditScript = read(UI_AUDIT);
  const uiContract = read(UI_CONTRACT);
  const reportingSource = read(UI_GUARD_REPORTING);
  const reportingModule = (await import(
    pathToFileURL(resolve(repoRoot, UI_GUARD_REPORTING)).href
  )) as {
    buildUiContractGuardReporting: (
      contractSource: string,
      auditSource: string,
    ) => {
      errors: string[];
      unclassified: string[];
      total: number;
      auditVisibleGuardIds: string[];
      lintOnlyGuardIds: string[];
    };
  };

  for (const marker of [
    "UI_CONTRACT_LINT_ONLY_GROUPS",
    "extractUiContractGuardIds",
    "extractAuditVisibleGuardIds",
    "buildUiContractGuardReporting",
    "unclassified guard ids",
    "ratchet-maintenance",
  ]) {
    assert.match(reportingSource, new RegExp(marker));
  }
  assert.match(uiContract, /buildUiContractGuardReporting/);
  assert.match(uiContract, /guard-reporting-closure/);
  assert.match(auditScript, /## Guard Reporting Closure/);

  const report = reportingModule.buildUiContractGuardReporting(
    uiContract,
    auditScript,
  );
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.unclassified, []);
  assert.equal(
    report.total,
    report.auditVisibleGuardIds.length + report.lintOnlyGuardIds.length,
  );

  const fixtureReport = reportingModule.buildUiContractGuardReporting(
    `${uiContract}\nconst fixtureGuards = [{ id: "fixture-unclassified-guard" }];`,
    auditScript,
  );
  assert.deepEqual(fixtureReport.unclassified, ["fixture-unclassified-guard"]);
  assert.match(fixtureReport.errors.join("\n"), /unclassified guard ids/);
});

test("UI baseline reporting separates debt from permanent exceptions", async () => {
  const auditScript = read(UI_AUDIT);
  const uiContract = read(UI_CONTRACT);
  const scopeSource = read(UI_CONTRACT_SCOPE);
  const reportingModule = (await import(
    pathToFileURL(resolve(repoRoot, UI_GUARD_REPORTING)).href
  )) as {
    UI_CONTRACT_BASELINE_POLICIES: Record<string, unknown>;
    buildUiContractBaselineReporting: (
      definitions: Array<{
        id: string;
        actualByFile: Record<string, number>;
        allowed: number;
      }>,
    ) => {
      errors: string[];
      rows: Array<{
        actual: number;
        allowed: number;
        delta: number;
        debt: number;
        permanent: number;
      }>;
    };
  };
  const scopeModule = (await import(
    pathToFileURL(resolve(repoRoot, UI_CONTRACT_SCOPE)).href
  )) as {
    UI_RUNTIME_SOURCE_ROOTS: readonly string[];
  };

  assert.deepEqual(
    [...scopeModule.UI_RUNTIME_SOURCE_ROOTS],
    [
      "apps/web/app",
      "apps/web/lib/branch-operator",
      "apps/web/lib/staff-runtime",
    ],
  );
  assert.match(scopeSource, /uiRuntimeRoots/);
  assert.match(uiContract, /UI_RUNTIME_SOURCE_ROOTS/);
  assert.match(auditScript, /UI_RUNTIME_SOURCE_ROOTS/);
  assert.match(uiContract, /baseline-reporting-closure/);
  assert.match(auditScript, /## Baseline Ratchet Truth/);

  const policyIds = Object.keys(reportingModule.UI_CONTRACT_BASELINE_POLICIES);
  const zeroDefinitions = policyIds.map((id) => ({
    id,
    actualByFile: {},
    allowed: 0,
  }));
  assert.deepEqual(
    reportingModule.buildUiContractBaselineReporting(zeroDefinitions).errors,
    [],
  );
  assert.match(
    reportingModule
      .buildUiContractBaselineReporting(zeroDefinitions.slice(1))
      .errors.join("\n"),
    /baseline ids missing live definition/,
  );

  const liveResult = spawnSync(
    process.execPath,
    [resolve(repoRoot, UI_CONTRACT), "--report-baselines=json"],
    { cwd: repoRoot, encoding: "utf8" },
  );
  assert.equal(liveResult.status, 0, liveResult.stderr || liveResult.stdout);
  const liveReport = JSON.parse(liveResult.stdout) as {
    errors: string[];
    totals: {
      actual: number;
      allowed: number;
      delta: number;
      debt: number;
      permanent: number;
    };
  };
  assert.deepEqual(liveReport.errors, []);
  assert.equal(liveReport.totals.actual, liveReport.totals.allowed);
  assert.equal(liveReport.totals.delta, 0);
  assert.equal(
    liveReport.totals.actual,
    liveReport.totals.debt + liveReport.totals.permanent,
  );
  assert.ok(liveReport.totals.debt > 0);
  assert.ok(liveReport.totals.permanent > 0);
});

test("UI component registry classifies every primitive and approved adapter", async () => {
  const auditScript = read(UI_AUDIT);
  const uiContract = read(UI_CONTRACT);
  const registrySource = read(UI_COMPONENT_REGISTRY);
  const registryModule = (await import(
    pathToFileURL(resolve(repoRoot, UI_COMPONENT_REGISTRY)).href
  )) as {
    buildPrimitiveComponentCoverage: (actualFiles: string[]) => {
      actual: string[];
      registered: string[];
      unclassified: string[];
      stale: string[];
      errors: string[];
      total: number;
    };
    validateUiComponentRegistry: (root: string) => {
      primitiveCoverage: {
        actual: string[];
        registered: string[];
        unclassified: string[];
        stale: string[];
        errors: string[];
        total: number;
      };
      auditAdapterNames: string[];
      appAdapterCount: number;
      domainFamilyCount: number;
      domainExportCount: number;
      errors: string[];
    };
  };

  for (const marker of [
    "PRIMITIVE_COMPONENT_REGISTRY",
    "APP_ADAPTER_REGISTRY",
    "DOMAIN_ADAPTER_FAMILIES",
    "adapter-only",
    "workflow-only",
    "unclassified primitive files",
    "BranchOperatorPage",
    "EmployeePage",
  ]) {
    assert.match(registrySource, new RegExp(marker));
  }
  assert.match(uiContract, /component-selection-coverage/);
  assert.match(auditScript, /Component Selection Coverage/);
  assert.match(auditScript, /APP_ADAPTER_REGISTRY/);

  const report = registryModule.validateUiComponentRegistry(repoRoot);
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.primitiveCoverage.unclassified, []);
  assert.deepEqual(report.primitiveCoverage.stale, []);
  assert.deepEqual(
    report.primitiveCoverage.actual,
    report.primitiveCoverage.registered,
  );
  assert.ok(report.appAdapterCount > 0);
  assert.equal(report.domainFamilyCount, 2);
  assert.ok(report.domainExportCount > 0);
  for (const adapter of [
    "AppPage",
    "DataTable",
    "FormDialog",
    "ReasonConfirmDialog",
    "PwaInstallHelpDialog",
    "StatusBadge",
    "PageSkeleton",
    "ErrorPanel",
  ]) {
    assert.ok(report.auditAdapterNames.includes(adapter));
  }

  const fixtureReport = registryModule.buildPrimitiveComponentCoverage([
    ...report.primitiveCoverage.actual,
    "fixture-agent-invented.tsx",
  ]);
  assert.deepEqual(fixtureReport.unclassified, ["fixture-agent-invented.tsx"]);
  assert.match(fixtureReport.errors.join("\n"), /unclassified primitive files/);
});

test("HR list surfaces use DataTable and shared status badge domains", () => {
  for (const file of HR_DATA_TABLE_FILES) {
    const source = read(file);
    assert.match(source, /@\/components\/data-table\/data-table/);
    assert.doesNotMatch(source, /@comtammatu\/ui\/components\/table/);
  }

  for (const file of [
    "apps/web/app/(protected)/hr/attendance-table.tsx",
    "apps/web/app/(protected)/hr/leave-requests-table.tsx",
    "apps/web/app/(protected)/hr/payroll/payroll-list-client.tsx",
  ]) {
    const source = read(file);
    assert.match(source, /@\/components\/status-badge/);
    assert.doesNotMatch(source, /\bconst\s+[A-Z0-9_]*STATUS[A-Z0-9_]*/);
  }

  const statusBadge = read(STATUS_BADGE);
  const sharedLabels = read(SHARED_LABELS);
  for (const marker of [
    "ATTENDANCE_STATUS_LABELS_VI",
    "LEAVE_REQUEST_STATUS_LABELS_VI",
    "PAYROLL_PERIOD_STATUS_LABELS_VI",
    "attendance",
    "leave-request",
    "payroll-period",
  ]) {
    assert.match(statusBadge + sharedLabels, new RegExp(marker));
  }
});
