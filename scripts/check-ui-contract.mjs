import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = process.cwd();
const SELF_PATH = fileURLToPath(import.meta.url);
const WRITE_MODE = process.argv.includes("--write");

function walkFiles(rootDir, extensions) {
  const absoluteRoot = path.join(REPO_ROOT, rootDir);
  if (!fs.existsSync(absoluteRoot)) {
    throw new Error(
      `walkFiles: roots dir "${rootDir}" does not exist. A gate's roots must track the current tree — update the dir path instead of leaving it to silently guard nothing.`,
    );
  }

  const files = [];
  const stack = [absoluteRoot];

  while (stack.length > 0) {
    const dir = stack.pop();
    if (!dir) continue;

    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === ".next") continue;

      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
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

function countMatches(content, pattern) {
  return [...content.matchAll(pattern)].length;
}

// Extract JSX opening tags for a component, brace/paren/bracket/string aware so
// that `=>` arrows and `{...}` expression props (which contain `>`) do not
// terminate the tag. Lets a gate inspect a whole opening tag — including a
// multi-line `className={cn("…")}` — which a className-literal regex cannot.
function extractJsxOpeningTags(content, tagName) {
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
    tags.push(content.slice(match.index, i + 1));
  }
  return tags;
}

const checks = [
  {
    id: "non-current-visual-layer",
    description:
      "Non-current visual-layer tokens are not part of the runtime UI contract.",
    roots: [
      { dir: "apps/web/app", extensions: [".ts", ".tsx"] },
      { dir: "packages/ui/src/styles", extensions: [".css"] },
    ],
    pattern:
      /matu-surface|font-matu-|bg-matu-|text-matu-|border-matu-|rounded-matu|spacing-matu|radius-matu|matu-superapp\/DESIGN/g,
    allowlist: {},
  },
  {
    id: "focus-ring-contrast",
    description:
      "Focus rings must use the high-contrast keyline (ring-foreground), not the diluted gold ring-ring/NN which fails WCAG 1.4.11 (gold ≈ 2:1 on cream). Mirrors the @matu/design-system contrast gate.",
    roots: [{ dir: "packages/ui/src/components", extensions: [".tsx"] }],
    pattern: /\bring-ring(?:\/\d+)?\b/g,
    allowlist: {},
  },
  {
    id: "heading-scale",
    description:
      "Locked heading scale forbids app-surface text-4xl/text-5xl/font-black drift.",
    roots: [{ dir: "apps/web/app", extensions: [".tsx"] }],
    pattern:
      /className=\{?(?:cn\()?['"][^'"]*\b(text-4xl|text-5xl|font-black)\b/g,
    allowlist: {},
  },
  {
    id: "icon-size",
    description:
      "Banned icon-size classes size-7/9/11 must not spread; size-14/16 stay limited to media thumbnails.",
    roots: [{ dir: "apps/web/app", extensions: [".tsx"] }],
    pattern: /className=\{?(?:cn\()?['"][^'"]*\b(size-(7|9|11|14|16))\b/g,
    allowlist: {
      "apps/web/app/(protected)/inventory/_components/photo-upload-input.tsx": 2,
      "apps/web/app/(protected)/menu/menu-image-input.tsx": 1,
    },
  },
  {
    id: "radius-scale",
    description:
      "App surfaces use only rounded-md, rounded-lg, rounded-full, or rounded-none.",
    roots: [{ dir: "apps/web/app", extensions: [".tsx"] }],
    pattern:
      /className=\{?(?:cn\()?['"][^'"]*(\brounded\b(?!-(?:md|lg|full|none|t|b|l|r))|\brounded-(sm|xl|2xl|3xl|4xl)\b)/g,
    allowlist: {},
  },
  {
    id: "gap-scale",
    description:
      "App surfaces use the documented gap scale only: gap-1/1.5/2/3/4/6. gap-5/7/8+ is blocked at zero.",
    roots: [{ dir: "apps/web/app", extensions: [".tsx"] }],
    pattern:
      /className=\{?(?:cn\()?['"][^'"]*\bgap-(?:5|7|[89]|[1-9]\d|\[[^\]]+\])\b/g,
    allowlist: {},
  },
  {
    id: "primitive-radius-scale",
    description:
      "App-facing primitives do not expose rounded-xl/2xl/3xl/4xl radii; overlays and empty states use rounded-lg.",
    roots: [{ dir: "packages/ui/src/components", extensions: [".tsx"] }],
    pattern: /\brounded-(?:xl|2xl|3xl|4xl)!?\b/g,
    allowlist: {},
  },
  {
    id: "primitive-transition-all",
    description:
      "Primitive motion must name the transitioned properties instead of using transition-all.",
    roots: [{ dir: "packages/ui/src/components", extensions: [".tsx"] }],
    pattern: /\btransition-all\b/g,
    allowlist: {},
  },
  {
    id: "primitive-shadow-overrun",
    description:
      "Primitive overlays use the named shadow-effect-* family (popover/select/dropdown → shadow-effect-popover, dialog/alert-dialog → shadow-effect-dialog, sheet/drawer → shadow-effect-drawer, tooltip → shadow-effect-tooltip); raw shadow-xl/2xl stays capped to POS/KDS ceiling surfaces (design-system.md § Elevation).",
    roots: [{ dir: "packages/ui/src/components", extensions: [".tsx"] }],
    pattern: /\bshadow-(?:xl|2xl)\b/g,
    allowlist: {},
  },
  {
    id: "card-content-named-layout-props",
    description:
      "Use CardContent flush/scroll instead of local p-0 or overflow-x-auto layout overrides.",
    roots: [{ dir: "apps/web/app", extensions: [".tsx"] }],
    pattern:
      /<CardContent\b[^>]*className=["'][^"']*\b(?:p-0|overflow-x-auto)\b/g,
    allowlist: {},
  },
  {
    id: "app-section-content-named-layout-props",
    description:
      "Use AppSection contentFlush/contentScroll instead of contentClassName p-0 or overflow-x-auto.",
    roots: [{ dir: "apps/web/app", extensions: [".tsx"] }],
    pattern:
      /<AppSection\b[^>]*contentClassName=["'][^"']*\b(?:p-0|overflow-x-auto)\b/g,
    allowlist: {},
  },
  {
    id: "admin-finance-branch-raw-table-import",
    description:
      "Admin, Finance, and Branch Settings list surfaces use DataTable; raw Table imports are frozen baseline debt.",
    roots: [
      { dir: "apps/web/app/(protected)/admin", extensions: [".tsx"] },
      { dir: "apps/web/app/(protected)/finance", extensions: [".tsx"] },
      {
        dir: "apps/web/app/(protected)/branch-settings",
        extensions: [".tsx"],
      },
      {
        dir: "apps/web/app/(protected)/br/[branchId]/(operator)/settings",
        extensions: [".tsx"],
      },
    ],
    pattern: /from\s+["@']@comtammatu\/ui\/components\/table["@']/g,
    allowlist: {},
  },
  {
    id: "admin-finance-branch-raw-card-import",
    description:
      "Admin, Finance, and Branch Settings page surfaces use app card roles; raw Card imports are frozen baseline debt.",
    roots: [
      { dir: "apps/web/app/(protected)/admin", extensions: [".tsx"] },
      { dir: "apps/web/app/(protected)/finance", extensions: [".tsx"] },
      {
        dir: "apps/web/app/(protected)/branch-settings",
        extensions: [".tsx"],
      },
      {
        dir: "apps/web/app/(protected)/br/[branchId]/(operator)/settings",
        extensions: [".tsx"],
      },
    ],
    pattern: /from\s+["@']@comtammatu\/ui\/components\/card["@']/g,
    allowlist: {},
  },
  {
    id: "admin-finance-branch-toolbar-fixed-control",
    description:
      "Toolbar controls route through AppToolbar/DataTable; page-local fixed h-9/w-36/w-44/w-45 SelectTrigger sizing is frozen baseline debt.",
    roots: [
      { dir: "apps/web/app/(protected)/admin", extensions: [".tsx"] },
      { dir: "apps/web/app/(protected)/finance", extensions: [".tsx"] },
      {
        dir: "apps/web/app/(protected)/branch-settings",
        extensions: [".tsx"],
      },
      {
        dir: "apps/web/app/(protected)/br/[branchId]/(operator)/settings",
        extensions: [".tsx"],
      },
    ],
    pattern:
      /<SelectTrigger\b[^>]*className=["'][^"']*\b(?:h-9|w-36|w-44|w-45)\b/g,
    allowlist: {
      "apps/web/app/(protected)/admin/reports/stock-movement/stock-movement-client.tsx": 1,
    },
  },
  {
    id: "app-arbitrary-sizing",
    description:
      "Arbitrary app sizing remains baseline debt and must not spread.",
    roots: [{ dir: "apps/web/app", extensions: [".tsx"] }],
    pattern:
      /className=\{?(?:cn\()?['"][^'"]*\b(?:w|h|max-w|max-h|min-w|min-h|text)-\[[^\]]+\]/g,
    allowlist: {
      "apps/web/app/components/app-shell.tsx": 1,
    },
  },
  {
    id: "status-label-ssot",
    description:
      "Status label/variant maps are single-sourced in @comtammatu/shared labels + apps/web/app/components/status-badge.tsx; page-local STATUS* maps (including STATUS-first names and multi-line type annotations) must not spread.",
    roots: [{ dir: "apps/web/app", extensions: [".ts", ".tsx"] }],
    pattern:
      /\bconst\s+(?![A-Z0-9_]*STATUS[A-Z0-9_]*(?:RANK|PRIORITY)[A-Z0-9_]*\b)[A-Z0-9_]*STATUS[A-Z0-9_]*(?:\s*:[^=]*?)?\s*=\s*[{[]/g,
    allowlist: {
      "apps/web/app/components/status-badge.tsx": 1,
      "apps/web/app/(protected)/br/[branchId]/kds/actions.ts": 1,
      "apps/web/app/(protected)/br/[branchId]/kds/_hooks/use-kds-realtime.ts": 2,
      "apps/web/app/(protected)/br/[branchId]/kds/page.tsx": 2,
      "apps/web/app/(protected)/br/[branchId]/pos/order-history.tsx": 1,
      "apps/web/app/(protected)/br/[branchId]/runner/page.tsx": 1,
    },
  },
  {
    id: "vnd-format-ssot",
    description:
      "VND money rendering goes through formatVND from @comtammatu/shared/format; local vi-VN formatters must not spread.",
    roots: [{ dir: "apps/web/app", extensions: [".ts", ".tsx"] }],
    pattern:
      /toLocaleString\(\s*["']vi-VN["']|Intl\.NumberFormat\(\s*["']vi-VN["']|\b(?:function|const)\s+formatVND\b/g,
    allowlist: {
      "apps/web/app/(protected)/admin/reports/stock-movement/stock-movement-client.tsx": 1,
      "apps/web/app/(protected)/br/[branchId]/runner/page.tsx": 1,
      "apps/web/app/(protected)/finance/_lib/finance-cockpit.ts": 2,
      "apps/web/app/(protected)/finance/components/work-queue-strip.tsx": 1,
      "apps/web/app/(protected)/finance/page.tsx": 2,
      "apps/web/app/(protected)/finance/revenue/[date]/page.tsx": 1,
      "apps/web/app/(protected)/finance/revenue/revenue-charts-internal.tsx": 2,
      "apps/web/app/(protected)/finance/revenue/revenue-client.tsx": 9,
      "apps/web/app/(protected)/inventory/_lib/format.ts": 2,
      "apps/web/app/(protected)/inventory/grn/[id]/views/amend-owner-dialog.tsx": 1,
      "apps/web/app/(protected)/inventory/ingredients/ingredients-client.tsx": 1,
      "apps/web/app/(protected)/inventory/production-order-list.tsx": 1,
      "apps/web/app/(protected)/inventory/purchase-orders/new/new-po-client.tsx": 15,
    },
  },
  {
    id: "date-format-ssot",
    description:
      "VN date/time rendering goes through @comtammatu/shared/time (formatVNDate/formatVNDateTime/getVNDateString/…, which pin Asia/Ho_Chi_Minh); ad-hoc Intl.DateTimeFormat / toLocaleDateString / toLocaleTimeString in app code must not spread.",
    roots: [{ dir: "apps/web/app", extensions: [".ts", ".tsx"] }],
    pattern:
      /Intl\.DateTimeFormat\b|\.toLocaleDateString\(|\.toLocaleTimeString\(/g,
    allowlist: {},
  },
  {
    id: "stat-card-ssot",
    description:
      "KPI/stat metric cards are single-sourced in apps/web/app/components/kpi/; page-local StatCard/SummaryCard/MetricCard definitions must not spread.",
    roots: [{ dir: "apps/web/app", extensions: [".tsx"] }],
    pattern:
      /\b(?:function|const)\s+\w*(?:StatCard|SummaryCard|MetricCard|KpiCard)\b/g,
    allowlist: {
      "apps/web/app/components/kpi/kpi-card.tsx": 1,
    },
  },
  {
    id: "no-native-dialog",
    description:
      "Use confirm() from @comtammatu/ui/components/confirm-dialog and Sonner toasts; native window.confirm/alert are forbidden.",
    roots: [{ dir: "apps/web/app", extensions: [".ts", ".tsx"] }],
    pattern: /window\.(?:confirm|alert)\(/g,
    allowlist: {},
  },
  {
    id: "responsive-double-render",
    description:
      "Parallel mobile/desktop JSX trees (hidden … md:block twins) must not spread; migrate list surfaces to the shared DataTable adapter instead.",
    roots: [{ dir: "apps/web/app", extensions: [".tsx"] }],
    pattern: /\bhidden\b[^"'\n]*\bmd:block\b/g,
    allowlist: {},
  },
  {
    id: "use-is-mobile-budget",
    description:
      "useIsMobile is for composition-level switches (page width, drawer vs sheet, wizard density) — list surfaces use the shared DataTable adapter. Budget only shrinks.",
    roots: [{ dir: "apps/web/app", extensions: [".tsx"] }],
    pattern: /\buseIsMobile\b/g,
    allowlist: {
      "apps/web/app/(protected)/br/[branchId]/pos/_components/archived-orders-sheet.tsx": 2,
      "apps/web/app/(protected)/br/[branchId]/pos/pos-desktop-inner.tsx": 2,
      "apps/web/app/(protected)/inventory/grn/[id]/grn-detail-client.tsx": 2,
      "apps/web/app/_components/responsive-toaster.tsx": 2,
      "apps/web/app/components/data-table/data-table.tsx": 2,
    },
  },
  {
    id: "shell-registry-sidebar-provider",
    description:
      "SidebarProvider (Management chrome) is owned only by app-shell.tsx; a new bespoke sidebar mount is drift (design-system.md § B / D019).",
    roots: [{ dir: "apps/web/app", extensions: [".tsx"] }],
    pattern: /<SidebarProvider\b/g,
    allowlist: {
      "apps/web/app/components/app-shell.tsx": 1,
    },
  },
  {
    id: "shell-registry-bespoke-main",
    description:
      "Page-owned <main> chrome is frozen to the current shell/layout/frame set; a new bespoke <main> outside the allowlist fails CI (design-system.md § B / D019).",
    roots: [{ dir: "apps/web/app", extensions: [".tsx"] }],
    pattern: /<main\b/g,
    allowlist: {
      "apps/web/app/(protected)/br/[branchId]/kds/layout.tsx": 1,
      "apps/web/app/(protected)/br/[branchId]/pos/layout.tsx": 1,
      "apps/web/app/(protected)/br/[branchId]/runner/layout.tsx": 1,
      "apps/web/app/(protected)/employee/layout.tsx": 1,
      "apps/web/app/(public)/(auth)/login/page.tsx": 1,
      "apps/web/app/(public)/access-denied/layout.tsx": 1,
      "apps/web/app/(public)/payment/momo/return/page.tsx": 1,
      "apps/web/app/error.tsx": 1,
      "apps/web/app/not-found.tsx": 1,
    },
  },
  {
    id: "nav-shell-inline-literal",
    description:
      "Navigation is data: ShellNavGroup[] literals inside a shell are frozen; new inline nav must project from nav-config.ts through a shared resolver (design-system.md § D / D019).",
    roots: [{ dir: "apps/web/app", extensions: [".tsx"] }],
    pattern: /ShellNavGroup\[\]\s*=\s*\[/g,
    allowlist: {},
  },
  {
    id: "hover-shadow-rung",
    description:
      "Hover elevation caps at the shadow-effect-card-hover Hover rung; hover:shadow-md/lg/xl/2xl is an over-elevated rung (design-system.md § Elevation / Shadow).",
    roots: [{ dir: "apps/web/app", extensions: [".tsx"] }],
    pattern:
      /className=\{?(?:cn\()?['"][^'"]*\bhover:shadow-(?:md|lg|xl|2xl)\b/g,
    allowlist: {},
  },
  {
    id: "app-effect-shadow-rung",
    description:
      "App surfaces may use only hover:shadow-effect-card-hover; the shadow-effect-popover/dialog/drawer/tooltip/toast float shadows are primitive-only (design-system.md § Elevation).",
    roots: [{ dir: "apps/web/app", extensions: [".tsx"] }],
    pattern:
      /className=\{?(?:cn\()?['"][^'"]*\bshadow-effect-(?:popover|dialog|drawer|tooltip|toast)\b/g,
    allowlist: {},
  },
  {
    id: "resting-shadow-rung",
    description:
      "Resting app shadows are fixed baseline debt and must not spread; selected/active state uses ring, border, and background instead.",
    roots: [{ dir: "apps/web/app", extensions: [".tsx"] }],
    pattern:
      /(?<!hover:)(?<!focus:)(?<!focus-visible:)(?<!active:)(?<!data-\[state=open\]:)\bshadow-(?:sm|md|lg|xl|2xl)\b/g,
    allowlist: {
      "apps/web/app/components/app-bottom-nav.tsx": 1,
      "apps/web/app/(public)/access-denied/page.tsx": 1,
      "apps/web/app/(public)/(auth)/login/page.tsx": 1,
      "apps/web/app/(protected)/employee/schedule/schedule-client.tsx": 1,
      "apps/web/app/(protected)/br/[branchId]/runner/page.tsx": 1,
      "apps/web/app/(protected)/br/[branchId]/runner/runner-idle-visual.tsx": 2,
      "apps/web/app/(protected)/br/[branchId]/pos/pos-menu-grid.tsx": 2,
      "apps/web/app/(protected)/br/[branchId]/pos/pos-status-shell.tsx": 1,
      "apps/web/app/(protected)/br/[branchId]/pos/_components/pos-mobile-action-bar.tsx": 1,
      "apps/web/app/(protected)/br/[branchId]/kds/kds-board.tsx": 1,
      "apps/web/app/(protected)/br/[branchId]/kds/_components/focus-view.tsx": 1,
      "apps/web/app/(protected)/admin/settings/printers/templates/templates-client.tsx": 1,
    },
  },
  {
    id: "motion-color-duration",
    description:
      "Color/border feedback uses duration-150; duration-300 is the overlay enter/exit token. transition-colors paired with duration-300 is the wrong locked duration (design-system.md § Motion Contract).",
    roots: [{ dir: "apps/web/app", extensions: [".tsx"] }],
    pattern:
      /className=\{?(?:cn\()?['"][^'"]*\btransition-colors\b[^'"]*\bduration-300\b/g,
    allowlist: {},
  },
];

// shell-registry (Stage 0, design-system.md § B / D019): freeze the chrome-shell
// file set. Reserve the `-shell` suffix for the allowlist below; a new
// *-shell.tsx fails CI. The baseline only decreases as shells collapse toward
// the two chrome families.
const SHELL_REGISTRY_BASELINE = new Set([
  "apps/web/app/components/app-shell.tsx",
  "apps/web/app/components/office-module-shell.tsx",
  "apps/web/app/(protected)/finance/components/finance-shell.tsx",
  "apps/web/app/(protected)/inventory/_components/inventory-shell.tsx",
  "apps/web/app/(protected)/br/[branchId]/pos/pos-desktop-shell.tsx",
  "apps/web/app/(protected)/br/[branchId]/pos/pos-status-shell.tsx",
]);

// header-lockup-registry (D058 W2, design-system.md § B): freeze the file set
// allowed to render a top-level brand lockup (BrandLogoBox/BrandMark) outside
// the shared AppHeader primitive. The canonical header lockup MUST be an
// exported primitive that approved chrome families consume, not
// re-implemented per surface — a new direct BrandLogoBox/BrandMark caller
// outside this baseline is drift. The baseline only shrinks.
const HEADER_LOCKUP_REGISTRY_BASELINE = new Set([
  "apps/web/app/components/app-header.tsx",
  "apps/web/app/components/app-shell.tsx",
  "apps/web/app/(protected)/br/[branchId]/pos/pos-session-header.tsx",
  "apps/web/app/(protected)/br/[branchId]/pos/session-gate.tsx",
]);

const failures = [];

if (fs.existsSync(path.join(REPO_ROOT, "docs/archive"))) {
  failures.push("legacy-docs: docs/archive must not exist");
}

for (const blockedRootContextFile of ["PRODUCT.md", "DESIGN.md"]) {
  if (fs.existsSync(path.join(REPO_ROOT, blockedRootContextFile))) {
    failures.push(
      `external-design-context: root ${blockedRootContextFile} must not exist; use docs/spec/design-system.md and docs/ref/business-context.md`,
    );
  }
}

const webPackagePath = path.join(REPO_ROOT, "apps/web/package.json");
if (fs.existsSync(webPackagePath)) {
  const webPackageJson = JSON.parse(fs.readFileSync(webPackagePath, "utf8"));
  for (const dependencyField of [
    "dependencies",
    "devDependencies",
    "peerDependencies",
  ]) {
    if (webPackageJson[dependencyField]?.["radix-ui"]) {
      failures.push(
        `matu-ds-boundary: apps/web/package.json must not depend on radix-ui directly; route primitives through @comtammatu/ui`,
      );
    }
  }
}

for (const file of walkFiles("apps/web", [".ts", ".tsx"])) {
  const relativePath = toPosix(file);
  const content = fs.readFileSync(file, "utf8");
  if (/from\s+["']radix-ui["']/.test(content)) {
    failures.push(
      `matu-ds-boundary: ${relativePath} imports radix-ui directly; route primitives through @comtammatu/ui`,
    );
  }
}

const legacyDocReferencePattern =
  /docs\/archive(?:\/|$)|(?:^|[\s('"`])(?:\.{1,2}\/)*archive\/[^\s)\]'"`]*\.mdx?/g;

const legacyDocReferenceFiles = [
  path.join(REPO_ROOT, "AGENTS.md"),
  path.join(REPO_ROOT, "CLAUDE.md"),
  path.join(REPO_ROOT, "README.md"),
  ...walkFiles("docs", [".md", ".mdx"]),
  ...walkFiles("tasks", [".md", ".mdx"]),
  ...walkFiles("apps", [".ts", ".tsx"]),
  ...walkFiles("packages", [".ts", ".tsx", ".css"]),
  ...walkFiles("scripts", [".js", ".mjs", ".sh"]),
  ...walkFiles("supabase", [".sql"]),
].filter((file) => fs.existsSync(file));

for (const file of legacyDocReferenceFiles) {
  const relativePath = toPosix(file);
  const content = fs.readFileSync(file, "utf8");
  const matches = countMatches(content, legacyDocReferencePattern);
  if (matches > 0) {
    failures.push(
      `legacy-doc-references: ${relativePath} has ${matches} archive doc reference(s)`,
    );
  }
}

const docsPathPattern =
  /docs\/(?:agent|architecture|modules|plan|ref|releases|runbooks|spec|status|user-guides|worklog)\/[A-Za-z0-9_./%#-]+\.md/g;

for (const file of legacyDocReferenceFiles) {
  const relativePath = toPosix(file);
  const content = fs.readFileSync(file, "utf8");
  for (const match of content.matchAll(docsPathPattern)) {
    const rawDocPath = match[0].split("#")[0];
    const decodedDocPath = decodeURIComponent(rawDocPath);
    if (!fs.existsSync(path.join(REPO_ROOT, decodedDocPath))) {
      failures.push(
        `dead-doc-reference: ${relativePath} points to missing ${decodedDocPath}`,
      );
    }
  }
}

const forbiddenTextChecks = [
  {
    id: "ui-authority-no-retired-scaffold-names",
    files: [
      "docs/spec/design-system.md",
      "docs/modules/ui.md",
      "docs/agent/rules/ui.md",
      "tasks/regressions.md",
      "packages/ui/src/styles/globals.css",
    ],
    pattern:
      /\bradix-(?:lyra|luma)\b|buFywKm|components\.json|shadcn\/ui|scaffold CLI\/preset|old preset names|preset-backed primitives|preset primitives|NO-LEGACY-APP-HELPERS|retired scaffold\/preset/g,
  },
  {
    id: "active-entrypoints-no-stale-ui-provider-terms",
    files: [
      "README.md",
      "docs/README.md",
      "docs/spec/toast-notification-system.md",
      "tasks/regressions.md",
      "apps/web/e2e/visual/theme-baseline.spec.ts",
    ],
    pattern:
      /b1GN1lxvE|b6G3vbGue|HĐĐT MISA blocked|docs\/plan\/roadmap\.md|Tabler icons|--font-matu-heading|Employee portal|Employee Portal/g,
  },
  {
    id: "all-sources-no-dead-legacy-doc-terms",
    files: legacyDocReferenceFiles
      .map((file) => toPosix(file))
      .filter((file) => file !== "scripts/check-ui-contract.mjs"),
    pattern:
      /matu-superapp\/DESIGN|docs\/plan\/m4-payments-fix\.md|m4-payments-fix\.md|docs\/modules\/pos-kds\.md|docs\/plan\/adr\/0006-finance-phase-migration-chain\.md|\.understand-anything\/knowledge-graph\.json|ORACLE-META|codebase-oracle/g,
  },
];

const textChecks = [
  {
    id: "design-system-one-source-contract",
    file: "docs/spec/design-system.md",
    includes: [
      "This is intentionally **one source of truth**, not a source-of-truth bundle.",
      "They must point back to this contract.",
      "the conflict is a bug to resolve",
      "The design system is the Com Tam Ma Tu Custom Theme contract implemented by",
      "Má Tư Design System primitives in `@comtammatu/ui`",
      "External scaffold output is not part of the runtime contract",
    ],
  },
  {
    id: "design-system-one-source-agent-rule",
    file: "docs/agent/rules/ui.md",
    includes: [
      "There is exactly one UI design-system source of truth:",
      "`docs/spec/design-system.md`",
      "That source defines the Com Tam Ma Tu Custom Theme.",
      "Everything else is evidence, implementation, or enforcement for that contract",
      "NEVER treat external UI scaffold output as authority to override the Custom Theme",
      "REMOVE stale UI rules; keep only live hard rails, workflows, contracts, or guards.",
    ],
  },
  {
    id: "design-system-one-source-module-doc",
    file: "docs/modules/ui.md",
    includes: [
      "Single source of truth for agent decisions:",
      "UI của repo là Com Tam Ma Tu Custom Theme",
      "Runtime config, primitives, adapters, runbooks, worklogs, and regression rules",
      "are evidence/enforcement for that contract",
      "design system:",
      "Không được coi external UI scaffold output là authority cao hơn Custom Theme",
    ],
  },
  {
    id: "design-system-one-source-regression",
    file: "tasks/regressions.md",
    includes: ["DESIGN-SYSTEM-ONE-SOURCE-ONLY"],
  },
  {
    id: "design-system-runtime-token-contract",
    file: "docs/spec/design-system.md",
    includes: [
      "Tier: `tier-elite`, `tier-note`",
      "`packages/ui/src/components/theme-provider.tsx` is the only runtime theme",
      "`max-h-dvh-95` and `max-h-dvh-80`",
      "`pos-safe-bottom` is limited to POS PWA floating bottom bars.",
      "`chrome-safe-pb` / `chrome-safe-bottom`",
    ],
  },
  {
    id: "ui-module-contract-boundary",
    file: "docs/modules/ui.md",
    includes: [
      "`docs/spec/design-system.md`: Custom Theme authority",
      "`docs/modules/ui.md`: implementation guide",
      "`docs/runbooks/*`: verification checklists only.",
      "`docs/worklog/*`: temporary staging only",
    ],
  },
  {
    id: "card-title-runtime-contract",
    file: "packages/ui/src/components/card.tsx",
    includes: [
      '"font-heading font-semibold"',
      'default: "text-base"',
      'sm: "text-sm"',
      'lg: "text-2xl"',
    ],
  },
  {
    id: "app-page-header-eyebrow-contract",
    file: "apps/web/app/components/surface.tsx",
    includes: [
      "text-xs font-medium uppercase tracking-wide text-muted-foreground",
    ],
  },
  {
    id: "app-section-icon-size-contract",
    file: "apps/web/app/components/surface.tsx",
    includes: ['"inline-flex shrink-0 [&_svg]:size-5"'],
  },
  {
    id: "button-radius-runtime-contract",
    file: "packages/ui/src/components/button.tsx",
    includes: [
      "items-center justify-center rounded-md border border-transparent",
      'xs: "h-6 gap-1 px-2 text-xs',
      '"icon-sm": "size-7"',
    ],
  },
  {
    id: "card-content-runtime-variants",
    file: "packages/ui/src/components/card.tsx",
    includes: [
      "flush?: boolean",
      "scroll?: boolean",
      'flush ? "px-0" : "px-4 group-data-[size=sm]/card:px-3"',
      'scroll && "overflow-x-auto"',
    ],
  },
  {
    id: "card-content-layout-props-contract",
    file: "docs/spec/design-system.md",
    includes: ["`CardContent flush`", "`CardContent scroll`"],
  },
  {
    id: "card-content-layout-props-module-doc",
    file: "docs/modules/ui.md",
    includes: [
      "`flush` cho table-edge/list-edge alignment",
      "`scroll` cho horizontal table",
    ],
  },
  {
    id: "matu-ds-runtime-contract",
    file: "docs/spec/design-system.md",
    includes: ["primitive source: `packages/ui/src/components/*`"],
  },
  {
    id: "matu-ds-agent-rule",
    file: "docs/agent/rules/ui.md",
    includes: ["USE Má Tư DS primitives from `@comtammatu/ui`"],
  },
  {
    id: "matu-ds-module-doc",
    file: "docs/modules/ui.md",
    includes: ["Baseline hiện tại: Má Tư DS primitives"],
  },
  {
    id: "readme-ui-runtime-current",
    file: "README.md",
    includes: ["Má Tư Design System primitives (`@comtammatu/ui`)"],
  },
  {
    id: "readme-design-system-contract-pointer",
    file: "README.md",
    includes: ["UI design-system SSOT / Custom Theme contract"],
  },
  {
    id: "docs-index-design-system-contract-pointer",
    file: "docs/README.md",
    includes: [
      "UI Design System SSOT / Custom Theme contract: [spec/design-system.md](spec/design-system.md)",
      "`spec/design-system.md`: single source of truth cho UI design-system",
    ],
  },
  {
    id: "theme-baseline-runtime-current",
    file: "apps/web/e2e/visual/theme-baseline.spec.ts",
    includes: ["Má Tư Design System runtime"],
  },
  {
    id: "data-table-mobile-empty-state-adapter",
    file: "apps/web/app/components/data-table/data-table.tsx",
    includes: ["<AppEmptyState", 'mode={emptyMode ?? "no-data"}'],
  },
];

const countBudgets = [
  {
    id: "card-content-classname-baseline",
    description:
      "CardContent className overrides are composition debt and must not increase.",
    roots: [{ dir: "apps/web/app", extensions: [".tsx"] }],
    pattern: /<CardContent\b[^\n]*\bclassName=/g,
    maxCount: 1,
  },
  {
    id: "card-title-classname-baseline",
    description:
      "CardTitle className overrides are heading-scale debt and must not increase.",
    roots: [{ dir: "apps/web/app", extensions: [".tsx"] }],
    pattern: /<CardTitle\b[^\n]*\bclassName=/g,
    maxCount: 0,
  },
  {
    id: "resting-shadow-baseline",
    description:
      "Resting shadow debt only burns down; new app-surface shadows must route through an approved overlay/fixed-chrome adapter.",
    roots: [{ dir: "apps/web/app", extensions: [".tsx"] }],
    pattern:
      /(?<!hover:)(?<!focus:)(?<!focus-visible:)(?<!active:)(?<!data-\[state=open\]:)\bshadow-(?:sm|md|lg|xl|2xl)\b/g,
    maxCount: 14,
  },
];

const perFileCountBudgets = [
  {
    id: "space-y-baseline",
    description:
      "Vertical rhythm debt is frozen per file; cleanup in one file must not let another file add space-y drift.",
    roots: [{ dir: "apps/web/app", extensions: [".tsx"] }],
    pattern:
      /\bspace-y-(?:px|0|0\.5|1|1\.5|2|2\.5|3|3\.5|4|5|6|7|8|9|10|11|12|14|16|20|24|\[[^\]]+\])\b/g,
    allowlist: {
      "apps/web/app/(protected)/inventory/ingredients/ingredients-client.tsx": 1,
      "apps/web/app/(protected)/menu/category-table.tsx": 2,
      "apps/web/app/(protected)/menu/item-table.tsx": 1,
    },
  },
  {
    id: "raw-padding-baseline",
    description:
      "Large local padding is frozen per file; route cleanup must not create offsetting padding debt elsewhere.",
    roots: [{ dir: "apps/web/app", extensions: [".tsx"] }],
    pattern:
      /className=\{?(?:cn\()?['"][^'"]*\b(?:p|px|py|pt|pb|pl|pr)-(?:5|6|7|8|9|10|11|12|14|16|20|24)\b/g,
    allowlist: {
      "apps/web/app/_components/notification-list.tsx": 1,
      "apps/web/app/(protected)/admin/settings/printers/templates/templates-client.tsx": 1,
      "apps/web/app/(protected)/branches/network-config-dialog.tsx": 2,
      "apps/web/app/(protected)/br/[branchId]/kds/_components/focus-view.tsx": 1,
      "apps/web/app/(protected)/br/[branchId]/pos/_components/archived-orders-sheet.tsx": 1,
      "apps/web/app/(protected)/br/[branchId]/pos/_components/bill/bill-receipt-sheet.tsx": 1,
      "apps/web/app/(protected)/br/[branchId]/pos/_components/cart-pane.tsx": 1,
      "apps/web/app/(protected)/br/[branchId]/pos/order-history.tsx": 2,
      "apps/web/app/(protected)/br/[branchId]/pos/session-gate.tsx": 2,
      "apps/web/app/(protected)/br/[branchId]/runner/page.tsx": 2,
      "apps/web/app/(protected)/branch-settings/_shared/kds/station-form-dialog.tsx": 1,
      "apps/web/app/(protected)/hr/attendance-table.tsx": 1,
      "apps/web/app/(protected)/inventory/_components/blind-counting-grid.tsx": 1,
      "apps/web/app/(protected)/inventory/_components/inventory-branch-filter.tsx": 1,
      "apps/web/app/(protected)/inventory/purchase-orders/[id]/po-detail-client.tsx": 2,
      "apps/web/app/(protected)/inventory/settings/thresholds/page.tsx": 1,
      "apps/web/app/(protected)/inventory/transfers/[id]/transfer-detail-client.tsx": 2,
      "apps/web/app/(protected)/menu/item-detail-dialog.tsx": 1,
      "apps/web/app/(protected)/orders/order-detail-sheet.tsx": 2,
      "apps/web/app/(public)/(auth)/login/page.tsx": 2,
      "apps/web/app/(public)/access-denied/layout.tsx": 1,
      "apps/web/app/components/data-table/data-table.tsx": 1,
    },
  },
  {
    id: "gap-atypical-baseline",
    description:
      "Gap values outside the documented app scale are frozen per file until they are normalized.",
    roots: [{ dir: "apps/web/app", extensions: [".tsx"] }],
    pattern: /\bgap-(?:0|0\.5|2\.5)\b/g,
    allowlist: {
      "apps/web/app/(protected)/br/[branchId]/kds/_components/focus-view.tsx": 1,
      "apps/web/app/(protected)/br/[branchId]/kds/_components/order-grid.tsx": 1,
      "apps/web/app/(protected)/br/[branchId]/pos/_components/archived-orders-sheet.tsx": 1,
      "apps/web/app/(protected)/br/[branchId]/pos/_components/bill/bill-receipt-summary.tsx": 2,
      "apps/web/app/(protected)/br/[branchId]/pos/_components/order-detail/order-item-actions-sheet.tsx": 1,
      "apps/web/app/(protected)/br/[branchId]/pos/pos-menu-grid.tsx": 1,
      "apps/web/app/(protected)/br/[branchId]/pos/pos-sidebar-panel.tsx": 1,
      "apps/web/app/(protected)/inventory/grn/[id]/views/add-grn-line-dialog.tsx": 1,
      "apps/web/app/(protected)/inventory/grn/[id]/views/amend-owner-dialog.tsx": 1,
      "apps/web/app/(protected)/inventory/grn/new/[supplierId]/grn-create-client.tsx": 1,
      "apps/web/app/(protected)/inventory/ingredients/ingredients-client.tsx": 1,
      "apps/web/app/(protected)/inventory/inventory-value-panel.tsx": 1,
      "apps/web/app/(protected)/inventory/purchase-orders/new/new-po-client.tsx": 4,
    },
  },
  {
    id: "inline-chrome-baseline",
    description:
      "Hand-rolled card/inset chrome (rounded-md|lg + border + bg-card|background on a raw element) is frozen per file; delegate to Card/AppSection/Item/NoteCallout/Alert instead of reimplementing surface chrome inline.",
    roots: [{ dir: "apps/web/app", extensions: [".tsx"] }],
    pattern:
      /className=\{?(?:cn\()?['"](?=[^'"]*\brounded-(?:md|lg)\b)(?=[^'"]*\bborder\b)(?=[^'"]*\bbg-(?:card|background)\b)[^'"]*['"]/g,
    allowlist: {
      "apps/web/app/_components/notification-list.tsx": 1,
      "apps/web/app/(protected)/br/[branchId]/pos/pos-desktop-inner.tsx": 1,
      "apps/web/app/(protected)/br/[branchId]/pos/pos-page-skeleton.tsx": 1,
      "apps/web/app/(protected)/br/[branchId]/pos/session-gate.tsx": 1,
      "apps/web/app/(protected)/inventory/grn/[id]/views/grn-line-row.tsx": 1,
      "apps/web/app/(protected)/inventory/grn/new/[supplierId]/grn-create-client.tsx": 3,
      "apps/web/app/(protected)/inventory/production-stats.tsx": 1,
      "apps/web/app/(protected)/inventory/purchase-orders/new/new-po-client.tsx": 3,
      "apps/web/app/(protected)/inventory/stock/stock-client.tsx": 1,
      "apps/web/app/(protected)/inventory/transfers/[id]/transfer-detail-client.tsx": 3,
      "apps/web/app/(protected)/inventory/waste/new/waste-create-client.tsx": 1,
      "apps/web/app/(public)/(auth)/login/page.tsx": 1,
    },
  },
  {
    id: "radius-tier-baseline",
    description:
      "Detectable-subset heuristic for wrong-tier radius (full tier-correctness is enforced by review + the design-system Radius table): rounded-full on an icon-box (size-8|10|12|14|16) should be rounded-md, and rounded-lg on a small inset (size-8|10|12) should be rounded-md. Frozen per file.",
    roots: [{ dir: "apps/web/app", extensions: [".tsx"] }],
    pattern:
      /className=\{?(?:cn\()?['"](?:(?=[^'"]*\brounded-full\b)(?=[^'"]*\bsize-(?:8|10|12|14|16)\b)|(?=[^'"]*\brounded-lg\b)(?=[^'"]*\bsize-(?:8|10|12)\b))[^'"]*['"]/g,
    allowlist: {
      "apps/web/app/_components/notification-list.tsx": 1,
      "apps/web/app/(protected)/inventory/dashboard-client.tsx": 1,
      "apps/web/app/(protected)/inventory/grn/new/page.tsx": 1,
    },
  },
  {
    id: "custom-shadow-baseline",
    description:
      "Custom shadow values are frozen per file; app elevation must use the documented shadow rung scale.",
    roots: [
      { dir: "apps/web/app", extensions: [".tsx"] },
      { dir: "packages/ui/src/components", extensions: [".tsx"] },
    ],
    pattern:
      /\bshadow-\[[^\]]+\]|\bboxShadow\b|\bbox-shadow\b|--shadow-[\w-]+/g,
    allowlist: {
      "apps/web/app/(protected)/br/[branchId]/pos/_components/append-draft-pane.tsx": 1,
      "apps/web/app/(protected)/employee/components/employee-page.tsx": 2,
      "apps/web/app/(protected)/employee/schedule/schedule-client.tsx": 1,
      "apps/web/app/(protected)/employee/tasks/tasks-client.tsx": 1,
      "apps/web/app/(protected)/inventory/settings/settings-section-nav.tsx": 1,
      "apps/web/app/components/app-bottom-nav.tsx": 1,
      "apps/web/app/components/data-table/interactive-card.tsx": 1,
      "apps/web/app/components/surface.tsx": 3,
      "packages/ui/src/components/badge.tsx": 1,
      "packages/ui/src/components/button.tsx": 1,
      "packages/ui/src/components/scroll-area.tsx": 1,
      "packages/ui/src/components/sidebar.tsx": 2,
      "packages/ui/src/components/switch.tsx": 1,
      "packages/ui/src/components/tabs.tsx": 1,
      "packages/ui/src/components/toggle.tsx": 1,
    },
  },
];

const frozenPrimitiveImportBaselines = [
  {
    id: "raw-card-import-file-baseline",
    component: "card",
    label: "Card",
    replacement:
      "an app card role: AppSection, AppLinkCard, KpiCard for metrics only, InteractiveCard, OperationalBoardCard, or a route-scoped adapter",
    allowlist: {
      "apps/web/app/components/kpi/kpi-card.tsx": 1,
      "apps/web/app/components/surface.tsx": 1,
    },
  },
  {
    id: "raw-table-import-file-baseline",
    component: "table",
    label: "Table",
    replacement:
      "DataTable, TableEmptyStateRow, or a documented line-sheet adapter",
    allowlist: {
      "apps/web/app/components/data-table/data-table.tsx": 1,
      "apps/web/app/components/table-empty-state-row.tsx": 1,
    },
  },
  {
    id: "raw-dialog-import-file-baseline",
    component: "dialog",
    label: "Dialog",
    replacement: "FormDialog, Sheet, Page, or an approved contextual dialog",
    allowlist: {
      "apps/web/app/(protected)/branches/network-config-dialog.tsx": 1,
      "apps/web/app/(protected)/br/[branchId]/pos/_components/bill/bill-receipt-sheet.tsx": 1,
      "apps/web/app/(protected)/br/[branchId]/pos/_components/order-detail/transfer-table-dialog.tsx": 1,
      "apps/web/app/(protected)/hr/attendance-table.tsx": 1,
      "apps/web/app/(protected)/inventory/count-assignments/count-assignments-client.tsx": 1,
      "apps/web/app/(protected)/inventory/production-order-list.tsx": 1,
      "apps/web/app/(protected)/menu/item-detail-dialog.tsx": 1,
      "apps/web/app/components/form/form-dialog.tsx": 1,
      "apps/web/app/components/pwa-install-help-dialog.tsx": 1,
    },
  },
  {
    id: "raw-alert-dialog-import-file-baseline",
    component: "alert-dialog",
    label: "AlertDialog",
    replacement:
      "confirm(), FormDialog with reason input, or an approved destructive flow",
    allowlist: {},
  },
];

for (const check of textChecks) {
  const filePath = path.join(REPO_ROOT, check.file);
  if (!fs.existsSync(filePath)) {
    failures.push(`${check.id}: ${check.file} is missing`);
    continue;
  }

  const content = fs.readFileSync(filePath, "utf8");
  for (const expected of check.includes) {
    if (!content.includes(expected)) {
      failures.push(`${check.id}: ${check.file} is missing "${expected}"`);
    }
  }
}

for (const check of forbiddenTextChecks) {
  for (const file of check.files) {
    const filePath = path.join(REPO_ROOT, file);
    if (!fs.existsSync(filePath)) continue;
    const content = fs.readFileSync(filePath, "utf8");
    const matches = [...content.matchAll(check.pattern)];
    if (matches.length > 0) {
      failures.push(
        `${check.id}: ${file} has stale term(s): ${[
          ...new Set(matches.map((match) => match[0])),
        ].join(", ")}`,
      );
    }
  }
}

for (const check of countBudgets) {
  let count = 0;

  for (const root of check.roots) {
    for (const filePath of walkFiles(root.dir, root.extensions)) {
      const content = fs.readFileSync(filePath, "utf8");
      count += countMatches(content, check.pattern);
    }
  }

  if (count > check.maxCount) {
    failures.push(
      `${check.id}: ${count} hit(s), allowed ${check.maxCount}. ${check.description}`,
    );
  }
}

for (const check of perFileCountBudgets) {
  const seen = new Map();

  for (const root of check.roots) {
    for (const filePath of walkFiles(root.dir, root.extensions)) {
      const normalized = toPosix(filePath);
      const content = fs.readFileSync(filePath, "utf8");
      const count = countMatches(content, check.pattern);
      if (count === 0) continue;
      seen.set(normalized, (seen.get(normalized) ?? 0) + count);
    }
  }

  for (const [filePath, count] of seen) {
    const allowed = check.allowlist[filePath] ?? 0;
    if (count > allowed) {
      failures.push(
        `${check.id}: ${filePath} has ${count} hit(s), allowed ${allowed}. ${check.description}`,
      );
    }
  }
}

for (const gate of frozenPrimitiveImportBaselines) {
  const pattern = new RegExp(
    `from\\s+["@']@comtammatu/ui/components/${gate.component}["@']`,
    "g",
  );

  for (const filePath of walkFiles("apps/web/app", [".tsx"])) {
    const normalized = toPosix(filePath);
    const content = fs.readFileSync(filePath, "utf8");
    const count = countMatches(content, pattern);
    if (count === 0) continue;

    const allowed = gate.allowlist[normalized] ?? 0;
    if (count > allowed) {
      failures.push(
        `${gate.id}: ${normalized} imports raw ${gate.label} primitive ${count} time(s), allowed ${allowed}. Use ${gate.replacement}; expanding this per-file baseline needs a design-system contract reason.`,
      );
    }
  }
}

for (const check of checks) {
  const seen = new Map();

  for (const root of check.roots) {
    for (const filePath of walkFiles(root.dir, root.extensions)) {
      const normalized = toPosix(filePath);
      const content = fs.readFileSync(filePath, "utf8");
      const count = countMatches(content, check.pattern);
      if (count === 0) continue;
      seen.set(normalized, (seen.get(normalized) ?? 0) + count);
    }
  }

  for (const [filePath, count] of seen) {
    const allowed = check.allowlist[filePath] ?? 0;
    if (count > allowed) {
      failures.push(
        `${check.id}: ${filePath} has ${count} hit(s), allowed ${allowed}`,
      );
    }
  }
}

for (const filePath of walkFiles("apps/web/app", [".tsx"])) {
  const normalized = toPosix(filePath);
  if (!normalized.endsWith("-shell.tsx")) continue;
  if (!SHELL_REGISTRY_BASELINE.has(normalized)) {
    failures.push(
      `shell-registry: ${normalized} is a new *-shell.tsx outside the frozen baseline (design-system.md § B / D019). Mount one of the two chrome families instead of inventing a third shell; expanding the baseline needs an owner decision.`,
    );
  }
}

// header-lockup-registry (D058 W2, design-system.md § B): a direct
// BrandLogoBox/BrandMark caller outside the frozen baseline means a new
// hand-rolled header lockup instead of consuming the shared AppHeader.
for (const filePath of walkFiles("apps/web/app", [".tsx"])) {
  const normalized = toPosix(filePath);
  if (normalized === "apps/web/app/components/brand.tsx") continue;
  const content = fs.readFileSync(filePath, "utf8");
  if (!/\b(?:BrandLogoBox|BrandMark)\b/.test(content)) continue;
  if (!HEADER_LOCKUP_REGISTRY_BASELINE.has(normalized)) {
    failures.push(
      `header-lockup-registry: ${normalized} renders BrandLogoBox/BrandMark directly outside the frozen baseline (design-system.md § B / D058 W2). Consume the shared AppHeader primitive instead of a new hand-rolled header lockup; expanding the baseline needs an owner decision.`,
    );
  }
}

// route-manifest (Stage 0, design-system.md § C/D / D019): every protected page
// resolves to exactly one MODULE_ACL family, and every family-root has a
// landing page. Keeps the route tree inside the declared taxonomy so a new
// route cannot escape the family/nav contract. ACL paths are read live from
// the SSoT so the gate never drifts from the access map.
const MODULE_ACL_SOURCE = "packages/shared/src/auth/module-acl.ts";
const ACL_PATHS = [
  ...fs
    .readFileSync(path.join(REPO_ROOT, MODULE_ACL_SOURCE), "utf8")
    .matchAll(/\bpath:\s*"([^"]+)"/g),
].map((match) => match[1]);

// Redirect shims legitimately resolve to no family (they only call redirect()).
const ROUTE_MANIFEST_SHIM_ROUTES = new Set([
  "/admin",
  "/admin/finance/[[...slug]]",
  "/admin/reports",
  "/admin/reports/stock-movement",
  "/admin/reports/inventory-value",
]);
// ACL family roots without a landing page still resolve through shared ACL.
const ROUTE_MANIFEST_NO_PAGE_ACL = new Set(["/admin/inventory"]);

function routePathFromPageFile(normalizedFile) {
  const segments = normalizedFile
    .replace(/^apps\/web\/app/, "")
    .replace(/\/page\.tsx$/, "")
    .split("/")
    .filter(
      (segment) =>
        segment && !(segment.startsWith("(") && segment.endsWith(")")),
    );
  const route = "/" + segments.join("/");
  return route.replace(/\/\[branchId\](?=\/|$)/g, "/*") || "/";
}

function resolveFamilyPath(route) {
  let best = null;
  for (const aclPath of ACL_PATHS) {
    if (route === aclPath || route.startsWith(aclPath + "/")) {
      if (best === null || aclPath.length > best.length) best = aclPath;
    }
  }
  return best;
}

const protectedPages = walkFiles("apps/web/app/(protected)", [".tsx"])
  .map(toPosix)
  .filter((file) => file.endsWith("/page.tsx"));
const landingRouteSet = new Set(protectedPages.map(routePathFromPageFile));

for (const file of protectedPages) {
  const route = routePathFromPageFile(file);
  if (!resolveFamilyPath(route) && !ROUTE_MANIFEST_SHIM_ROUTES.has(route)) {
    failures.push(
      `route-manifest: ${file} (${route}) resolves to no MODULE_ACL family. Place it under a declared family in ${MODULE_ACL_SOURCE} or make it a redirect shim (design-system.md § C / D019).`,
    );
  }
}

// raw-empty-import-route-code: app routes use AppEmptyState/TableEmptyStateRow
// adapters. The raw Empty primitive is reserved for adapter implementations and
// explicitly approved shell layers so route-local markup cannot fork empty-state
// behavior.
const RAW_EMPTY_IMPORT_ALLOWLIST = new Set([
  "apps/web/app/components/surface.tsx",
]);
for (const filePath of walkFiles("apps/web/app", [".tsx"])) {
  const normalized = toPosix(filePath);
  if (RAW_EMPTY_IMPORT_ALLOWLIST.has(normalized)) continue;
  const content = fs.readFileSync(filePath, "utf8");
  if (content.includes('"@comtammatu/ui/components/empty"')) {
    failures.push(
      `raw-empty-import-route-code: ${normalized} imports raw Empty primitives. Use AppEmptyState or TableEmptyStateRow; raw Empty* is reserved for approved wrappers (design-system.md Empty / Confirm).`,
    );
  }
}

// form-dialog-crud-wrapper: simple CRUD RHF dialogs use FormDialog so pending,
// reset, server-error, footer, and submit vocabulary stay consistent.
const FORM_DIALOG_CRUD_ALLOWLIST = {};
for (const filePath of walkFiles("apps/web/app/(protected)", [".tsx"])) {
  const normalized = toPosix(filePath);
  const content = fs.readFileSync(filePath, "utf8");
  const hasRHFZodDialog =
    content.includes("zodResolver") &&
    /\buseForm\s*</.test(content) &&
    extractJsxOpeningTags(content, "Dialog").length > 0;
  if (!hasRHFZodDialog || /\bFormDialog\b/.test(content)) continue;
  if (FORM_DIALOG_CRUD_ALLOWLIST[normalized]) continue;
  failures.push(
    `form-dialog-crud-wrapper: ${normalized} uses <Dialog> + useForm + zodResolver without FormDialog. Use apps/web/app/components/form/FormDialog or add a documented non-CRUD allowlist reason.`,
  );
}

for (const aclPath of ACL_PATHS) {
  if (ROUTE_MANIFEST_NO_PAGE_ACL.has(aclPath)) continue;
  if (!landingRouteSet.has(aclPath)) {
    failures.push(
      `route-manifest: MODULE_ACL family-root ${aclPath} has no landing page.tsx — nav can point at it but nothing renders (design-system.md § D / D019).`,
    );
  }
}

const seenAclPaths = new Set();
for (const aclPath of ACL_PATHS) {
  if (seenAclPaths.has(aclPath)) {
    failures.push(
      `route-manifest: duplicate MODULE_ACL path ${aclPath}; one capability = one route home (design-system.md § C / D019).`,
    );
  }
  seenAclPaths.add(aclPath);
}

// page-padding (Stage 0, design-system.md § E / D019): outer page padding is
// owned by AppPage. A page.tsx that composes its own centered, padded outer
// container (max-w-* + p-*) is an ad-hoc AppPage clone and fails CI. Route
// page spacing through AppPage density.
const PAGE_PADDING_BASELINE = {};
const PAGE_PADDING_TOKEN = /(?<![\w-])(?:(?:sm|md|lg|xl|2xl):)?p[xy]?-\d/;
for (const file of walkFiles("apps/web/app", [".tsx"])) {
  const normalized = toPosix(file);
  if (!normalized.endsWith("/page.tsx")) continue;
  const content = fs.readFileSync(file, "utf8");
  let count = 0;
  for (const match of content.matchAll(/className="([^"]*)"/g)) {
    const cls = match[1];
    if (/\bmax-w-/.test(cls) && PAGE_PADDING_TOKEN.test(cls)) count++;
  }
  const allowed = PAGE_PADDING_BASELINE[normalized] ?? 0;
  if (count > allowed) {
    failures.push(
      `page-padding: ${normalized} composes ${count} ad-hoc page container(s) (max-w + padding), allowed ${allowed}. Outer page padding is owned by AppPage (design-system.md § E / D019).`,
    );
  }
}

// button-height-on-button (D030): the touch-height ratchet is scoped to action
// elements (<Button>/<TouchButton>/<button>/<Link>). A raw h-10..h-44 or
// min-h-12..min-h-24 on an action is height drift that should use a size
// variant; raw heights on
// non-button elements (Input/Select/Skeleton/layout containers) are out of
// scope by design (design-system.md § Enforcement Status — the old "any raw
// height" gate was ~37 non-button false-positives). The tag scanner is
// brace/string-aware, so cn() and multi-line className props are covered. The
// baseline = form-control trigger buttons (40px field row) plus a few bespoke
// single-use tap tiles (≥h-20) that do not warrant a shared size variant.
const BUTTON_HEIGHT_BASELINE = {
  "apps/web/app/components/form/business-date-field.tsx": 1,
  "apps/web/app/components/form/combobox.tsx": 1,
  "apps/web/app/components/form/multi-select-combobox.tsx": 1,
  "apps/web/app/(protected)/br/[branchId]/pos/_components/cart-pane.tsx": 1,
  "apps/web/app/(protected)/br/[branchId]/pos/_components/order-detail/order-item-row.tsx": 1,
};
const BUTTON_HEIGHT_TOKEN =
  /\b(?:h-(?:10|11|12|14|16|20|24|28|32|36|40|44)|min-h-(?:12|14|16|20|24))\b/;
for (const filePath of walkFiles("apps/web/app", [".tsx"])) {
  const normalized = toPosix(filePath);
  const content = fs.readFileSync(filePath, "utf8");
  let count = 0;
  for (const tagName of ["Button", "TouchButton", "button", "Link"]) {
    for (const tag of extractJsxOpeningTags(content, tagName)) {
      if (BUTTON_HEIGHT_TOKEN.test(tag)) count += 1;
    }
  }
  const allowed = BUTTON_HEIGHT_BASELINE[normalized] ?? 0;
  if (count > allowed) {
    failures.push(
      `button-height-on-button: ${normalized} has ${count} action raw height(s), allowed ${allowed}. Use a Button size variant; non-action heights are out of scope (design-system.md § Enforcement Status / D030).`,
    );
  }
}

// ---------------------------------------------------------------------------
// --write (ratchet) mode: lower the count-budget baselines to the current
// actuals. NEVER raises a number. The script file is the single source of truth
// for these baselines, so the updated literals are written back in place; only
// the `maxCount:`/`allowlist:` values of count-budget gates change. Gate ids,
// patterns, roots, Mode-A zero-allowlist gates, and every non-count-budget gate
// are left byte-for-byte untouched, and normal-mode behavior above is unchanged.
// ---------------------------------------------------------------------------

// Actual per-file counts for a perFileCountBudgets / frozenPrimitiveImportBaselines
// style gate (the loops above already proved this matches the live check logic).
function computePerFileActuals(roots, pattern) {
  const seen = new Map();
  for (const root of roots) {
    for (const filePath of walkFiles(root.dir, root.extensions)) {
      const normalized = toPosix(filePath);
      const content = fs.readFileSync(filePath, "utf8");
      const count = countMatches(content, pattern);
      if (count === 0) continue;
      seen.set(normalized, (seen.get(normalized) ?? 0) + count);
    }
  }
  return seen;
}

function computeTotalActual(roots, pattern) {
  let count = 0;
  for (const root of roots) {
    for (const filePath of walkFiles(root.dir, root.extensions)) {
      const content = fs.readFileSync(filePath, "utf8");
      count += countMatches(content, pattern);
    }
  }
  return count;
}

// Ratchet a {file:count} allowlist downward: keep only files still present in
// the old allowlist, drop entries whose actual is 0, and set each surviving
// entry to min(oldAllowed, actual). Files not in the old allowlist are never
// added (their budget stays the implicit 0 the gate already enforces).
function ratchetAllowlist(oldAllowlist, actuals) {
  const next = {};
  for (const [file, oldAllowed] of Object.entries(oldAllowlist)) {
    const actual = actuals.get(file) ?? 0;
    if (actual <= 0) continue;
    next[file] = Math.min(oldAllowed, actual);
  }
  return next;
}

// Locate the source span of a value literal for `key` inside the gate object
// identified by `id`, within the array literal assigned to `varName`. Returns
// { valueStart, valueEnd, indent } or null. Brace/bracket/string aware so an
// allowlist object value is captured whole. Only used by --write.
function locateGateValueSpan(source, varName, id, key) {
  const arrAnchor = source.indexOf(`const ${varName} = [`);
  if (arrAnchor === -1) return null;
  const idAnchor = source.indexOf(`id: "${id}"`, arrAnchor);
  if (idAnchor === -1) return null;

  const keyAnchor = source.indexOf(`${key}:`, idAnchor);
  if (keyAnchor === -1) return null;
  // Guard: the key must belong to this gate, i.e. appear before the next `id: "`.
  const nextId = source.indexOf(`id: "`, idAnchor + 1);
  if (nextId !== -1 && keyAnchor > nextId) return null;

  const lineStart = source.lastIndexOf("\n", keyAnchor) + 1;
  const indent = source.slice(lineStart, keyAnchor);

  let i = keyAnchor + key.length + 1;
  while (i < source.length && (source[i] === " " || source[i] === "\t")) i += 1;
  const valueStart = i;

  if (source[i] === "{" || source[i] === "[") {
    const open = source[i];
    const close = open === "{" ? "}" : "]";
    let depth = 0;
    let inString = null;
    for (; i < source.length; i += 1) {
      const ch = source[i];
      if (inString) {
        if (ch === inString && source[i - 1] !== "\\") inString = null;
      } else if (ch === '"' || ch === "'" || ch === "`") {
        inString = ch;
      } else if (ch === open) depth += 1;
      else if (ch === close) {
        depth -= 1;
        if (depth === 0) {
          i += 1;
          break;
        }
      }
    }
    return { valueStart, valueEnd: i, indent };
  }

  // Scalar value (a number, for maxCount): read up to the next comma/newline.
  while (i < source.length && source[i] !== "," && source[i] !== "\n") i += 1;
  return { valueStart, valueEnd: i, indent };
}

function serializeAllowlist(allowlist, indent) {
  const entries = Object.entries(allowlist);
  if (entries.length === 0) return "{}";
  const inner = `${indent}  `;
  const lines = entries.map(
    ([file, count]) => `${inner}${JSON.stringify(file)}: ${count},`,
  );
  return `{\n${lines.join("\n")}\n${indent}}`;
}

// Locate the source span of the initializer value for a bare top-level
// `const varName = <object-or-Set-literal>` declaration (as opposed to a
// per-gate `key:` inside an array of gate objects — see locateGateValueSpan
// above). Brace/bracket/string aware so a `{...}` or `new Set([...])` value is
// captured whole. Only used by --write.
function locateConstValueSpan(source, varName) {
  const declAnchor = source.indexOf(`const ${varName} = `);
  if (declAnchor === -1) return null;

  const lineStart = source.lastIndexOf("\n", declAnchor) + 1;
  const indent = source.slice(lineStart, declAnchor);

  let i = declAnchor + `const ${varName} = `.length;
  const valueStart = i;

  // Skip an optional `new Set(` wrapper so the balanced scan below covers the
  // `[...]` array literal, then re-include the wrapper in the returned span.
  const setWrapper = "new Set(";
  const hasSetWrapper = source.startsWith(setWrapper, i);
  if (hasSetWrapper) i += setWrapper.length;

  if (source[i] !== "{" && source[i] !== "[") return null;
  const open = source[i];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inString = null;
  for (; i < source.length; i += 1) {
    const ch = source[i];
    if (inString) {
      if (ch === inString && source[i - 1] !== "\\") inString = null;
    } else if (ch === '"' || ch === "'" || ch === "`") {
      inString = ch;
    } else if (ch === open) depth += 1;
    else if (ch === close) {
      depth -= 1;
      if (depth === 0) {
        i += 1;
        break;
      }
    }
  }
  if (hasSetWrapper) {
    if (source[i] !== ")") return null;
    i += 1;
  }

  return { valueStart, valueEnd: i, indent };
}

function serializeSet(set, indent) {
  const entries = [...set];
  if (entries.length === 0) return "new Set([])";
  const inner = `${indent}  `;
  const lines = entries.map((file) => `${inner}${JSON.stringify(file)},`);
  return `new Set([\n${lines.join("\n")}\n${indent}])`;
}

if (WRITE_MODE) {
  let source = fs.readFileSync(SELF_PATH, "utf8");
  // Collect edits as {start, end, text} then apply right-to-left so earlier
  // offsets stay valid.
  const edits = [];
  const ratchetSummary = [];

  // checks + perFileCountBudgets + frozenPrimitiveImportBaselines: ratchet
  // `allowlist`.
  const allowlistGates = [
    ...checks.map((gate) => ({
      varName: "checks",
      id: gate.id,
      oldAllowlist: gate.allowlist,
      actuals: computePerFileActuals(gate.roots, gate.pattern),
    })),
    ...perFileCountBudgets.map((gate) => ({
      varName: "perFileCountBudgets",
      id: gate.id,
      oldAllowlist: gate.allowlist,
      actuals: computePerFileActuals(gate.roots, gate.pattern),
    })),
    ...frozenPrimitiveImportBaselines.map((gate) => {
      const pattern = new RegExp(
        `from\\s+["@']@comtammatu/ui/components/${gate.component}["@']`,
        "g",
      );
      return {
        varName: "frozenPrimitiveImportBaselines",
        id: gate.id,
        oldAllowlist: gate.allowlist,
        actuals: computePerFileActuals(
          [{ dir: "apps/web/app", extensions: [".tsx"] }],
          pattern,
        ),
      };
    }),
  ];

  for (const gate of allowlistGates) {
    const oldTotal = Object.values(gate.oldAllowlist).reduce(
      (a, b) => a + b,
      0,
    );
    const next = ratchetAllowlist(gate.oldAllowlist, gate.actuals);
    const newTotal = Object.values(next).reduce((a, b) => a + b, 0);
    const span = locateGateValueSpan(
      source,
      gate.varName,
      gate.id,
      "allowlist",
    );
    if (!span) {
      console.error(`--write: could not locate allowlist for ${gate.id}`);
      process.exit(1);
    }
    const serialized = serializeAllowlist(next, span.indent);
    if (source.slice(span.valueStart, span.valueEnd) !== serialized) {
      edits.push({
        start: span.valueStart,
        end: span.valueEnd,
        text: serialized,
      });
    }
    ratchetSummary.push({ id: gate.id, oldTotal, newTotal });
  }

  // countBudgets: ratchet `maxCount`.
  for (const gate of countBudgets) {
    const actualTotal = computeTotalActual(gate.roots, gate.pattern);
    const newMax = Math.min(gate.maxCount, actualTotal);
    const span = locateGateValueSpan(
      source,
      "countBudgets",
      gate.id,
      "maxCount",
    );
    if (!span) {
      console.error(`--write: could not locate maxCount for ${gate.id}`);
      process.exit(1);
    }
    const serialized = String(newMax);
    if (source.slice(span.valueStart, span.valueEnd) !== serialized) {
      edits.push({
        start: span.valueStart,
        end: span.valueEnd,
        text: serialized,
      });
    }
    ratchetSummary.push({
      id: gate.id,
      oldTotal: gate.maxCount,
      newTotal: newMax,
    });
  }

  // BUTTON_HEIGHT_BASELINE: bare `{file: count}` const, actuals computed the
  // same JSX-tag-aware way as the button-height-on-button check above.
  {
    const actuals = new Map();
    for (const filePath of walkFiles("apps/web/app", [".tsx"])) {
      const normalized = toPosix(filePath);
      const content = fs.readFileSync(filePath, "utf8");
      let count = 0;
      for (const tagName of ["Button", "TouchButton", "button", "Link"]) {
        for (const tag of extractJsxOpeningTags(content, tagName)) {
          if (BUTTON_HEIGHT_TOKEN.test(tag)) count += 1;
        }
      }
      if (count > 0) actuals.set(normalized, count);
    }
    const oldTotal = Object.values(BUTTON_HEIGHT_BASELINE).reduce(
      (a, b) => a + b,
      0,
    );
    const next = ratchetAllowlist(BUTTON_HEIGHT_BASELINE, actuals);
    const newTotal = Object.values(next).reduce((a, b) => a + b, 0);
    const span = locateConstValueSpan(source, "BUTTON_HEIGHT_BASELINE");
    if (!span) {
      console.error("--write: could not locate BUTTON_HEIGHT_BASELINE");
      process.exit(1);
    }
    const serialized = serializeAllowlist(next, span.indent);
    if (source.slice(span.valueStart, span.valueEnd) !== serialized) {
      edits.push({
        start: span.valueStart,
        end: span.valueEnd,
        text: serialized,
      });
    }
    ratchetSummary.push({
      id: "button-height-baseline",
      oldTotal,
      newTotal,
    });
  }

  // RAW_EMPTY_IMPORT_ALLOWLIST: bare `new Set([...])` const of exempted
  // files. Ratchet-down = drop members that no longer import raw Empty.
  {
    const stillOffending = new Set();
    for (const file of RAW_EMPTY_IMPORT_ALLOWLIST) {
      const filePath = path.join(REPO_ROOT, file);
      if (!fs.existsSync(filePath)) continue;
      const content = fs.readFileSync(filePath, "utf8");
      if (content.includes('"@comtammatu/ui/components/empty"')) {
        stillOffending.add(file);
      }
    }
    const oldTotal = RAW_EMPTY_IMPORT_ALLOWLIST.size;
    const newTotal = stillOffending.size;
    const span = locateConstValueSpan(source, "RAW_EMPTY_IMPORT_ALLOWLIST");
    if (!span) {
      console.error("--write: could not locate RAW_EMPTY_IMPORT_ALLOWLIST");
      process.exit(1);
    }
    const serialized = serializeSet(stillOffending, span.indent);
    if (source.slice(span.valueStart, span.valueEnd) !== serialized) {
      edits.push({
        start: span.valueStart,
        end: span.valueEnd,
        text: serialized,
      });
    }
    ratchetSummary.push({
      id: "raw-empty-import-allowlist",
      oldTotal,
      newTotal,
    });
  }

  // FORM_DIALOG_CRUD_ALLOWLIST: bare `{file: reason}` const. Ratchet-down =
  // drop members that no longer trip the RHF+Zod+Dialog-without-FormDialog
  // condition (the same detection the check loop above uses).
  {
    const stillOffending = {};
    for (const filePath of walkFiles("apps/web/app/(protected)", [".tsx"])) {
      const normalized = toPosix(filePath);
      const oldReason = FORM_DIALOG_CRUD_ALLOWLIST[normalized];
      if (!oldReason) continue;
      const content = fs.readFileSync(filePath, "utf8");
      const hasRHFZodDialog =
        content.includes("zodResolver") &&
        /\buseForm\s*</.test(content) &&
        extractJsxOpeningTags(content, "Dialog").length > 0;
      if (hasRHFZodDialog && !/\bFormDialog\b/.test(content)) {
        stillOffending[normalized] = oldReason;
      }
    }
    const oldTotal = Object.keys(FORM_DIALOG_CRUD_ALLOWLIST).length;
    const newTotal = Object.keys(stillOffending).length;
    const span = locateConstValueSpan(source, "FORM_DIALOG_CRUD_ALLOWLIST");
    if (!span) {
      console.error("--write: could not locate FORM_DIALOG_CRUD_ALLOWLIST");
      process.exit(1);
    }
    const entries = Object.entries(stillOffending);
    const serialized =
      entries.length === 0
        ? "{}"
        : `{\n${entries
            .map(
              ([file, reason]) =>
                `${span.indent}  ${JSON.stringify(file)}:\n${span.indent}    ${JSON.stringify(reason)},`,
            )
            .join("\n")}\n${span.indent}}`;
    if (source.slice(span.valueStart, span.valueEnd) !== serialized) {
      edits.push({
        start: span.valueStart,
        end: span.valueEnd,
        text: serialized,
      });
    }
    ratchetSummary.push({
      id: "form-dialog-crud-allowlist",
      oldTotal,
      newTotal,
    });
  }

  // PAGE_PADDING_BASELINE: bare `{file: count}` const, actuals computed the
  // same way as the page-padding check above.
  {
    const actuals = new Map();
    for (const file of walkFiles("apps/web/app", [".tsx"])) {
      const normalized = toPosix(file);
      if (!normalized.endsWith("/page.tsx")) continue;
      const content = fs.readFileSync(file, "utf8");
      let count = 0;
      for (const match of content.matchAll(/className="([^"]*)"/g)) {
        const cls = match[1];
        if (/\bmax-w-/.test(cls) && PAGE_PADDING_TOKEN.test(cls)) count++;
      }
      if (count > 0) actuals.set(normalized, count);
    }
    const oldTotal = Object.values(PAGE_PADDING_BASELINE).reduce(
      (a, b) => a + b,
      0,
    );
    const next = ratchetAllowlist(PAGE_PADDING_BASELINE, actuals);
    const newTotal = Object.values(next).reduce((a, b) => a + b, 0);
    const span = locateConstValueSpan(source, "PAGE_PADDING_BASELINE");
    if (!span) {
      console.error("--write: could not locate PAGE_PADDING_BASELINE");
      process.exit(1);
    }
    const serialized = serializeAllowlist(next, span.indent);
    if (source.slice(span.valueStart, span.valueEnd) !== serialized) {
      edits.push({
        start: span.valueStart,
        end: span.valueEnd,
        text: serialized,
      });
    }
    ratchetSummary.push({
      id: "page-padding-baseline",
      oldTotal,
      newTotal,
    });
  }

  edits.sort((a, b) => b.start - a.start);
  for (const edit of edits) {
    source = source.slice(0, edit.start) + edit.text + source.slice(edit.end);
  }

  if (edits.length > 0) {
    fs.writeFileSync(SELF_PATH, source);
  }

  console.log(
    edits.length > 0
      ? `UI contract ratchet: lowered ${edits.length} baseline(s).`
      : "UI contract ratchet: no change (already at actuals).",
  );
  for (const row of ratchetSummary) {
    if (row.oldTotal !== row.newTotal) {
      console.log(`  ${row.id}: ${row.oldTotal} -> ${row.newTotal}`);
    }
  }
  process.exit(0);
}

if (failures.length > 0) {
  console.error("UI contract check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("UI contract check: baseline không tăng.");
