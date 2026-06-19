import fs from "node:fs";
import path from "node:path";

const REPO_ROOT = process.cwd();

function walkFiles(rootDir, extensions) {
  const absoluteRoot = path.join(REPO_ROOT, rootDir);
  if (!fs.existsSync(absoluteRoot)) return [];

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
      "Primitive overlays cap at shadow-md for popover/menu/select/chart tooltip and shadow-lg for modal/sheet surfaces.",
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
        dir: "apps/web/app/(protected)/br/[branchId]/settings",
        extensions: [".tsx"],
      },
	    ],
	    pattern: /from\s+["@']@comtammatu\/ui\/components\/table["@']/g,
	    allowlist: {},
	  },
	  {
	    id: "admin-finance-branch-raw-card-import",
	    description:
      "Admin, Finance, and Branch Settings page surfaces use AppSection/KpiCard/approved adapters; raw Card imports are frozen baseline debt.",
    roots: [
      { dir: "apps/web/app/(protected)/admin", extensions: [".tsx"] },
      { dir: "apps/web/app/(protected)/finance", extensions: [".tsx"] },
      {
        dir: "apps/web/app/(protected)/branch-settings",
        extensions: [".tsx"],
      },
      {
        dir: "apps/web/app/(protected)/br/[branchId]/settings",
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
        dir: "apps/web/app/(protected)/br/[branchId]/settings",
        extensions: [".tsx"],
      },
    ],
    pattern:
      /<SelectTrigger\b[^>]*className=["'][^"']*\b(?:h-9|w-36|w-44|w-45)\b/g,
    allowlist: {
      "apps/web/app/(protected)/admin/reports/stock-movement/stock-movement-client.tsx": 1,
      "apps/web/app/(protected)/admin/staff/staff-filters.tsx": 2,
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
      // SSoT registry + exceptions documented in design-system.md
      // "Status vocabulary": status-badge.tsx is the registry itself;
      // kds/lib/status-config.ts is the hot path; inventory/_lib/ui.ts is the
      // per-entity re-model deferred to a later wave.
      "apps/web/app/components/status-badge.tsx": 1,
      "apps/web/app/(protected)/br/[branchId]/kds/lib/status-config.ts": 1,
      "apps/web/app/(protected)/inventory/_lib/ui.ts": 1,
      // Page-local STATUS* maps frozen at baseline (W1 status-registry
      // burn-down); the un-blinded regex now also blocks new STATUS-first names.
      "apps/web/app/(protected)/admin/settings/printers/jobs/page.tsx": 1,
      "apps/web/app/(protected)/branch-settings/_shared/tables/constants.ts": 1,
      "apps/web/app/(protected)/br/[branchId]/kds/actions.ts": 1,
      "apps/web/app/(protected)/br/[branchId]/kds/hooks/use-kds-realtime.ts": 2,
      "apps/web/app/(protected)/br/[branchId]/kds/page.tsx": 2,
      "apps/web/app/(protected)/br/[branchId]/pos/order-history.tsx": 1,
      "apps/web/app/(protected)/br/[branchId]/runner/page.tsx": 1,
      "apps/web/app/(protected)/employee/leave/leave-client.tsx": 1,
      "apps/web/app/(protected)/employee/payslip/payslip-client.tsx": 1,
      "apps/web/app/(protected)/employee/schedule/schedule-client.tsx": 2,
      "apps/web/app/(protected)/hr/attendance-table.tsx": 2,
      "apps/web/app/(protected)/hr/leave-requests-table.tsx": 1,
      "apps/web/app/(protected)/inventory/issues/issues-client.tsx": 1,
      "apps/web/app/(protected)/inventory/purchase-orders/purchase-orders-client.tsx": 1,
      "apps/web/app/(protected)/inventory/stock/stock-client.tsx": 1,
      "apps/web/app/(protected)/inventory/supplier-invoices/supplier-invoices-client.tsx": 2,
      // Multi-line-typed STATUS* maps surfaced by the hardened regex: these are
      // variant/tone maps (or label+variant maps already sourced from
      // @comtammatu/shared *_STATUS_LABELS_VI), not new label duplication.
      // Folding the variants into status-badge.tsx domains is a later wave.
      "apps/web/app/(protected)/hr/payroll/payroll-list-client.tsx": 1,
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
      "apps/web/app/(protected)/admin/dashboard/page.tsx": 2,
      "apps/web/app/(protected)/admin/reports/stock-movement/stock-movement-client.tsx": 1,
      "apps/web/app/(protected)/br/[branchId]/pos/_components/bill/bill-receipt-summary.tsx": 1,
      "apps/web/app/(protected)/br/[branchId]/runner/page.tsx": 1,
      "apps/web/app/(protected)/finance/_lib/finance-cockpit.ts": 2,
      "apps/web/app/(protected)/finance/components/work-queue-strip.tsx": 1,
      "apps/web/app/(protected)/finance/food-cost/food-cost-client.tsx": 1,
      "apps/web/app/(protected)/finance/page.tsx": 2,
      "apps/web/app/(protected)/finance/revenue/[date]/page.tsx": 2,
      "apps/web/app/(protected)/finance/revenue/revenue-charts-internal.tsx": 2,
      "apps/web/app/(protected)/finance/revenue/revenue-client.tsx": 9,
      "apps/web/app/(protected)/hr/payroll/[periodId]/payroll-detail-client.tsx": 1,
      "apps/web/app/(protected)/inventory/_components/audit-history-list.tsx": 1,
      "apps/web/app/(protected)/inventory/_components/auto-approve-eval-panel.tsx": 2,
      "apps/web/app/(protected)/inventory/_lib/format.ts": 2,
      "apps/web/app/(protected)/inventory/grn/[id]/grn-detail-client.tsx": 1,
      "apps/web/app/(protected)/inventory/ingredient-table.tsx": 1,
      "apps/web/app/(protected)/inventory/ingredients/ingredients-client.tsx": 1,
      "apps/web/app/(protected)/inventory/production-order-list.tsx": 1,
      "apps/web/app/(protected)/inventory/purchase-orders/new/new-po-client.tsx": 16,
    },
  },
  {
    id: "stat-card-ssot",
    description:
      "KPI/stat metric cards are single-sourced in apps/web/app/components/kpi/; page-local StatCard/SummaryCard/MetricCard definitions must not spread.",
    roots: [{ dir: "apps/web/app", extensions: [".tsx"] }],
    pattern:
      /\b(?:function|const)\s+\w*(?:StatCard|SummaryCard|MetricCard|KpiCard)\b/g,
    allowlist: {
      "apps/web/app/(protected)/hr/payroll/[periodId]/payroll-detail-client.tsx": 1,
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
      "apps/web/app/(protected)/br/[branchId]/pos/_components/bill/bill-receipt-sheet.tsx": 1,
      "apps/web/app/(protected)/br/[branchId]/pos/pos-desktop-shell.tsx": 3,
      "apps/web/app/(protected)/inventory/_components/inventory-shell.tsx": 2,
      "apps/web/app/(protected)/inventory/dashboard-client.tsx": 2,
      "apps/web/app/(protected)/inventory/grn/[id]/grn-detail-client.tsx": 2,
      "apps/web/app/(protected)/inventory/grn/grn-list-client.tsx": 2,
      "apps/web/app/(protected)/inventory/grn/new/[supplierId]/grn-create-client.tsx": 2,
      "apps/web/app/(protected)/inventory/ingredients/ingredients-client.tsx": 2,
      "apps/web/app/(protected)/inventory/inventory-value-panel.tsx": 2,
      "apps/web/app/(protected)/inventory/issues/issues-client.tsx": 2,
      "apps/web/app/(protected)/inventory/purchase-orders/new/new-po-client.tsx": 2,
      "apps/web/app/(protected)/inventory/receiving/receiving-client.tsx": 2,
      "apps/web/app/(protected)/inventory/stock/stock-client.tsx": 2,
      "apps/web/app/(protected)/inventory/stocktake/[id]/stocktake-detail-client.tsx": 2,
      "apps/web/app/_components/responsive-toaster.tsx": 2,
      "apps/web/app/components/data-table/data-table-toolbar.tsx": 2,
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
      "apps/web/app/components/app-shell.tsx": 1,
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
      "Hover elevation caps at the shadow-sm Hover rung; hover:shadow-md/lg/xl/2xl is an over-elevated rung (design-system.md § Elevation / Shadow).",
    roots: [{ dir: "apps/web/app", extensions: [".tsx"] }],
    pattern:
      /className=\{?(?:cn\()?['"][^'"]*\bhover:shadow-(?:md|lg|xl|2xl)\b/g,
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
      "apps/web/app/components/workspace-bottom-nav.tsx": 2,
      "apps/web/app/(public)/access-denied/page.tsx": 1,
      "apps/web/app/(public)/(auth)/login/page.tsx": 1,
      "apps/web/app/(protected)/employee/schedule/schedule-client.tsx": 1,
      "apps/web/app/(protected)/employee/components/bottom-nav.tsx": 2,
      "apps/web/app/(protected)/br/[branchId]/runner/page.tsx": 1,
      "apps/web/app/(protected)/br/[branchId]/runner/runner-idle-visual.tsx": 2,
      "apps/web/app/(protected)/br/[branchId]/pos/pos-desktop-shell.tsx": 2,
      "apps/web/app/(protected)/br/[branchId]/pos/pos-menu-grid.tsx": 3,
      "apps/web/app/(protected)/br/[branchId]/pos/pos-status-shell.tsx": 1,
      "apps/web/app/(protected)/br/[branchId]/pos/_components/cart-pane.tsx": 2,
      "apps/web/app/(protected)/br/[branchId]/pos/_components/pos-mobile-action-bar.tsx": 1,
      "apps/web/app/(protected)/br/[branchId]/kds/kds-board.tsx": 1,
      "apps/web/app/(protected)/br/[branchId]/kds/components/focus-view.tsx": 1,
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
  "apps/web/app/(protected)/admin/components/admin-shell.tsx",
  "apps/web/app/(protected)/admin/settings/settings-page-shell.tsx",
  "apps/web/app/(protected)/finance/components/finance-shell.tsx",
  "apps/web/app/(protected)/inventory/_components/inventory-shell.tsx",
  "apps/web/app/(protected)/br/[branchId]/pos/pos-desktop-shell.tsx",
  "apps/web/app/(protected)/br/[branchId]/pos/pos-status-shell.tsx",
]);

const failures = [];

if (fs.existsSync(path.join(REPO_ROOT, "docs/archive"))) {
  failures.push("legacy-docs: docs/archive must not exist");
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
      "The design system is the Com Tam Ma Tu Custom Theme contract implemented on top",
      "primitive baseline and runtime conformance evidence",
      "It must never be used to overrule this file.",
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
      "NEVER treat the shadcn preset as authority to override the Custom Theme",
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
      "Không được coi `shadcn` preset là authority cao hơn Custom Theme contract.",
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
      "`pos-safe-top` / `pos-safe-bottom`",
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
    id: "shadcn-resolved-preset-contract",
    file: "docs/spec/design-system.md",
    includes: ["resolved preset code: `buFywKm`"],
  },
  {
    id: "shadcn-resolved-preset-agent-rule",
    file: "docs/agent/rules/ui.md",
    includes: [
      "https://ui.shadcn.com/create?preset=buFywKm",
      "pnpm dlx shadcn@latest init --preset buFywKm",
    ],
  },
  {
    id: "shadcn-resolved-preset-module-doc",
    file: "docs/modules/ui.md",
    includes: ["resolved preset `buFywKm`"],
  },
  {
    id: "readme-ui-preset-current",
    file: "README.md",
    includes: ["shadcn/ui (`radix-lyra`, preset `buFywKm`)"],
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
    id: "theme-baseline-preset-current",
    file: "apps/web/e2e/visual/theme-baseline.spec.ts",
    includes: ["shadcn preset buFywKm"],
  },
  {
    id: "data-table-mobile-empty-state-adapter",
    file: "apps/web/app/components/data-table/data-table.tsx",
    includes: ["<AppEmptyState", 'mode={emptyMode ?? "no-data"}'],
  },
  {
    id: "inventory-mobile-interactive-card-delegates",
    file: "apps/web/app/(protected)/inventory/_components/mobile/interactive-card.tsx",
    includes: ['from "@/components/data-table/interactive-card"'],
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
		    maxCount: 20,
	  },
	  {
	    id: "raw-card-import-baseline",
	    description:
	      "Raw Card imports are baseline debt; route-family waves should delegate to AppSection/KpiCard/operational adapters instead.",
	    roots: [{ dir: "apps/web/app", extensions: [".tsx"] }],
	    pattern: /from\s+["@']@comtammatu\/ui\/components\/card["@']/g,
	    maxCount: 2,
	  },
	  {
	    id: "raw-table-import-baseline",
	    description:
	      "Raw Table imports are baseline debt; list surfaces should move to DataTable or a route-specific adapter.",
	    roots: [{ dir: "apps/web/app", extensions: [".tsx"] }],
	    pattern: /from\s+["@']@comtammatu\/ui\/components\/table["@']/g,
	    maxCount: 2,
	  },
	  {
	    id: "raw-dialog-import-baseline",
	    description:
	      "Raw Dialog and AlertDialog imports are baseline debt; CRUD forms should use FormDialog/form helpers or page/sheet shells.",
	    roots: [{ dir: "apps/web/app", extensions: [".tsx"] }],
	    pattern:
	      /from\s+["@']@comtammatu\/ui\/components\/(?:dialog|alert-dialog)["']/g,
	    maxCount: 28,
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
      "apps/web/app/_components/notification-item.tsx": 1,
      "apps/web/app/(protected)/admin/accounting/periods/period-admin-client.tsx": 1,
      "apps/web/app/(protected)/admin/reports/page.tsx": 4,
      "apps/web/app/(protected)/admin/reports/stock-movement/stock-movement-client.tsx": 4,
      "apps/web/app/(protected)/admin/settings/branches/network-config-dialog.tsx": 1,
      "apps/web/app/(protected)/admin/settings/general/settings-form.tsx": 3,
      "apps/web/app/(protected)/admin/settings/layout.tsx": 1,
      "apps/web/app/(protected)/admin/settings/payments/payments-form.tsx": 7,
      "apps/web/app/(protected)/admin/settings/printers/templates/templates-client.tsx": 9,
      "apps/web/app/(protected)/admin/settings/settings-page-frame.tsx": 1,
      "apps/web/app/(protected)/admin/staff/[id]/permissions/permissions-client.tsx": 1,
      "apps/web/app/(protected)/br/[branchId]/kds/components/completion-history-sheet.tsx": 2,
      "apps/web/app/(protected)/br/[branchId]/menu-limits/menu-limits-sheet.tsx": 1,
      "apps/web/app/(protected)/br/[branchId]/pos/_components/bill/bill-receipt-sheet.tsx": 1,
      "apps/web/app/(protected)/br/[branchId]/settings/pos-sessions/pos-sessions-client.tsx": 10,
      "apps/web/app/(protected)/branch-settings/_shared/printers/printers-client.tsx": 10,
      "apps/web/app/(protected)/branch-settings/_shared/tables/tables-client.tsx": 2,
      "apps/web/app/(protected)/finance/expenses/expenses-client.tsx": 1,
      "apps/web/app/(protected)/finance/food-cost/food-cost-client.tsx": 1,
      "apps/web/app/(protected)/finance/invoice-list.tsx": 1,
      "apps/web/app/(protected)/finance/page.tsx": 3,
      "apps/web/app/(protected)/finance/revenue/[date]/page.tsx": 2,
      "apps/web/app/(protected)/finance/revenue/[date]/revenue-drill-tabs.tsx": 1,
      "apps/web/app/(protected)/finance/revenue/revenue-client.tsx": 3,
      "apps/web/app/(protected)/hr/attendance-table.tsx": 2,
      "apps/web/app/(protected)/hr/checklist-templates-table.tsx": 10,
      "apps/web/app/(protected)/hr/payroll/[periodId]/payroll-detail-client.tsx": 1,
      "apps/web/app/(protected)/hr/payroll/payroll-list-client.tsx": 1,
      "apps/web/app/(protected)/inventory/_components/document-stock-correction-dialog.tsx": 5,
      "apps/web/app/(protected)/inventory/_components/period-close-card.tsx": 1,
      "apps/web/app/(protected)/inventory/_components/photo-upload-input.tsx": 2,
      "apps/web/app/(protected)/inventory/_components/shift-cap-meter.tsx": 1,
      "apps/web/app/(protected)/inventory/dashboard-client.tsx": 5,
      "apps/web/app/(protected)/inventory/expiry/expiry-list-client.tsx": 1,
      "apps/web/app/(protected)/inventory/grn/[id]/grn-detail-client.tsx": 5,
      "apps/web/app/(protected)/inventory/grn/grn-list-client.tsx": 1,
      "apps/web/app/(protected)/inventory/ingredients/import-export-menu.tsx": 3,
      "apps/web/app/(protected)/inventory/ingredients/ingredients-client.tsx": 2,
      "apps/web/app/(protected)/inventory/inventory-value-panel.tsx": 2,
      "apps/web/app/(protected)/inventory/production-order-form.tsx": 7,
      "apps/web/app/(protected)/inventory/purchase-orders/new/new-po-client.tsx": 6,
      "apps/web/app/(protected)/inventory/receiving/receiving-client.tsx": 1,
      "apps/web/app/(protected)/inventory/recipes/recipe-line-dialog.tsx": 4,
      "apps/web/app/(protected)/inventory/recipes/recipes-client.tsx": 1,
      "apps/web/app/(protected)/inventory/reports/reports-client.tsx": 2,
      "apps/web/app/(protected)/inventory/settings/qc/qc-settings-client.tsx": 7,
      "apps/web/app/(protected)/inventory/settings/thresholds/page.tsx": 1,
      "apps/web/app/(protected)/inventory/supplier-returns/[id]/supplier-return-detail-client.tsx": 1,
      "apps/web/app/(protected)/inventory/transfers/[id]/transfer-detail-client.tsx": 1,
      "apps/web/app/(protected)/inventory/waste/approvals/waste-approvals-client.tsx": 3,
      "apps/web/app/(protected)/inventory/waste/new/waste-create-client.tsx": 3,
      "apps/web/app/(protected)/menu/category-table.tsx": 2,
      "apps/web/app/(protected)/menu/import-export-menu.tsx": 4,
      "apps/web/app/(protected)/menu/item-detail-dialog.tsx": 7,
      "apps/web/app/(protected)/menu/item-table.tsx": 1,
      "apps/web/app/(protected)/menu/menu-image-input.tsx": 1,
      "apps/web/app/(protected)/menu/page.tsx": 2,
      "apps/web/app/(protected)/orders/order-detail-sheet.tsx": 7,
      "apps/web/app/(protected)/orders/page.tsx": 2,
      "apps/web/app/(protected)/orders/refunds-client.tsx": 1,
      "apps/web/app/(public)/(auth)/login/login-form.tsx": 1,
      "apps/web/app/(public)/(auth)/login/page.tsx": 1,
      "apps/web/app/(public)/payment/momo/return/page.tsx": 2,
      "apps/web/app/components/app-shell.tsx": 2,
      "apps/web/app/components/surface.tsx": 1,
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
      "apps/web/app/(protected)/admin/settings/branches/network-config-dialog.tsx": 2,
      "apps/web/app/(protected)/admin/settings/printers/templates/templates-client.tsx": 1,
      "apps/web/app/(protected)/br/[branchId]/kds/components/completion-history-sheet.tsx": 3,
      "apps/web/app/(protected)/br/[branchId]/kds/components/focus-view.tsx": 2,
      "apps/web/app/(protected)/br/[branchId]/kds/components/order-grid.tsx": 1,
      "apps/web/app/(protected)/br/[branchId]/kds/page.tsx": 4,
      "apps/web/app/(protected)/br/[branchId]/menu-limits/menu-limits-sheet.tsx": 1,
      "apps/web/app/(protected)/br/[branchId]/pos/_components/archived-orders-sheet.tsx": 2,
      "apps/web/app/(protected)/br/[branchId]/pos/_components/bill/bill-receipt-sheet.tsx": 1,
      "apps/web/app/(protected)/br/[branchId]/pos/_components/cart-pane.tsx": 1,
      "apps/web/app/(protected)/br/[branchId]/pos/_components/hotkey-overlay.tsx": 2,
      "apps/web/app/(protected)/br/[branchId]/pos/close-session-sheet.tsx": 3,
      "apps/web/app/(protected)/br/[branchId]/pos/order-history.tsx": 2,
      "apps/web/app/(protected)/br/[branchId]/pos/pos-menu-grid.tsx": 1,
      "apps/web/app/(protected)/br/[branchId]/pos/pos-status-shell.tsx": 1,
      "apps/web/app/(protected)/br/[branchId]/pos/pos-table-gate.tsx": 1,
      "apps/web/app/(protected)/br/[branchId]/pos/pos-takeaway-gate.tsx": 1,
      "apps/web/app/(protected)/br/[branchId]/pos/session-gate.tsx": 2,
      "apps/web/app/(protected)/br/[branchId]/runner/page.tsx": 2,
      "apps/web/app/(protected)/br/[branchId]/settings/pos-sessions/pos-sessions-client.tsx": 2,
      "apps/web/app/(protected)/branch-settings/_shared/kds/station-form-dialog.tsx": 1,
      "apps/web/app/(protected)/hr/attendance-table.tsx": 1,
      "apps/web/app/(protected)/inventory/_components/blind-counting-grid.tsx": 1,
      "apps/web/app/(protected)/inventory/_components/inventory-branch-filter.tsx": 1,
      "apps/web/app/(protected)/inventory/_components/mobile/mobile-page.tsx": 1,
      "apps/web/app/(protected)/inventory/dashboard-client.tsx": 2,
      "apps/web/app/(protected)/inventory/inventory-value-panel.tsx": 1,
      "apps/web/app/(protected)/inventory/issues/[id]/issue-detail-client.tsx": 2,
      "apps/web/app/(protected)/inventory/production-recipe-panel.tsx": 1,
      "apps/web/app/(protected)/inventory/purchase-orders/[id]/po-detail-client.tsx": 2,
      "apps/web/app/(protected)/inventory/purchase-orders/new/new-po-client.tsx": 1,
      "apps/web/app/(protected)/inventory/reports/reports-client.tsx": 1,
      "apps/web/app/(protected)/inventory/settings/thresholds/page.tsx": 1,
      "apps/web/app/(protected)/inventory/stocktake/[id]/stocktake-detail-client.tsx": 1,
      "apps/web/app/(protected)/inventory/transfers/[id]/transfer-detail-client.tsx": 2,
      "apps/web/app/(protected)/inventory/waste/approvals/waste-approvals-client.tsx": 2,
      "apps/web/app/(protected)/inventory/waste/new/waste-create-client.tsx": 2,
      "apps/web/app/(protected)/menu/item-detail-dialog.tsx": 2,
      "apps/web/app/(protected)/menu/page.tsx": 2,
      "apps/web/app/(protected)/orders/order-detail-sheet.tsx": 2,
      "apps/web/app/(public)/(auth)/login/page.tsx": 2,
      "apps/web/app/(public)/access-denied/layout.tsx": 1,
      "apps/web/app/components/data-table/data-table.tsx": 1,
      "apps/web/app/components/form/form-dialog.tsx": 1,
    },
  },
  {
    id: "gap-atypical-baseline",
    description:
      "Gap values outside the documented app scale are frozen per file until they are normalized.",
    roots: [{ dir: "apps/web/app", extensions: [".tsx"] }],
    pattern: /\bgap-(?:0|0\.5|2\.5)\b/g,
    allowlist: {
      "apps/web/app/(protected)/admin/dashboard/page.tsx": 1,
      "apps/web/app/(protected)/admin/staff/[id]/permissions/permissions-client.tsx": 1,
      "apps/web/app/(protected)/br/[branchId]/kds/components/focus-view.tsx": 1,
      "apps/web/app/(protected)/br/[branchId]/kds/components/order-grid.tsx": 1,
      "apps/web/app/(protected)/br/[branchId]/pos/_components/archived-orders-sheet.tsx": 1,
      "apps/web/app/(protected)/br/[branchId]/pos/_components/bill/bill-receipt-summary.tsx": 2,
      "apps/web/app/(protected)/br/[branchId]/pos/_components/bill/invoice-form-section.tsx": 1,
      "apps/web/app/(protected)/br/[branchId]/pos/_components/order-detail/merge-orders-sheet.tsx": 1,
      "apps/web/app/(protected)/br/[branchId]/pos/_components/order-detail/order-item-actions-sheet.tsx": 1,
      "apps/web/app/(protected)/br/[branchId]/pos/_components/order-detail/split-order-sheet.tsx": 1,
      "apps/web/app/(protected)/br/[branchId]/pos/_components/order-list-pane.tsx": 1,
      "apps/web/app/(protected)/br/[branchId]/pos/pos-menu-grid.tsx": 1,
      "apps/web/app/(protected)/br/[branchId]/pos/pos-sidebar-panel.tsx": 1,
      "apps/web/app/(protected)/br/[branchId]/runner/page.tsx": 1,
      "apps/web/app/(protected)/employee/components/employee-page.tsx": 1,
      "apps/web/app/(protected)/employee/payslip/year-picker.tsx": 1,
      "apps/web/app/(protected)/employee/schedule/schedule-client.tsx": 2,
      "apps/web/app/(protected)/inventory/_components/mobile/number-pad-sheet.tsx": 1,
      "apps/web/app/(protected)/inventory/_components/timeline-stepper.tsx": 1,
      "apps/web/app/(protected)/inventory/grn/[id]/grn-detail-client.tsx": 2,
      "apps/web/app/(protected)/inventory/grn/new/[supplierId]/grn-create-client.tsx": 1,
      "apps/web/app/(protected)/inventory/ingredients/ingredients-client.tsx": 1,
      "apps/web/app/(protected)/inventory/inventory-value-panel.tsx": 1,
      "apps/web/app/(protected)/inventory/purchase-orders/new/new-po-client.tsx": 4,
      "apps/web/app/(protected)/inventory/stock/stock-client.tsx": 1,
      "apps/web/app/(protected)/inventory/stocktake/[id]/stocktake-detail-client.tsx": 1,
      "apps/web/app/(protected)/inventory/suppliers/suppliers-client.tsx": 1,
      "apps/web/app/components/data-table/data-table.tsx": 1,
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
    pattern: /\bshadow-\[[^\]]+\]|\bboxShadow\b|\bbox-shadow\b|--shadow-[\w-]+/g,
    allowlist: {
      "apps/web/app/(protected)/br/[branchId]/pos/_components/append-draft-pane.tsx": 1,
      "apps/web/app/(protected)/employee/components/bottom-nav.tsx": 1,
      "apps/web/app/(protected)/employee/components/employee-page.tsx": 2,
      "apps/web/app/(protected)/employee/schedule/schedule-client.tsx": 1,
      "apps/web/app/(protected)/employee/tasks/tasks-client.tsx": 1,
      "apps/web/app/(protected)/inventory/settings/settings-section-nav.tsx": 1,
      "apps/web/app/components/data-table/interactive-card.tsx": 1,
      "apps/web/app/components/surface.tsx": 3,
      "apps/web/app/components/workspace-bottom-nav.tsx": 2,
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
	    replacement: "AppSection, KpiCard, or an approved operational adapter",
	    allowlist: {
	      "apps/web/app/components/kpi/kpi-card.tsx": 1,
	      "apps/web/app/components/surface.tsx": 1,
	    },
  },
  {
    id: "raw-table-import-file-baseline",
    component: "table",
	    label: "Table",
	    replacement: "DataTable, TableEmptyStateRow, or a documented line-sheet adapter",
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
      "apps/web/app/(protected)/admin/settings/branches/network-config-dialog.tsx": 1,
      "apps/web/app/(protected)/admin/settings/printers/templates/templates-client.tsx": 1,
      "apps/web/app/(protected)/br/[branchId]/_components/operational-pwa/toolbar.tsx": 1,
      "apps/web/app/(protected)/br/[branchId]/pos/_components/bill/bill-receipt-sheet.tsx": 1,
      "apps/web/app/(protected)/br/[branchId]/pos/_components/order-detail/transfer-table-dialog.tsx": 1,
      "apps/web/app/(protected)/employee/components/employee-pwa-toolbar.tsx": 1,
      "apps/web/app/(protected)/employee/leave/leave-client.tsx": 1,
      "apps/web/app/(protected)/hr/attendance-table.tsx": 1,
      "apps/web/app/(protected)/hr/checklist-templates-table.tsx": 1,
      "apps/web/app/(protected)/hr/leave-requests-table.tsx": 1,
      "apps/web/app/(protected)/inventory/ingredients/import-export-menu.tsx": 1,
      "apps/web/app/(protected)/inventory/production-order-form.tsx": 1,
      "apps/web/app/(protected)/inventory/production-order-list.tsx": 1,
      "apps/web/app/(protected)/inventory/production-recipe-import-export-menu.tsx": 1,
      "apps/web/app/(protected)/inventory/production-recipe-panel.tsx": 1,
      "apps/web/app/(protected)/inventory/recipes/recipe-line-dialog.tsx": 1,
      "apps/web/app/(protected)/menu/import-export-menu.tsx": 1,
      "apps/web/app/(protected)/menu/item-detail-dialog.tsx": 1,
      "apps/web/app/components/form/form-dialog.tsx": 1,
    },
  },
  {
    id: "raw-alert-dialog-import-file-baseline",
    component: "alert-dialog",
    label: "AlertDialog",
    replacement: "confirm(), FormDialog with reason input, or an approved destructive flow",
    allowlist: {
      "apps/web/app/(protected)/admin/settings/printers/templates/templates-client.tsx": 1,
      "apps/web/app/(protected)/br/[branchId]/pos/_components/cart-pane.tsx": 1,
      "apps/web/app/(protected)/br/[branchId]/pos/_components/order-detail/cancel-order-dialog.tsx": 1,
      "apps/web/app/(protected)/br/[branchId]/pos/_components/order-detail/reduce-quantity-dialog.tsx": 1,
      "apps/web/app/(protected)/br/[branchId]/pos/_components/order-detail/void-item-dialog.tsx": 1,
      "apps/web/app/(protected)/branch-settings/_shared/tables/table-table.tsx": 1,
      "apps/web/app/(protected)/finance/invoice-list.tsx": 1,
      "apps/web/app/(protected)/hr/shifts-table.tsx": 1,
      "apps/web/app/(protected)/inventory/_components/period-close-card.tsx": 1,
      "apps/web/app/(protected)/inventory/expiry/expiry-list-client.tsx": 1,
    },
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
  "apps/web/app/(protected)/employee/components/employee-page.tsx",
  "apps/web/app/(public)/access-denied/page.tsx",
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
// reset, server-error, footer, and submit vocabulary stay consistent. Complex
// line-array production workflows remain custom until they move to Page/Sheet.
const FORM_DIALOG_CRUD_ALLOWLIST = {
  "apps/web/app/(protected)/inventory/production-order-form.tsx":
    "line-array production workflow dialog",
  "apps/web/app/(protected)/inventory/production-recipe-panel.tsx":
    "line-array production recipe workflow dialog",
  "apps/web/app/(protected)/inventory/recipes/recipe-line-dialog.tsx":
    "line-array menu recipe workflow dialog",
};
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
// container (max-w-* + p-*) is an ad-hoc AppPage clone; current offenders are
// baselined and new ones fail CI. Route page spacing through AppPage density.
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
  // Form-control trigger buttons (combobox / multi-select / date-picker) matched
  // to the 40px field-row height. No Button size variant renders 40px (lg=h-9
  // 36px, touch=min-h-12 48px), so these stay raw until a shared trigger-height
  // token exists.
  "apps/web/app/components/form/business-date-field.tsx": 1,
  "apps/web/app/components/form/combobox.tsx": 1,
  "apps/web/app/components/form/multi-select-combobox.tsx": 1,
  // Bespoke single-use tap targets (full-row / stacked icon-over-label tiles ≥
  // h-20) that do not warrant a shared Button size variant. Frozen so a new raw
  // ≥h-20 height on a Button still fails CI.
  "apps/web/app/(protected)/br/[branchId]/pos/_components/cart-pane.tsx": 1,
  "apps/web/app/(protected)/br/[branchId]/pos/_components/order-detail/order-item-row.tsx": 1,
  "apps/web/app/(protected)/br/[branchId]/pos/_components/bill/bill-receipt-sheet.tsx": 3,
  "apps/web/app/(protected)/inventory/_components/mobile/number-pad-sheet.tsx": 1,
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

if (failures.length > 0) {
  console.error("UI contract check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("UI contract check: baseline không tăng.");
