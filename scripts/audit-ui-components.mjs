import fs from "node:fs";
import path from "node:path";

import {
  APP_ADAPTER_REGISTRY,
  DOMAIN_ADAPTER_FAMILIES,
  findComponentGuidance,
  validateUiComponentRegistry,
} from "./ui-component-registry.mjs";
import { buildUiContractGuardReporting } from "./ui-contract-guard-reporting.mjs";
import { UI_RUNTIME_SOURCE_ROOTS } from "./ui-contract-scope.mjs";
import { PAGE_ARCHETYPES, PAGE_DISPOSITIONS } from "./page-archetypes.mjs";

const REPO_ROOT = process.cwd();
const DEFAULT_LIMIT = 60;
const ROUTE_FAMILIES = [
  [
    "owner",
    (file) =>
      file === "apps/web/app/(protected)/page.tsx" ||
      file.includes("/(protected)/settings/") ||
      file.includes("/(protected)/branches/") ||
      file.includes("/(protected)/finance/") ||
      file.includes("/(protected)/hr/") ||
      file.includes("/(protected)/inventory/") ||
      file.includes("/(protected)/menu/") ||
      file.includes("/(protected)/orders/") ||
      file.includes("/(protected)/feedback/"),
  ],
  [
    "branch-settings-shared",
    (file) => file.includes("/(protected)/br/_shared/settings/"),
  ],
  ["branches", (file) => file.includes("/(protected)/branches/")],
  ["notifications", (file) => file.includes("/(protected)/notifications/")],
  [
    "branch-entry",
    (file) =>
      file.includes("/(protected)/br/") &&
      !file.includes("/(protected)/br/[branchId]/") &&
      !file.includes("/(protected)/br/_shared/"),
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
  ["runner-display", (file) => file.includes("/app/r/")],
  [
    "public-system",
    (file) =>
      file === "apps/web/app/(protected)/page.tsx" ||
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

const SHARED_COMPONENT_IMPORTS = [
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

const ADAPTERS = Object.entries(APP_ADAPTER_REGISTRY)
  .filter(([, entry]) => entry.audit)
  .map(([name]) => name);

const ADAPTER_IMPLEMENTATIONS = new Set([
  ...Object.values(APP_ADAPTER_REGISTRY).map((entry) => entry.source),
  ...Object.values(DOMAIN_ADAPTER_FAMILIES).map((entry) => entry.source),
]);

const NATIVE_INTERACTIVE_EXCEPTIONS = new Set([
  "apps/web/app/global-error.tsx",
]);

const ROUTE_LOCAL_STATE_COPY_RE =
  /["'`](?:[^\n"'`]*(?:Đang tải|Không có dữ liệu|Chưa có dữ liệu|Không thể tải|No data|Loading|Error loading)[^\n"'`]*)["'`]/g;
const LOADING_SPINNER_DRIFT_RE =
  /\b(?:Loader2|LoaderCircle|IconLoader2|animate-spin)\b/g;
const ACTION_HEIGHT_TOKEN_RE =
  /\b(?:h-(?:10|11|12|14|16|20|24|28|32|36|40|44)|min-h-(?:12|14|16|20|24))\b/;
const USE_IS_MOBILE_RE = /\buseIsMobile\s*\(/g;
const PAGE_LOCAL_FORMATTER_RE =
  /\b(?:new\s+Intl\.(?:NumberFormat|DateTimeFormat)|Intl\.(?:NumberFormat|DateTimeFormat)|\.toLocaleString\(|\.toLocaleDateString\(|\.toLocaleTimeString\()|\b(?:function|const)\s+format(?:VND|Percent)\b|\.toFixed\(\s*\d+\s*\)\s*\}\s*%/g;

function isUiSourceFile(file) {
  return file.endsWith(".tsx");
}

function isActionDataSourceFile(file) {
  return file.endsWith(".ts") && !file.endsWith(".d.ts");
}

const SIGNALS = {
  rawTableElement: /<table\b/g,
  hiddenMdBlock: /\bhidden\b[^"'\n]*\bmd:block\b/g,
  useIsMobile: USE_IS_MOBILE_RE,
  transitionAll: /\b(?:motion-safe:)?transition-all\b/g,
  nativeInteractiveElement: countNativeInteractiveElement,
  iconButtonAriaRisk: countIconButtonAriaRisk,
  actionHeightDrift: countActionHeightDrift,
  loadingSpinnerDrift: LOADING_SPINNER_DRIFT_RE,
  pageLocalFormatter: PAGE_LOCAL_FORMATTER_RE,
  routeLocalStateCopy: (source, file) =>
    isUiSourceFile(file) ? countMatches(source, ROUTE_LOCAL_STATE_COPY_RE) : 0,
  actionDataStateCopy: (source, file) =>
    isActionDataSourceFile(file)
      ? countMatches(source, ROUTE_LOCAL_STATE_COPY_RE)
      : 0,
  nativeDialog: /window\.(?:confirm|alert)\(/g,
};

const SIGNAL_GUARD_COVERAGE = {
  rawTableElement: {
    status: "blocking-zero",
    guardIds: ["raw-table-element"],
  },
  hiddenMdBlock: {
    status: "blocking-zero",
    guardIds: ["responsive-double-render"],
  },
  useIsMobile: {
    status: "advisory",
    guardIds: [],
    reason:
      "Viewport branching is a performance and responsive-IA review signal; choose the composition that preserves the workflow without duplicate trees.",
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
  loadingSpinnerDrift: {
    status: "blocking-zero",
    guardIds: ["app-loading-spinner-ssot"],
  },
  pageLocalFormatter: {
    status: "blocking-zero",
    guardGroup: "formatterGuards",
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
};

const SIGNAL_GUARD_STATUSES = new Set(["blocking-zero", "advisory"]);

function guardIdExists(contractSource, guardId) {
  return (
    contractSource.includes(`id: "${guardId}"`) ||
    contractSource.includes(`${guardId}:`)
  );
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

    if (coverage.status === "advisory") {
      if (!coverage.reason) {
        failures.push(`${signal} is ${coverage.status} without a reason`);
      }
    }

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
    component: null,
    family: null,
    limit: DEFAULT_LIMIT,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--all") {
      options.limit = Number.POSITIVE_INFINITY;
    } else if (arg === "--component") {
      options.component = argv[index + 1] ?? "";
      index += 1;
    } else if (arg.startsWith("--component=")) {
      options.component = arg.slice("--component=".length);
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
  --component <name> Show selection guidance for a shared component or adapter.
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

function extractJsxOpeningTagSpans(content, tagName) {
  const tags = [];
  const re = new RegExp(`<${tagName}\\b`, "g");
  let match;
  while ((match = re.exec(content))) {
    let i = match.index + match[0].length;
    let depth = 0;
    let inString = null;
    while (i < content.length) {
      const ch = content[i];
      if (inString) {
        if (ch === inString && content[i - 1] !== "\\") inString = null;
      } else if (ch === '"' || ch === "'" || ch === "`") {
        inString = ch;
      } else if (ch === "{" || ch === "(" || ch === "[") depth += 1;
      else if (ch === "}" || ch === ")" || ch === "]") depth -= 1;
      else if (ch === ">" && depth === 0) break;
      i += 1;
    }
    tags.push({
      tag: content.slice(match.index, i + 1),
      start: match.index,
      end: i + 1,
    });
  }
  return tags;
}

function extractJsxOpeningTags(content, tagName) {
  return extractJsxOpeningTagSpans(content, tagName).map(({ tag }) => tag);
}

function hasDirectAsChildPrimitiveParent(content, start) {
  const before = content.slice(Math.max(0, start - 320), start);
  const tail = before.slice(before.lastIndexOf("<"));
  return /^<(?:Button|InteractiveCard|Item|Badge)\b[^>]*\basChild\b[^>]*>\s*$/.test(
    tail,
  );
}

function hasDirectPrimitiveRenderParent(content, start) {
  const before = content.slice(Math.max(0, start - 1600), start);
  const tail = before.slice(before.lastIndexOf("<"));
  return /^<(?:Button|InteractiveCard|Item|Badge)\b[\s\S]*\brender=\{\s*$/.test(
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

function countNativeInteractiveElement(content, file) {
  if (NATIVE_INTERACTIVE_EXCEPTIONS.has(file)) return 0;
  let count = 0;
  for (const tagName of ["button", "a"]) {
    for (const { tag, start } of extractJsxOpeningTagSpans(content, tagName)) {
      if (hasDirectAsChildPrimitiveParent(content, start)) continue;
      if (hasDirectPrimitiveRenderParent(content, start)) continue;
      if (tagName === "a" && isSemanticNativeLink(tag)) continue;
      count += 1;
    }
  }
  return count;
}

function countIconButtonAriaRisk(content) {
  let count = 0;
  for (const { tag, end } of extractJsxOpeningTagSpans(content, "Button")) {
    if (!/\bsize=["']icon(?:-[^"']*)?["']/.test(tag)) continue;
    if (/\baria-label=|\baria-labelledby=/.test(tag)) continue;
    const closeIndex = content.indexOf("</Button>", end);
    const buttonBody =
      closeIndex === -1
        ? content.slice(end, end + 360)
        : content.slice(end, closeIndex);
    if (/\bsr-only\b/.test(buttonBody)) continue;
    if (/\basChild\b/.test(tag)) {
      const childWindow = content.slice(end, end + 240);
      if (/\baria-label=|\baria-labelledby=/.test(childWindow)) continue;
    }
    count += 1;
  }
  return count;
}

function countActionHeightDrift(content) {
  let count = 0;
  for (const tagName of ["Button", "TouchButton", "button", "Link"]) {
    for (const tag of extractJsxOpeningTags(content, tagName)) {
      if (ACTION_HEIGHT_TOKEN_RE.test(tag)) count += 1;
    }
  }
  return count;
}

function classifyFamily(file) {
  return ROUTE_FAMILIES.find(([, matches]) => matches(file))?.[0] ?? "other";
}

function sharedComponentImportCount(source, component) {
  return countMatches(
    source,
    new RegExp(`from\\s+["@']@comtammatu/ui/components/${component}["@']`, "g"),
  );
}

function summarizeFile(filePath) {
  const file = toPosix(filePath);
  const source = fs.readFileSync(filePath, "utf8");
  const imports = Object.fromEntries(
    SHARED_COMPONENT_IMPORTS.map((component) => [
      component,
      sharedComponentImportCount(source, component),
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
    (file.signals.loadingSpinnerDrift ?? 0) * 3 +
    (file.signals.nativeInteractiveElement ?? 0) * 2 +
    (file.signals.pageLocalFormatter ?? 0) +
    (file.signals.routeLocalStateCopy ?? 0) +
    (file.signals.actionDataStateCopy ?? 0)
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

function markdownCell(value) {
  return String(value ?? "")
    .replaceAll("|", "\\|")
    .replaceAll("\n", " ");
}

function printComponentGuidance(query, matches) {
  console.log("# UI Artifact Guidance");
  console.log();
  console.log(`Query: \`${query}\``);
  for (const entry of matches) {
    console.log();
    console.log(`## ${entry.layer}: ${entry.name}`);
    console.log();
    console.log(
      table(
        ["field", "value"],
        [
          ["classification", entry.classification],
          ["source", entry.source],
          ["archetypes", entry.archetypes?.join(", ")],
          ["planes", entry.planes?.join(", ")],
          ["need", entry.need],
          ["use", entry.use],
          ["fallback", entry.fallback],
          ["forbidden", entry.forbidden],
          ["exemplar", entry.exemplar],
        ].map((row) => row.map(markdownCell)),
      ),
    );
  }
}

function buildInputUsageCensus() {
  const rows = UI_RUNTIME_SOURCE_ROOTS.flatMap((root) =>
    walkFiles(root, [".tsx"]),
  )
    .map((filePath) => {
      const file = toPosix(filePath);
      const source = fs.readFileSync(filePath, "utf8");
      if (!/from\s+["']@comtammatu\/ui\/components\/input["']/.test(source)) {
        return null;
      }
      const inputTags = extractJsxOpeningTags(source, "Input");
      return {
        file,
        scope: file.startsWith("apps/web/app/components/form/")
          ? "shared-form"
          : "route-or-surface",
        uses: inputTags.length,
        fixedHeightUses: inputTags.filter(
          (tag) =>
            /\bclassName\s*=/.test(tag) && /\bh-(?:10|11|12|14|16)\b/.test(tag),
        ).length,
      };
    })
    .filter(Boolean);

  const scopes = ["shared-form", "route-or-surface"].map((scope) => {
    const scoped = rows.filter((row) => row.scope === scope);
    return {
      scope,
      files: scoped.length,
      uses: scoped.reduce((total, row) => total + row.uses, 0),
    };
  });
  const fixedHeightRows = rows
    .filter(
      (row) => row.scope === "route-or-surface" && row.fixedHeightUses > 0,
    )
    .sort((a, b) => a.file.localeCompare(b.file));

  return { rows, scopes, fixedHeightRows };
}

function printInputUsageCensus() {
  const census = buildInputUsageCensus();
  const totalFiles = census.rows.length;
  const totalUses = census.rows.reduce((total, row) => total + row.uses, 0);

  console.log();
  console.log("## Live direct-Input census");
  console.log();
  console.log(
    table(
      ["scope", "import files", "JSX uses"],
      [
        ...census.scopes.map((row) => [
          row.scope,
          String(row.files),
          String(row.uses),
        ]),
        ["total", String(totalFiles), String(totalUses)],
      ],
    ),
  );
  console.log();
  console.log("### Route-local fixed-height allowances");
  console.log();
  console.log(
    census.fixedHeightRows.length > 0
      ? table(
          ["file", "uses"],
          census.fixedHeightRows.map((row) => [
            markdownCell(row.file),
            String(row.fixedHeightUses),
          ]),
        )
      : "None.",
  );
}

const options = parseOptions(process.argv.slice(2));
validateSignalGuardCoverage();
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
if (options.component !== null) {
  const matches = findComponentGuidance(options.component);
  if (matches.length === 0) {
    console.error(
      `Unknown UI artifact "${options.component}". Use a registered component, adapter, or block such as Card, KpiCard, BranchOperatorPage, or branch-touch-list.`,
    );
    process.exit(1);
  }
  printComponentGuidance(options.component, matches);
  if (
    options.component
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "") === "input"
  ) {
    printInputUsageCensus();
  }
  process.exit(0);
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
const registeredPageDispositionFiles = Object.keys(PAGE_DISPOSITIONS).sort();
const missingPageDispositions = actualPageFiles.filter(
  (file) => !registeredPageDispositionFiles.includes(file),
);
const stalePageDispositions = registeredPageDispositionFiles.filter(
  (file) => !actualPageFiles.includes(file),
);
if (missingPageDispositions.length > 0 || stalePageDispositions.length > 0) {
  throw new Error(
    [
      missingPageDispositions.length > 0
        ? `route pages missing a disposition: ${missingPageDispositions.join(", ")}`
        : null,
      stalePageDispositions.length > 0
        ? `stale page disposition entries: ${stalePageDispositions.join(", ")}`
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
    formatCount(file.signals.loadingSpinnerDrift),
    formatCount(file.signals.pageLocalFormatter),
    formatCount(file.signals.routeLocalStateCopy),
    formatCount(file.signals.actionDataStateCopy),
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
    formatCount(summary.signals.loadingSpinnerDrift),
    formatCount(summary.signals.pageLocalFormatter),
    formatCount(summary.signals.routeLocalStateCopy),
    formatCount(summary.signals.actionDataStateCopy),
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
const pageDispositionCounts = Object.values(PAGE_DISPOSITIONS).reduce(
  (counts, disposition) => {
    const key = `${disposition.status}/${disposition.evidence}/${disposition.final ? "final" : "open"}`;
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  },
  {},
);
const pageDispositionRows = [
  ...Object.entries(pageDispositionCounts)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([disposition, count]) => [disposition, String(count)]),
  ["classified", String(registeredPageDispositionFiles.length)],
  ["missing", String(missingPageDispositions.length)],
  ["stale", String(stalePageDispositions.length)],
  [
    "final",
    String(
      Object.values(PAGE_DISPOSITIONS).filter(
        (disposition) => disposition.final,
      ).length,
    ),
  ],
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
    "Every detected UI contract guard has one reporting owner.",
  ],
];

const componentSelectionRows = [
  ...Object.entries(componentRegistry.sharedComponentCoverage.accessCounts).map(
    ([access, count]) => ["shared-component", access, String(count)],
  ),
  [
    "shared-component",
    "unclassified",
    String(componentRegistry.sharedComponentCoverage.unclassified.length),
  ],
  ["app-adapter", "registered", String(componentRegistry.appAdapterCount)],
  ["domain-adapter", "families", String(componentRegistry.domainFamilyCount)],
  ["domain-adapter", "exports", String(componentRegistry.domainExportCount)],
  ["ui-block", "registered", String(componentRegistry.uiBlockCount)],
];

console.log("# UI Component Audit");
console.log();
console.log(
  "Generated from current workspace files. Use this as an orientation aid; `docs/spec/design-system.md` remains the Má Tư visual authority.",
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
      "loading risk",
      "formatters",
      "state copy",
      "action/data copy",
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
console.log("## Page Disposition Coverage");
console.log();
console.log(table(["disposition/evidence/gate", "pages"], pageDispositionRows));
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
console.log(table(["signal", "status", "guard", "reason"], signalGuardRows));
console.log();
console.log("## Guard Ownership");
console.log();
console.log(table(["group", "status", "guards", "reason"], guardReportingRows));
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
      "loading risk",
      "formatters",
      "state copy",
      "action/data copy",
      "useIsMobile",
    ],
    highRiskRows,
  ),
);
