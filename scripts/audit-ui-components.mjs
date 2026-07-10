import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import {
  APP_ADAPTER_REGISTRY,
  DOMAIN_ADAPTER_FAMILIES,
  validateUiComponentRegistry,
} from "./ui-component-registry.mjs";
import { buildUiContractGuardReporting } from "./ui-contract-guard-reporting.mjs";
import { UI_RUNTIME_SOURCE_ROOTS } from "./ui-contract-scope.mjs";
import { PAGE_ARCHETYPES } from "./page-archetypes.mjs";

const REPO_ROOT = process.cwd();
const DEFAULT_LIMIT = 60;
const ROUTE_FAMILIES = [
  ["admin", (file) => file.includes("/(protected)/admin/")],
  [
    "branch-settings-shared",
    (file) => file.includes("/(protected)/branch-settings/"),
  ],
  ["branches", (file) => file.includes("/(protected)/branches/")],
  ["notifications", (file) => file.includes("/(protected)/notifications/")],
  [
    "branch-entry",
    (file) =>
      file.includes("/(protected)/br/") &&
      !file.includes("/(protected)/br/[branchId]/"),
  ],
  [
    "branch",
    (file) =>
      file.includes("/(protected)/br/[branchId]/") &&
      !file.includes("/(protected)/br/[branchId]/pos/") &&
      !file.includes("/(protected)/br/[branchId]/kds/") &&
      !file.includes("/(protected)/br/[branchId]/runner/"),
  ],
  ["pos", (file) => file.includes("/(protected)/br/[branchId]/pos/")],
  ["kds", (file) => file.includes("/(protected)/br/[branchId]/kds/")],
  ["runner", (file) => file.includes("/(protected)/br/[branchId]/runner/")],
  ["employee-runtime", (file) => file.includes("/lib/staff-runtime/")],
  ["branch-adapters", (file) => file.includes("/lib/branch-operator/")],
  ["finance", (file) => file.includes("/(protected)/finance/")],
  ["hr", (file) => file.includes("/(protected)/hr/")],
  ["inventory", (file) => file.includes("/(protected)/inventory/")],
  ["menu", (file) => file.includes("/(protected)/menu/")],
  ["orders", (file) => file.includes("/(protected)/orders/")],
  ["public", (file) => file.includes("/(public)/")],
  ["self-order", (file) => file.includes("/app/q/")],
  [
    "public-system",
    (file) =>
      file === "apps/web/app/page.tsx" ||
      file.includes("/app/offline/") ||
      file === "apps/web/app/error.tsx" ||
      file === "apps/web/app/global-error.tsx" ||
      file === "apps/web/app/loading.tsx" ||
      file === "apps/web/app/not-found.tsx",
  ],
  ["shared-components", (file) => file.includes("/app/components/")],
  [
    "shared-app",
    (file) =>
      file.includes("/app/_components/") ||
      file.includes("/app/_hooks/") ||
      file.includes("/app/_lib/") ||
      file.includes("/app/api/") ||
      file.includes("/app/lib/") ||
      file.startsWith("apps/web/app/"),
  ],
  ["unclassified", () => true],
];

const PRIMITIVES = [
  "card",
  "table",
  "dialog",
  "alert-dialog",
  "empty",
  "button",
  "badge",
  "tabs",
  "select",
  "input",
  "sheet",
  "drawer",
  "field",
  "item",
  "spinner",
  "skeleton",
  "progress",
  "separator",
  "dropdown-menu",
  "popover",
  "tooltip",
];

const FROZEN_PRIMITIVE_IMPORTS = ["card", "table", "dialog", "alert-dialog"];

const ADAPTERS = Object.entries(APP_ADAPTER_REGISTRY)
  .filter(([, entry]) => entry.audit)
  .map(([name]) => name);

const ADAPTER_IMPLEMENTATIONS = new Set([
  ...Object.values(APP_ADAPTER_REGISTRY).map((entry) => entry.source),
  ...Object.values(DOMAIN_ADAPTER_FAMILIES).map((entry) => entry.source),
]);

const STATUS_MAP_IMPLEMENTATIONS = new Set([
  "apps/web/app/components/status-badge.tsx",
]);

const RESPONSIVE_ADAPTER_IMPLEMENTATIONS = new Set([
  "apps/web/app/components/data-table/data-table.tsx",
]);

const RESPONSIVE_COMPOSITION_EXCEPTIONS = new Set([
  "apps/web/app/(protected)/br/[branchId]/pos/_components/archived-orders-sheet.tsx",
  "apps/web/app/(protected)/br/[branchId]/pos/pos-desktop-inner.tsx",
  "apps/web/app/_components/responsive-toaster.tsx",
]);

const NATIVE_INTERACTIVE_EXCEPTIONS = new Set([
  "apps/web/app/global-error.tsx",
]);

const LOCAL_SURFACE_CLONE_EXCEPTIONS = new Set([
  "apps/web/app/(protected)/br/[branchId]/pos/pos-page-skeleton.tsx",
]);

const ROUTE_LOCAL_STATE_COPY_RE =
  /["'`](?:[^\n"'`]*(?:Đang tải|Không có dữ liệu|Chưa có dữ liệu|Không thể tải|No data|Loading|Error loading)[^\n"'`]*)["'`]/g;
const LOADING_SPINNER_DRIFT_RE =
  /\b(?:Loader2|LoaderCircle|IconLoader2|animate-spin)\b/g;
const ACTION_HEIGHT_TOKEN_RE =
  /\b(?:h-(?:10|11|12|14|16|20|24|28|32|36|40|44)|min-h-(?:12|14|16|20|24))\b/;
const LOCAL_SURFACE_CLONE_RE =
  /\b(?:export\s+)?(?:function|const)\s+[A-Z][A-Za-z0-9]*(?:PageHeader|Header|EmptyState|LoadingState|Skeleton|StatCard|SummaryCard|MetricCard|KpiCard|StatusBadge)\b/g;
const LOCAL_SECTION_CLONE_RE =
  /\b(?:export\s+)?(?:function|const)\s+[A-Z][A-Za-z0-9]*Section\b/g;
const LOCAL_TOOLBAR_CLONE_RE =
  /\b(?:export\s+)?(?:function|const)\s+[A-Z][A-Za-z0-9]*Toolbar\b/g;
const LOCAL_TABLE_CLONE_RE =
  /\b(?:export\s+)?(?:function|const)\s+[A-Z][A-Za-z0-9]*Table\b/g;
const LOCAL_DIALOG_CLONE_RE =
  /\b(?:export\s+)?(?:function|const)\s+[A-Z][A-Za-z0-9]*Dialog\b/g;

const USE_IS_MOBILE_RE = /\buseIsMobile\s*\(/g;
const STATUS_MAP_RE =
  /\bconst\s+(?![A-Z0-9_]*STATUS[A-Z0-9_]*(?:RANK|PRIORITY)[A-Z0-9_]*\b)[A-Z0-9_]*STATUS[A-Z0-9_]*(?:\s*:[^=]*?)?\s*=\s*\{/g;
const PAGE_LOCAL_FORMATTER_RE =
  /\b(?:new\s+Intl\.(?:NumberFormat|DateTimeFormat)|Intl\.(?:NumberFormat|DateTimeFormat)|\.toLocaleString\(|\.toLocaleDateString\(|\.toLocaleTimeString\()|\b(?:function|const)\s+format(?:VND|Percent)\b|\.toFixed\(\s*\d+\s*\)\s*\}\s*%/g;

function isUiSourceFile(file) {
  return file.endsWith(".tsx");
}

function isActionDataSourceFile(file) {
  return file.endsWith(".ts") && !file.endsWith(".d.ts");
}

function countUseIsMobile(source, file) {
  if (RESPONSIVE_ADAPTER_IMPLEMENTATIONS.has(file)) return 0;
  if (RESPONSIVE_COMPOSITION_EXCEPTIONS.has(file)) return 0;
  return countMatches(source, USE_IS_MOBILE_RE);
}

function countStatusMap(source, file) {
  if (STATUS_MAP_IMPLEMENTATIONS.has(file)) return 0;
  return countMatches(source, STATUS_MAP_RE);
}

function countFrozenPrimitiveImport(source) {
  return FROZEN_PRIMITIVE_IMPORTS.reduce(
    (sum, primitive) => sum + primitiveImportCount(source, primitive),
    0,
  );
}

const SIGNALS = {
  rawPrimitiveImportBaseline: countFrozenPrimitiveImport,
  rawTableElement: /<table\b/g,
  hiddenMdBlock: /\bhidden\b[^"'\n]*\bmd:block\b/g,
  useIsMobile: countUseIsMobile,
  transitionAll: /\b(?:motion-safe:)?transition-all\b/g,
  nativeInteractiveElement: countNativeInteractiveElement,
  iconButtonAriaRisk: countIconButtonAriaRisk,
  actionHeightDrift: countActionHeightDrift,
  localSurfaceClone: countLocalSurfaceClone,
  loadingSpinnerDrift: LOADING_SPINNER_DRIFT_RE,
  pageLocalFormatter: PAGE_LOCAL_FORMATTER_RE,
  routeLocalStateCopy: (source, file) =>
    isUiSourceFile(file) ? countMatches(source, ROUTE_LOCAL_STATE_COPY_RE) : 0,
  actionDataStateCopy: (source, file) =>
    isActionDataSourceFile(file)
      ? countMatches(source, ROUTE_LOCAL_STATE_COPY_RE)
      : 0,
  nativeDialog: /window\.(?:confirm|alert)\(/g,
  statusMap: countStatusMap,
  statCardDef:
    /\b(?:function|const)\s+\w*(?:StatCard|SummaryCard|MetricCard|KpiCard)\b/g,
};

const SIGNAL_GUARD_COVERAGE = {
  rawPrimitiveImportBaseline: {
    status: "blocking-exception",
    guardGroup: "frozenPrimitiveImportBaselines",
    guardIds: [
      "raw-card-import-file-baseline",
      "raw-table-import-file-baseline",
      "raw-dialog-import-file-baseline",
      "raw-alert-dialog-import-file-baseline",
    ],
    exceptionAllowlistGroup: "frozenPrimitiveImportBaselines",
    exceptionAllowlist: {
      "apps/web/app/components/kpi/kpi-card.tsx": 1,
      "apps/web/app/components/surface.tsx": 1,
      "apps/web/app/components/data-table/data-table.tsx": 1,
      "apps/web/app/components/table-empty-state-row.tsx": 1,
      "apps/web/app/components/form/form-dialog.tsx": 1,
      "apps/web/app/components/pwa-install-help-dialog.tsx": 1,
    },
    reason:
      "Only registered adapter implementations may import these high-level composition primitives directly.",
  },
  rawTableElement: {
    status: "blocking-zero",
    guardIds: ["raw-table-element"],
  },
  hiddenMdBlock: {
    status: "blocking-zero",
    guardIds: ["responsive-double-render"],
  },
  useIsMobile: {
    status: "blocking-exception",
    guardIds: ["use-is-mobile-budget"],
    exceptionAllowlistGuard: "use-is-mobile-budget",
    exceptionAllowlist: {
      "apps/web/app/(protected)/br/[branchId]/pos/_components/archived-orders-sheet.tsx": 2,
      "apps/web/app/(protected)/br/[branchId]/pos/pos-desktop-inner.tsx": 2,
      "apps/web/app/_components/responsive-toaster.tsx": 2,
      "apps/web/app/components/data-table/data-table.tsx": 2,
    },
    reason:
      "Only composition adapters may branch on viewport; list/table surfaces route through DataTable.",
  },
  transitionAll: {
    status: "blocking-zero",
    guardIds: ["app-transition-all"],
  },
  nativeInteractiveElement: {
    status: "blocking-zero",
    guardIds: ["native-interactive-element"],
  },
  iconButtonAriaRisk: {
    status: "blocking-zero",
    guardIds: ["icon-button-accessible-name"],
  },
  actionHeightDrift: {
    status: "blocking-zero",
    guardIds: ["button-height-on-button"],
  },
  localSurfaceClone: {
    status: "blocking-zero",
    guardIds: ["surface-clone-ssot"],
  },
  loadingSpinnerDrift: {
    status: "blocking-zero",
    guardIds: ["app-loading-spinner-ssot"],
  },
  pageLocalFormatter: {
    status: "blocking-zero",
    guardGroup: "formatterGuardBaselines",
    guardIds: [
      "finance-page-local-formatter",
      "app-page-local-number-formatter",
      "vnd-format-ssot",
      "percent-format-ssot",
      "date-format-ssot",
    ],
  },
  routeLocalStateCopy: {
    status: "blocking-zero",
    guardIds: ["app-presentation-state-copy"],
  },
  actionDataStateCopy: {
    status: "blocking-zero",
    guardIds: ["app-action-data-state-copy"],
  },
  nativeDialog: {
    status: "blocking-zero",
    guardIds: ["no-native-dialog"],
  },
  statusMap: {
    status: "blocking-exception",
    guardIds: ["status-label-ssot"],
    exceptionAllowlistGuard: "status-label-ssot",
    exceptionAllowlist: {
      "apps/web/app/components/status-badge.tsx": 1,
      "apps/web/app/(protected)/br/[branchId]/kds/actions.ts": 1,
      "apps/web/app/(protected)/br/[branchId]/kds/_hooks/use-kds-realtime.ts": 2,
      "apps/web/app/(protected)/br/[branchId]/kds/page.tsx": 2,
      "apps/web/app/(protected)/br/[branchId]/pos/order-history.tsx": 1,
      "apps/web/app/(protected)/br/[branchId]/runner/page.tsx": 1,
    },
    reason:
      "Allowed matches are shared status-badge domains or workflow-state sets, not route-local label/variant maps.",
  },
  statCardDef: {
    status: "blocking-exception",
    guardIds: ["stat-card-ssot"],
    exceptionAllowlistGuard: "stat-card-ssot",
    exceptionAllowlist: {
      "apps/web/app/components/kpi/kpi-card.tsx": 1,
    },
    reason:
      "The sole allowed definition is the shared KpiCard implementation; route-local metric cards stay blocked.",
  },
};

const SIGNAL_GUARD_STATUSES = new Set([
  "blocking-zero",
  "blocking-baseline",
  "blocking-mixed",
  "blocking-exception",
  "advisory",
]);

function guardIdExists(contractSource, guardId) {
  return (
    contractSource.includes(`id: "${guardId}"`) ||
    contractSource.includes(`${guardId}:`)
  );
}

function extractContractGuardAllowlist(contractSource, guardId) {
  const idAnchor = contractSource.indexOf(`id: "${guardId}"`);
  if (idAnchor === -1) return null;
  const allowlistAnchor = contractSource.indexOf("allowlist:", idAnchor);
  const nextIdAnchor = contractSource.indexOf('id: "', idAnchor + 1);
  if (
    allowlistAnchor === -1 ||
    (nextIdAnchor !== -1 && allowlistAnchor > nextIdAnchor)
  ) {
    return null;
  }

  const start = contractSource.indexOf("{", allowlistAnchor);
  if (start === -1) return null;
  let depth = 0;
  let inString = null;
  for (let index = start; index < contractSource.length; index += 1) {
    const char = contractSource[index];
    if (inString) {
      if (char === inString && contractSource[index - 1] !== "\\") {
        inString = null;
      }
    } else if (char === '"' || char === "'" || char === "`") {
      inString = char;
    } else if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return Object.fromEntries(
          [
            ...contractSource
              .slice(start + 1, index)
              .matchAll(/"([^"]+)":\s*(\d+)/g),
          ].map((match) => [match[1], Number(match[2])]),
        );
      }
    }
  }
  return null;
}

function validateExceptionAllowlistContract(
  signal,
  coverage,
  contractSource,
  failures,
) {
  if (coverage.status !== "blocking-exception") return;
  const ownerGuardIds = coverage.exceptionAllowlistGroup
    ? (coverage.guardIds ?? [])
    : [coverage.exceptionAllowlistGuard].filter(Boolean);
  const expected = {};

  for (const guardId of ownerGuardIds) {
    const allowlist = extractContractGuardAllowlist(contractSource, guardId);
    if (!allowlist) {
      failures.push(`${signal} cannot read allowlist for guard ${guardId}`);
      continue;
    }
    for (const [file, count] of Object.entries(allowlist)) {
      expected[file] = (expected[file] ?? 0) + count;
    }
  }

  const actualEntries = Object.entries(
    coverage.exceptionAllowlist ?? {},
  ).sort();
  const expectedEntries = Object.entries(expected).sort();
  if (JSON.stringify(actualEntries) !== JSON.stringify(expectedEntries)) {
    failures.push(
      `${signal} exceptionAllowlist does not match its contract guard allowance`,
    );
  }
}

function validateExceptionAllowlist(signal, coverage, failures) {
  const hasExceptionMetadata =
    coverage.exceptionAllowlistGuard != null ||
    coverage.exceptionAllowlistGroup != null ||
    coverage.exceptionAllowlist != null;

  if (coverage.status !== "blocking-exception") {
    if (hasExceptionMetadata) {
      failures.push(
        `${signal} has exception metadata without blocking-exception status`,
      );
    }
    return;
  }

  if (coverage.exceptionAllowlistGuard && coverage.exceptionAllowlistGroup) {
    failures.push(
      `${signal} cannot declare both exceptionAllowlistGuard and exceptionAllowlistGroup`,
    );
  } else if (coverage.exceptionAllowlistGuard) {
    if ((coverage.guardIds ?? []).includes(coverage.exceptionAllowlistGuard)) {
      // Single-guard exception ownership is valid.
    } else {
      failures.push(
        `${signal} exceptionAllowlistGuard is not listed in guardIds`,
      );
    }
  } else if (coverage.exceptionAllowlistGroup) {
    if (coverage.exceptionAllowlistGroup !== coverage.guardGroup) {
      failures.push(`${signal} exceptionAllowlistGroup must match guardGroup`);
    }
  } else {
    failures.push(
      `${signal} is blocking-exception without an exception allowlist owner`,
    );
  }

  const allowlist = coverage.exceptionAllowlist;
  if (!allowlist || typeof allowlist !== "object" || Array.isArray(allowlist)) {
    failures.push(`${signal} is blocking-exception without exceptionAllowlist`);
    return;
  }

  const entries = Object.entries(allowlist);
  if (entries.length === 0) {
    failures.push(`${signal} has an empty exceptionAllowlist`);
  }

  for (const [file, count] of entries) {
    if (
      !UI_RUNTIME_SOURCE_ROOTS.some(
        (root) => file === root || file.startsWith(`${root}/`),
      )
    ) {
      failures.push(
        `${signal} exceptionAllowlist path is outside the UI runtime scope: ${file}`,
      );
    }
    if (!Number.isInteger(count) || count <= 0) {
      failures.push(
        `${signal} exceptionAllowlist count must be a positive integer: ${file}`,
      );
    }
    if (!fs.existsSync(path.join(REPO_ROOT, file))) {
      failures.push(`${signal} exceptionAllowlist file is missing: ${file}`);
    }
  }
}

function validateSignalGuardCoverage() {
  const signalKeys = Object.keys(SIGNALS).sort();
  const coverageKeys = Object.keys(SIGNAL_GUARD_COVERAGE).sort();
  const missing = signalKeys.filter((key) => !coverageKeys.includes(key));
  const extra = coverageKeys.filter((key) => !signalKeys.includes(key));
  const failures = [];

  if (missing.length > 0) {
    failures.push(`missing coverage for signal(s): ${missing.join(", ")}`);
  }
  if (extra.length > 0) {
    failures.push(`stale coverage for removed signal(s): ${extra.join(", ")}`);
  }

  const contractSource = fs.readFileSync(
    path.join(REPO_ROOT, "scripts/check-ui-contract.mjs"),
    "utf8",
  );

  for (const [signal, coverage] of Object.entries(SIGNAL_GUARD_COVERAGE)) {
    if (!SIGNAL_GUARD_STATUSES.has(coverage.status)) {
      failures.push(`${signal} has unknown guard status "${coverage.status}"`);
    }

    if (
      coverage.status === "advisory" ||
      coverage.status === "blocking-exception"
    ) {
      if (!coverage.reason) {
        failures.push(`${signal} is ${coverage.status} without a reason`);
      }
    }

    validateExceptionAllowlist(signal, coverage, failures);
    validateExceptionAllowlistContract(
      signal,
      coverage,
      contractSource,
      failures,
    );

    if (coverage.status === "advisory") {
      continue;
    }

    if (!Array.isArray(coverage.guardIds) || coverage.guardIds.length === 0) {
      failures.push(`${signal} is ${coverage.status} without guardIds`);
      continue;
    }

    for (const guardId of coverage.guardIds) {
      if (!guardIdExists(contractSource, guardId)) {
        failures.push(`${signal} points at missing guard "${guardId}"`);
      }
    }
  }

  if (failures.length > 0) {
    throw new Error(
      `audit-ui-components signal governance is incomplete:\n- ${failures.join("\n- ")}`,
    );
  }
}

function parseOptions(argv) {
  const options = {
    family: null,
    limit: DEFAULT_LIMIT,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--all") {
      options.limit = Number.POSITIVE_INFINITY;
    } else if (arg === "--family") {
      options.family = argv[index + 1] ?? null;
      index += 1;
    } else if (arg.startsWith("--family=")) {
      options.family = arg.slice("--family=".length);
    } else if (arg === "--limit") {
      options.limit = Number.parseInt(argv[index + 1] ?? "", 10);
      index += 1;
    } else if (arg.startsWith("--limit=")) {
      options.limit = Number.parseInt(arg.slice("--limit=".length), 10);
    } else if (arg === "--help" || arg === "-h") {
      console.log(`Usage: node scripts/audit-ui-components.mjs [options]

Options:
  --family <name>  Show high-risk files for one route family.
  --limit <number> Limit high-risk rows. Defaults to ${DEFAULT_LIMIT}.
  --all            Show every scored file.
`);
      process.exit(0);
    }
  }

  if (!Number.isFinite(options.limit) || options.limit < 1) {
    options.limit = DEFAULT_LIMIT;
  }

  return options;
}

function walkFiles(rootDir, extensions) {
  const absoluteRoot = path.join(REPO_ROOT, rootDir);
  if (!fs.existsSync(absoluteRoot)) return [];
  const files = [];
  const stack = [absoluteRoot];

  while (stack.length > 0) {
    const dir = stack.pop();
    if (!dir) continue;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "node_modules" && entry.name !== ".next") {
          stack.push(fullPath);
        }
      } else if (
        entry.isFile() &&
        extensions.some((extension) => entry.name.endsWith(extension))
      ) {
        files.push(fullPath);
      }
    }
  }

  return files;
}

function toPosix(filePath) {
  return path.relative(REPO_ROOT, filePath).split(path.sep).join("/");
}

function countMatches(source, pattern) {
  return [...source.matchAll(pattern)].length;
}

function countLocalDefinition(source, pattern, { skipDynamic = false } = {}) {
  let count = 0;
  for (const match of source.matchAll(pattern)) {
    if (skipDynamic) {
      const tail = source.slice(
        match.index + match[0].length,
        match.index + match[0].length + 40,
      );
      if (/^\s*=\s*dynamic\b/.test(tail)) continue;
    }
    count += 1;
  }
  return count;
}

function extractJsxOpeningTags(source, tagName) {
  const tags = [];
  const re = new RegExp(`<${tagName}\\b`, "g");
  let match;
  while ((match = re.exec(source))) {
    let i = match.index + match[0].length;
    let depth = 0;
    let inString = null;
    while (i < source.length) {
      const char = source[i];
      if (inString) {
        if (char === inString && source[i - 1] !== "\\") inString = null;
      } else if (char === '"' || char === "'" || char === "`") {
        inString = char;
      } else if (char === "{" || char === "(" || char === "[") {
        depth += 1;
      } else if (char === "}" || char === ")" || char === "]") {
        depth -= 1;
      } else if (char === ">" && depth === 0) {
        break;
      }
      i += 1;
    }
    tags.push({
      tag: source.slice(match.index, i + 1),
      start: match.index,
      end: i + 1,
    });
  }
  return tags;
}

function hasDirectAsChildPrimitiveParent(source, start) {
  const before = source.slice(Math.max(0, start - 320), start);
  const tail = before.slice(before.lastIndexOf("<"));
  return /^<(?:Button|InteractiveCard|Item|Badge)\b[^>]*\basChild\b[^>]*>\s*$/.test(
    tail,
  );
}

function isSemanticNativeLink(tag) {
  return (
    /\bhref=["']#/.test(tag) ||
    /\bhref=(?:"(?:tel|mailto):|'(?:tel|mailto):|\{`(?:tel|mailto):|\{phoneHref\()/.test(
      tag,
    ) ||
    /\btarget=["']_blank["']/.test(tag)
  );
}

function countNativeInteractiveElement(source, file) {
  if (NATIVE_INTERACTIVE_EXCEPTIONS.has(file)) return 0;
  let count = 0;
  for (const tagName of ["button", "a"]) {
    for (const { tag, start } of extractJsxOpeningTags(source, tagName)) {
      if (hasDirectAsChildPrimitiveParent(source, start)) continue;
      if (tagName === "a" && isSemanticNativeLink(tag)) continue;
      count += 1;
    }
  }
  return count;
}

function countIconButtonAriaRisk(source) {
  let count = 0;
  for (const { tag, end } of extractJsxOpeningTags(source, "Button")) {
    if (!/\bsize=["']icon(?:-[^"']*)?["']/.test(tag)) continue;
    if (/\baria-label=|\baria-labelledby=/.test(tag)) continue;
    const closeIndex = source.indexOf("</Button>", end);
    const buttonBody =
      closeIndex === -1
        ? source.slice(end, end + 360)
        : source.slice(end, closeIndex);
    if (/\bsr-only\b/.test(buttonBody)) continue;
    if (/\basChild\b/.test(tag)) {
      const childWindow = source.slice(end, end + 240);
      if (/\baria-label=|\baria-labelledby=/.test(childWindow)) continue;
    }
    count += 1;
  }
  return count;
}

function countActionHeightDrift(source) {
  let count = 0;
  for (const tagName of ["Button", "TouchButton", "button", "Link"]) {
    for (const { tag } of extractJsxOpeningTags(source, tagName)) {
      if (ACTION_HEIGHT_TOKEN_RE.test(tag)) count += 1;
    }
  }
  return count;
}

function countLocalSurfaceClone(source, file) {
  if (!isUiSourceFile(file)) return 0;
  if (ADAPTER_IMPLEMENTATIONS.has(file)) return 0;
  if (LOCAL_SURFACE_CLONE_EXCEPTIONS.has(file)) return 0;
  let count = countLocalDefinition(source, LOCAL_SURFACE_CLONE_RE);
  if (
    !/\b(?:AppSection|BranchOperatorPanel|SettingsFormSection)\b/.test(source)
  ) {
    count += countLocalDefinition(source, LOCAL_SECTION_CLONE_RE);
  }
  if (!/\b(?:AppToolbar|PwaToolbar)\b/.test(source)) {
    count += countLocalDefinition(source, LOCAL_TOOLBAR_CLONE_RE);
  }
  if (!/\bDataTable\b/.test(source)) {
    count += countLocalDefinition(source, LOCAL_TABLE_CLONE_RE);
  }
  if (
    !/\b(?:AppDialog|FormDialog|FileImportDialog|ReasonConfirmDialog)\b/.test(
      source,
    )
  ) {
    count += countLocalDefinition(source, LOCAL_DIALOG_CLONE_RE, {
      skipDynamic: true,
    });
  }
  return count;
}

function classifyFamily(file) {
  return ROUTE_FAMILIES.find(([, matches]) => matches(file))?.[0] ?? "other";
}

function primitiveImportCount(source, primitive) {
  return countMatches(
    source,
    new RegExp(`from\\s+["@']@comtammatu/ui/components/${primitive}["@']`, "g"),
  );
}

function summarizeFile(filePath) {
  const file = toPosix(filePath);
  const source = fs.readFileSync(filePath, "utf8");
  const imports = Object.fromEntries(
    PRIMITIVES.map((primitive) => [
      primitive,
      primitiveImportCount(source, primitive),
    ]).filter(([, count]) => count > 0),
  );
  const adapters = Object.fromEntries(
    ADAPTERS.map((adapter) => [
      adapter,
      countMatches(source, new RegExp(`\\b${adapter}\\b`, "g")),
    ]).filter(([, count]) => count > 0),
  );
  const signals = Object.fromEntries(
    Object.entries(SIGNALS)
      .map(([key, signal]) => [
        key,
        typeof signal === "function"
          ? signal(source, file)
          : countMatches(source, signal),
      ])
      .filter(([, count]) => count > 0),
  );

  return {
    file,
    family: classifyFamily(file),
    isPage: file.startsWith("apps/web/app/") && file.endsWith("/page.tsx"),
    imports,
    adapters,
    signals,
  };
}

function addCounts(target, source) {
  for (const [key, count] of Object.entries(source)) {
    target[key] = (target[key] ?? 0) + count;
  }
}

function scoreFile(file) {
  if (ADAPTER_IMPLEMENTATIONS.has(file.file)) return 0;

  return (
    (file.imports.card ?? 0) * 3 +
    (file.imports.table ?? 0) * 3 +
    (file.imports.dialog ?? 0) * 2 +
    (file.imports["alert-dialog"] ?? 0) * 2 +
    (file.signals.rawTableElement ?? 0) * 5 +
    (file.signals.hiddenMdBlock ?? 0) * 2 +
    (file.signals.transitionAll ?? 0) * 4 +
    (file.signals.iconButtonAriaRisk ?? 0) * 3 +
    (file.signals.actionHeightDrift ?? 0) * 2 +
    (file.signals.localSurfaceClone ?? 0) * 2 +
    (file.signals.loadingSpinnerDrift ?? 0) * 3 +
    (file.signals.nativeInteractiveElement ?? 0) * 2 +
    (file.signals.pageLocalFormatter ?? 0) +
    (file.signals.routeLocalStateCopy ?? 0) +
    (file.signals.actionDataStateCopy ?? 0) +
    (file.signals.statusMap ?? 0) * 2 +
    (file.signals.statCardDef ?? 0) * 2 +
    (file.signals.useIsMobile ?? 0)
  );
}

function formatCount(count) {
  return count > 0 ? String(count) : "";
}

function table(headers, rows) {
  const separator = headers.map(() => "---");
  return [
    `| ${headers.join(" | ")} |`,
    `| ${separator.join(" | ")} |`,
    ...rows.map((row) => `| ${row.join(" | ")} |`),
  ].join("\n");
}

function loadBaselineReporting() {
  const result = spawnSync(
    process.execPath,
    [
      path.join(REPO_ROOT, "scripts/check-ui-contract.mjs"),
      "--report-baselines=json",
    ],
    { cwd: REPO_ROOT, encoding: "utf8" },
  );

  if (result.status !== 0) {
    throw new Error(
      `UI contract baseline reporting failed:\n${result.stderr || result.stdout}`,
    );
  }

  try {
    return JSON.parse(result.stdout.trim());
  } catch (error) {
    throw new Error(
      `UI contract baseline reporting returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

const options = parseOptions(process.argv.slice(2));
validateSignalGuardCoverage();
const baselineReporting = loadBaselineReporting();
const guardReporting = buildUiContractGuardReporting(
  fs.readFileSync(
    path.join(REPO_ROOT, "scripts/check-ui-contract.mjs"),
    "utf8",
  ),
  fs.readFileSync(
    path.join(REPO_ROOT, "scripts/audit-ui-components.mjs"),
    "utf8",
  ),
);
if (guardReporting.errors.length > 0) {
  throw new Error(
    `UI contract guard reporting is incomplete:\n- ${guardReporting.errors.join("\n- ")}`,
  );
}
const componentRegistry = validateUiComponentRegistry(REPO_ROOT);
if (componentRegistry.errors.length > 0) {
  throw new Error(
    `UI component selection coverage is incomplete:\n- ${componentRegistry.errors.join("\n- ")}`,
  );
}
const appFiles = UI_RUNTIME_SOURCE_ROOTS.flatMap((root) =>
  walkFiles(root, [".ts", ".tsx"]),
).map(summarizeFile);
const actualPageFiles = appFiles
  .filter((file) => file.isPage)
  .map((file) => file.file)
  .sort();
const registeredPageFiles = Object.keys(PAGE_ARCHETYPES).sort();
const missingPageArchetypes = actualPageFiles.filter(
  (file) => !registeredPageFiles.includes(file),
);
const stalePageArchetypes = registeredPageFiles.filter(
  (file) => !actualPageFiles.includes(file),
);
if (missingPageArchetypes.length > 0 || stalePageArchetypes.length > 0) {
  throw new Error(
    [
      missingPageArchetypes.length > 0
        ? `route pages missing an archetype: ${missingPageArchetypes.join(", ")}`
        : null,
      stalePageArchetypes.length > 0
        ? `stale page archetype entries: ${stalePageArchetypes.join(", ")}`
        : null,
    ]
      .filter(Boolean)
      .join("\n"),
  );
}
const unclassifiedFiles = appFiles
  .filter((file) => file.family === "unclassified")
  .map((file) => file.file);
const sharedAppPages = appFiles
  .filter((file) => file.family === "shared-app" && file.isPage)
  .map((file) => file.file);
if (unclassifiedFiles.length > 0 || sharedAppPages.length > 0) {
  throw new Error(
    [
      unclassifiedFiles.length > 0
        ? `unclassified UI source files: ${unclassifiedFiles.join(", ")}`
        : null,
      sharedAppPages.length > 0
        ? `route pages fell through to shared-app: ${sharedAppPages.join(", ")}`
        : null,
    ]
      .filter(Boolean)
      .join("\n"),
  );
}
const familySummary = new Map();

for (const file of appFiles) {
  const summary = familySummary.get(file.family) ?? {
    files: 0,
    pages: 0,
    imports: {},
    adapters: {},
    signals: {},
  };
  summary.files += 1;
  if (file.isPage) summary.pages += 1;
  addCounts(summary.imports, file.imports);
  addCounts(summary.adapters, file.adapters);
  addCounts(summary.signals, file.signals);
  familySummary.set(file.family, summary);
}

const highRiskRows = appFiles
  .map((file) => ({ ...file, score: scoreFile(file) }))
  .filter(
    (file) =>
      file.score > 0 && (!options.family || file.family === options.family),
  )
  .sort((a, b) => b.score - a.score || a.file.localeCompare(b.file))
  .slice(0, options.limit)
  .map((file) => [
    file.family,
    file.file,
    String(file.score),
    formatCount(file.imports.card),
    formatCount(file.imports.table),
    formatCount(file.imports.dialog),
    formatCount(file.imports["alert-dialog"]),
    formatCount(file.adapters.DataTable),
    formatCount(file.adapters.AppDialog),
    formatCount(file.adapters.FormDialog),
    formatCount(file.adapters.AppSection),
    formatCount(file.adapters.PageSkeleton),
    formatCount(file.adapters.ErrorPanel),
    formatCount(file.signals.transitionAll),
    formatCount(file.signals.nativeInteractiveElement),
    formatCount(file.signals.iconButtonAriaRisk),
    formatCount(file.signals.actionHeightDrift),
    formatCount(file.signals.localSurfaceClone),
    formatCount(file.signals.loadingSpinnerDrift),
    formatCount(file.signals.pageLocalFormatter),
    formatCount(file.signals.routeLocalStateCopy),
    formatCount(file.signals.actionDataStateCopy),
    formatCount(file.signals.statusMap),
    formatCount(file.signals.useIsMobile),
  ]);

const familyRows = [...familySummary.entries()]
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([family, summary]) => [
    family,
    String(summary.files),
    String(summary.pages),
    formatCount(summary.imports.card),
    formatCount(summary.imports.table),
    formatCount(summary.imports.dialog),
    formatCount(summary.imports["alert-dialog"]),
    formatCount(summary.adapters.AppPage),
    formatCount(summary.adapters.AppPageHeader),
    formatCount(summary.adapters.AppSection),
    formatCount(summary.adapters.DataTable),
    formatCount(summary.adapters.AppDialog),
    formatCount(summary.adapters.FormDialog),
    formatCount(summary.adapters.KpiCard),
    formatCount(summary.adapters.StatusBadge),
    formatCount(summary.adapters.PageSkeleton),
    formatCount(summary.adapters.ErrorPanel),
    formatCount(summary.signals.transitionAll),
    formatCount(summary.signals.nativeInteractiveElement),
    formatCount(summary.signals.iconButtonAriaRisk),
    formatCount(summary.signals.actionHeightDrift),
    formatCount(summary.signals.localSurfaceClone),
    formatCount(summary.signals.loadingSpinnerDrift),
    formatCount(summary.signals.pageLocalFormatter),
    formatCount(summary.signals.routeLocalStateCopy),
    formatCount(summary.signals.actionDataStateCopy),
    formatCount(summary.signals.statusMap),
    formatCount(summary.signals.useIsMobile),
  ]);

const pageArchetypeCounts = Object.values(PAGE_ARCHETYPES).reduce(
  (counts, archetype) => {
    counts[archetype] = (counts[archetype] ?? 0) + 1;
    return counts;
  },
  {},
);
const pageArchetypeRows = [
  ...Object.entries(pageArchetypeCounts)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([archetype, count]) => [archetype, String(count)]),
  ["classified", String(registeredPageFiles.length)],
  ["missing", String(missingPageArchetypes.length)],
  ["stale", String(stalePageArchetypes.length)],
  ["actual pages", String(actualPageFiles.length)],
];

const adapterRows = ADAPTERS.map((adapter) => {
  const callers = appFiles.filter((file) => file.adapters[adapter] > 0);
  const hits = callers.reduce((sum, file) => sum + file.adapters[adapter], 0);
  return [adapter, String(callers.length), String(hits)];
});

const signalGuardRows = Object.entries(SIGNAL_GUARD_COVERAGE).map(
  ([signal, coverage]) => [
    signal,
    coverage.status,
    (coverage.guardIds ?? []).join(", "),
    coverage.reason ?? "",
    coverage.exceptionAllowlist
      ? String(Object.keys(coverage.exceptionAllowlist).length)
      : "",
    coverage.exceptionAllowlist
      ? String(
          Object.values(coverage.exceptionAllowlist).reduce(
            (sum, count) => sum + count,
            0,
          ),
        )
      : "",
  ],
);

const guardReportingRows = [
  [
    "audit-visible",
    "audit",
    String(guardReporting.auditVisibleGuardIds.length),
    "Route-family or repository signal is visible in Signal Guard Coverage.",
  ],
  ...guardReporting.groupRows.map((row) => [
    row.group,
    row.status,
    String(row.count),
    row.reason,
  ]),
  [
    "unclassified",
    "blocking",
    String(guardReporting.unclassified.length),
    "Must remain zero; add an audit signal or an explicit lint-only owner.",
  ],
  [
    "total",
    "inventory",
    String(guardReporting.total),
    "Every detected UI contract guard or maintenance id has one reporting owner.",
  ],
];

const baselineReportingRows = [
  ...baselineReporting.rows.map((row) => [
    row.id,
    String(row.actual),
    String(row.allowed),
    String(row.delta),
    String(row.debt),
    String(row.permanent),
    row.classification,
  ]),
  [
    "total",
    String(baselineReporting.totals.actual),
    String(baselineReporting.totals.allowed),
    String(baselineReporting.totals.delta),
    String(baselineReporting.totals.debt),
    String(baselineReporting.totals.permanent),
    "inventory",
  ],
];

const componentSelectionRows = [
  ...Object.entries(componentRegistry.primitiveCoverage.accessCounts).map(
    ([access, count]) => ["primitive", access, String(count)],
  ),
  [
    "primitive",
    "unclassified",
    String(componentRegistry.primitiveCoverage.unclassified.length),
  ],
  ["app-adapter", "registered", String(componentRegistry.appAdapterCount)],
  ["domain-adapter", "families", String(componentRegistry.domainFamilyCount)],
  ["domain-adapter", "exports", String(componentRegistry.domainExportCount)],
];

console.log("# UI Component Audit");
console.log();
console.log(
  "Generated from current workspace files. Use this as an orientation aid; `docs/spec/design-system.md` remains the UI authority.",
);
console.log();
console.log("## Route-family Summary");
console.log();
console.log(
  table(
    [
      "family",
      "files",
      "pages",
      "Card",
      "Table",
      "Dialog",
      "AlertDialog",
      "AppPage",
      "Header",
      "Section",
      "DataTable",
      "AppDialog",
      "FormDialog",
      "KpiCard",
      "StatusBadge",
      "PageSkeleton",
      "ErrorPanel",
      "transition-all",
      "native action",
      "icon aria risk",
      "action height",
      "surface clone",
      "loading risk",
      "formatters",
      "state copy",
      "action/data copy",
      "STATUS maps",
      "useIsMobile",
    ],
    familyRows,
  ),
);
console.log();
console.log("## Page Archetype Coverage");
console.log();
console.log(table(["archetype", "pages"], pageArchetypeRows));
console.log();
console.log("## Component Selection Coverage");
console.log();
console.log(
  table(["layer", "classification", "count"], componentSelectionRows),
);
console.log();
console.log("## Shared Adapter Adoption");
console.log();
console.log(table(["adapter", "caller files", "hits"], adapterRows));
console.log();
console.log("## Signal Guard Coverage");
console.log();
console.log(
  table(
    [
      "signal",
      "status",
      "guard",
      "reason",
      "exception files",
      "exception hits",
    ],
    signalGuardRows,
  ),
);
console.log();
console.log("## Guard Reporting Closure");
console.log();
console.log(table(["group", "status", "guards", "reason"], guardReportingRows));
console.log();
console.log("## Baseline Ratchet Truth");
console.log();
console.log(
  "`delta` is `actual - allowed`. Debt remains cleanup work; permanent exceptions are contract-owned adapter or archetype implementations.",
);
console.log();
console.log(
  table(
    [
      "guard",
      "actual",
      "allowed",
      "delta",
      "debt",
      "permanent exception",
      "classification",
    ],
    baselineReportingRows,
  ),
);
console.log();
console.log(
  options.family
    ? `## Highest-risk Files (${options.family})`
    : "## Highest-risk Files",
);
console.log();
console.log(
  table(
    [
      "family",
      "file",
      "score",
      "Card",
      "Table",
      "Dialog",
      "AlertDialog",
      "DataTable",
      "AppDialog",
      "FormDialog",
      "AppSection",
      "PageSkeleton",
      "ErrorPanel",
      "transition-all",
      "native action",
      "icon aria risk",
      "action height",
      "surface clone",
      "loading risk",
      "formatters",
      "state copy",
      "action/data copy",
      "STATUS maps",
      "useIsMobile",
    ],
    highRiskRows,
  ),
);
