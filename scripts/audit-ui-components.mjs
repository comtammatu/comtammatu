import fs from "node:fs";
import path from "node:path";

const REPO_ROOT = process.cwd();
const DEFAULT_LIMIT = 60;

const ROUTE_FAMILIES = [
  ["admin", (file) => file.includes("/(protected)/admin/")],
  [
    "branch",
    (file) =>
      file.includes("/(protected)/br/[branchId]/") &&
      !file.includes("/pos/") &&
      !file.includes("/kds/") &&
      !file.includes("/runner/"),
  ],
  ["pos", (file) => file.includes("/(protected)/br/[branchId]/pos/")],
  ["kds", (file) => file.includes("/(protected)/br/[branchId]/kds/")],
  ["runner", (file) => file.includes("/(protected)/br/[branchId]/runner/")],
  ["employee", (file) => file.includes("/(protected)/employee/")],
  ["finance", (file) => file.includes("/(protected)/finance/")],
  ["hr", (file) => file.includes("/(protected)/hr/")],
  ["inventory", (file) => file.includes("/(protected)/inventory/")],
  ["menu", (file) => file.includes("/(protected)/menu/")],
  ["orders", (file) => file.includes("/(protected)/orders/")],
  ["public", (file) => file.includes("/(public)/")],
  ["shared-components", (file) => file.includes("/app/components/")],
  ["other", () => true],
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

const ADAPTERS = [
  "AppPage",
  "AppPageHeader",
  "AppSection",
  "AppToolbar",
  "AppEmptyState",
  "AppLinkCard",
  "DataTable",
  "FormDialog",
  "KpiCard",
  "StatusBadge",
  "TableEmptyStateRow",
  "RowActionsMenu",
  "SettingsFormSection",
];

const SIGNALS = {
  rawTableElement: /<table\b/g,
  hiddenMdBlock: /\bhidden\b[^"'\n]*\bmd:block\b/g,
  useIsMobile: /\buseIsMobile\b/g,
  nativeDialog: /window\.(?:confirm|alert)\(/g,
  loader2: /\bLoader2\b/g,
  animateSpin: /\banimate-spin\b/g,
  statusMap:
    /\bconst\s+(?![A-Z0-9_]*STATUS[A-Z0-9_]*(?:RANK|PRIORITY)[A-Z0-9_]*\b)[A-Z0-9_]*STATUS[A-Z0-9_]*(?:\s*:[^=]*?)?\s*=\s*[{[]/g,
  statCardDef:
    /\b(?:function|const)\s+\w*(?:StatCard|SummaryCard|MetricCard|KpiCard)\b/g,
};

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
      .map(([key, pattern]) => [key, countMatches(source, pattern)])
      .filter(([, count]) => count > 0),
  );

  return {
    file,
    family: classifyFamily(file),
    isPage: file.endsWith("/page.tsx"),
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
  return (
    (file.imports.card ?? 0) * 3 +
    (file.imports.table ?? 0) * 3 +
    (file.imports.dialog ?? 0) * 2 +
    (file.imports["alert-dialog"] ?? 0) * 2 +
    (file.signals.rawTableElement ?? 0) * 5 +
    (file.signals.hiddenMdBlock ?? 0) * 2 +
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

const options = parseOptions(process.argv.slice(2));
const appFiles = walkFiles("apps/web/app", [".ts", ".tsx"]).map(summarizeFile);
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
    formatCount(file.adapters.FormDialog),
    formatCount(file.adapters.AppSection),
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
    formatCount(summary.adapters.FormDialog),
    formatCount(summary.adapters.KpiCard),
    formatCount(summary.adapters.StatusBadge),
    formatCount(summary.signals.statusMap),
    formatCount(summary.signals.useIsMobile),
  ]);

const adapterRows = ADAPTERS.map((adapter) => {
  const callers = appFiles.filter((file) => file.adapters[adapter] > 0);
  const hits = callers.reduce((sum, file) => sum + file.adapters[adapter], 0);
  return [adapter, String(callers.length), String(hits)];
});

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
      "FormDialog",
      "KpiCard",
      "StatusBadge",
      "STATUS maps",
      "useIsMobile",
    ],
    familyRows,
  ),
);
console.log();
console.log("## Shared Adapter Adoption");
console.log();
console.log(table(["adapter", "caller files", "hits"], adapterRows));
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
      "FormDialog",
      "AppSection",
      "STATUS maps",
      "useIsMobile",
    ],
    highRiskRows,
  ),
);
