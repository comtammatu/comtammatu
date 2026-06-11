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

const checks = [
  {
    id: "legacy-matu-pilot-layer",
    description:
      "Legacy matu-surface / matu-* / font-matu-* usage is retired.",
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
      /className=\{?['"][^'"]*\b(text-4xl|text-5xl|font-black)\b/g,
    allowlist: {},
  },
  {
    id: "icon-size",
    description:
      "Banned icon-size classes size-7/9/11 must not spread; size-14/16 stay limited to media thumbnails.",
    roots: [{ dir: "apps/web/app", extensions: [".tsx"] }],
    pattern:
      /className=\{?['"][^'"]*\b(size-(7|9|11|14|16))\b/g,
    allowlist: {
      "apps/web/app/(protected)/inventory/_components/photo-upload-input.tsx": 2,
      "apps/web/app/(protected)/menu/menu-image-input.tsx": 1,
    },
  },
  {
    id: "button-height",
    description:
      "Raw button/touch heights h-10/11/12/14/16 and min-h-12/14/16 must not spread.",
    roots: [{ dir: "apps/web/app", extensions: [".tsx"] }],
    pattern:
      /className=\{?['"][^'"]*\b(h-(10|11|12|14|16)|min-h-(12|14|16))\b/g,
    allowlist: {
      "apps/web/app/(protected)/br/[branchId]/pos/_components/archived-orders-sheet.tsx": 2,
      "apps/web/app/(protected)/br/[branchId]/pos/_components/bill/bill-receipt-sheet.tsx": 7,
      "apps/web/app/(protected)/br/[branchId]/pos/_components/bill/bill-receipt-summary.tsx": 1,
      "apps/web/app/(protected)/br/[branchId]/pos/_components/cart-pane.tsx": 1,
      "apps/web/app/(protected)/br/[branchId]/pos/_components/close-session/denomination-input.tsx": 1,
      "apps/web/app/(protected)/br/[branchId]/pos/_components/order-detail/merge-orders-sheet.tsx": 1,
      "apps/web/app/(protected)/br/[branchId]/pos/_components/order-list-pane.tsx": 1,
      "apps/web/app/(protected)/br/[branchId]/pos/order-detail-sheet.tsx": 2,
      "apps/web/app/(protected)/br/[branchId]/pos/pos-desktop-shell.tsx": 1,
      "apps/web/app/(protected)/br/[branchId]/pos/pos-menu-grid.tsx": 1,
      "apps/web/app/(protected)/br/[branchId]/pos/pos-page-skeleton.tsx": 6,
      "apps/web/app/(protected)/br/[branchId]/pos/pos-sidebar-panel.tsx": 1,
      "apps/web/app/(protected)/inventory/_components/mobile/mobile-top-bar.tsx": 1,
      "apps/web/app/(protected)/inventory/_components/searchable-select.tsx": 1,
      "apps/web/app/(protected)/inventory/expiry/expiry-list-client.tsx": 1,
      "apps/web/app/(protected)/inventory/grn/new/[supplierId]/grn-create-client.tsx": 1,
      "apps/web/app/(protected)/inventory/ingredient-table.tsx": 1,
      "apps/web/app/(protected)/inventory/ingredients/ingredients-client.tsx": 1,
      "apps/web/app/(protected)/inventory/purchase-orders/purchase-orders-client.tsx": 2,
      "apps/web/app/(protected)/inventory/supplier-invoices/supplier-invoices-client.tsx": 1,
      "apps/web/app/(protected)/inventory/transfers/transfers-client.tsx": 1,
      "apps/web/app/(protected)/inventory/transfers/transfers-list-client.tsx": 2,
      "apps/web/app/(protected)/menu/page.tsx": 1,
      "apps/web/app/(public)/(auth)/login/login-form.tsx": 2,
    },
  },
  {
    id: "radius-scale",
    description:
      "App surfaces use only rounded-md, rounded-lg, rounded-full, or rounded-none.",
    roots: [{ dir: "apps/web/app", extensions: [".tsx"] }],
    pattern:
      /className=\{?['"][^'"]*(\brounded\b(?!-(?:md|lg|full|none|t|b|l|r))|\brounded-(sm|xl|2xl|3xl|4xl)\b)/g,
    allowlist: {
      "apps/web/app/(protected)/admin/settings/payments/payments-form.tsx": 3,
      "apps/web/app/(protected)/admin/staff/[id]/permissions/page.tsx": 1,
      "apps/web/app/(protected)/admin/staff/audit/page.tsx": 1,
      "apps/web/app/components/kpi/trend-sparkline.tsx": 1,
      "apps/web/app/(protected)/hr/shift-assignments-table.tsx": 1,
      "apps/web/app/(protected)/inventory/issues/[id]/issue-detail-client.tsx": 1,
      "apps/web/app/(protected)/menu/import-export-menu.tsx": 1,
      "apps/web/app/(protected)/menu/item-table.tsx": 2,
      "apps/web/app/(protected)/menu/menu-image-input.tsx": 1,
    },
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
    id: "app-arbitrary-sizing",
    description:
      "Arbitrary app sizing remains baseline debt and must not spread.",
    roots: [{ dir: "apps/web/app", extensions: [".tsx"] }],
    pattern:
      /className=\{?['"][^'"]*\b(?:w|h|max-w|max-h|min-w|min-h|text)-\[[^\]]+\]/g,
    allowlist: {
      "apps/web/app/(protected)/finance/revenue/revenue-client.tsx": 1,
      "apps/web/app/components/app-shell.tsx": 1,
    },
  },
  {
    id: "status-label-ssot",
    description:
      "Status label/variant maps are single-sourced in @comtammatu/shared labels + apps/web/app/components/status-badge.tsx; page-local STATUS_* maps must not spread.",
    roots: [{ dir: "apps/web/app", extensions: [".ts", ".tsx"] }],
    pattern:
      /\bconst\s+[A-Z][A-Z0-9_]*STATUS[A-Z0-9_]*(?:\s*:\s*[^=\n]+)?\s*=\s*[{[]/g,
    allowlist: {
      "apps/web/app/(protected)/admin/settings/tables/constants.ts": 1,
      "apps/web/app/(protected)/br/[branchId]/kds/actions.ts": 1,
      "apps/web/app/(protected)/br/[branchId]/kds/hooks/use-kds-realtime.ts": 2,
      "apps/web/app/(protected)/br/[branchId]/kds/page.tsx": 2,
      "apps/web/app/(protected)/br/[branchId]/pos/order-history.tsx": 1,
      "apps/web/app/(protected)/br/[branchId]/runner/page.tsx": 2,
      "apps/web/app/(protected)/employee/payslip/payslip-client.tsx": 1,
      "apps/web/app/(protected)/employee/schedule/schedule-client.tsx": 2,
      "apps/web/app/(protected)/inventory/supplier-invoices/supplier-invoices-client.tsx": 2,
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
      "apps/web/app/(protected)/finance/audit-trail/audit-trail-client.tsx": 1,
      "apps/web/app/(protected)/finance/components/work-queue-strip.tsx": 1,
      "apps/web/app/(protected)/finance/food-cost/food-cost-client.tsx": 1,
      "apps/web/app/(protected)/finance/journal/journal-client.tsx": 4,
      "apps/web/app/(protected)/finance/page.tsx": 2,
      "apps/web/app/(protected)/finance/periods/periods-client.tsx": 3,
      "apps/web/app/(protected)/finance/revenue/[date]/page.tsx": 2,
      "apps/web/app/(protected)/finance/revenue/revenue-charts-internal.tsx": 2,
      "apps/web/app/(protected)/finance/revenue/revenue-client.tsx": 9,
      "apps/web/app/(protected)/hr/payroll/[periodId]/payroll-detail-client.tsx": 1,
      "apps/web/app/(protected)/inventory/_components/audit-history-list.tsx": 1,
      "apps/web/app/(protected)/inventory/_components/auto-approve-eval-panel.tsx": 2,
      "apps/web/app/(protected)/inventory/_components/document-stock-correction-dialog.tsx": 1,
      "apps/web/app/(protected)/inventory/_lib/format.ts": 2,
      "apps/web/app/(protected)/inventory/grn/[id]/grn-detail-client.tsx": 1,
      "apps/web/app/(protected)/inventory/ingredient-table.tsx": 1,
      "apps/web/app/(protected)/inventory/ingredients/ingredients-client.tsx": 1,
      "apps/web/app/(protected)/inventory/production-order-list.tsx": 2,
      "apps/web/app/(protected)/inventory/purchase-orders/new/new-po-client.tsx": 16,
    },
  },
  {
    id: "stat-card-ssot",
    description:
      "KPI/stat metric cards are single-sourced in apps/web/app/components/kpi/; page-local StatCard/SummaryCard/MetricCard definitions must not spread.",
    roots: [{ dir: "apps/web/app", extensions: [".tsx"] }],
    pattern:
      /\b(?:function|const)\s+(?:StatCard|SummaryCard|MetricCard|KpiCard)\b/g,
    allowlist: {
      "apps/web/app/(protected)/admin/dashboard/page.tsx": 1,
      "apps/web/app/(protected)/admin/settings/printers/jobs/page.tsx": 1,
      "apps/web/app/(protected)/finance/reconciliation/reconciliation-client.tsx": 1,
      "apps/web/app/(protected)/hr/payroll/[periodId]/payroll-detail-client.tsx": 1,
      "apps/web/app/(protected)/inventory/grn/[id]/grn-detail-client.tsx": 1,
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
    allowlist: {
      "apps/web/app/(protected)/admin/reports/stock-movement/stock-movement-client.tsx": 2,
      "apps/web/app/(protected)/admin/staff/staff-table.tsx": 1,
      "apps/web/app/(protected)/finance/invoice-list.tsx": 1,
      "apps/web/app/(protected)/inventory/issues/[id]/issue-detail-client.tsx": 1,
      "apps/web/app/(protected)/inventory/purchase-orders/[id]/po-detail-client.tsx": 1,
      "apps/web/app/(protected)/inventory/transfers/[id]/transfer-detail-client.tsx": 1,
    },
  },
];

const failures = [];

if (fs.existsSync(path.join(REPO_ROOT, "docs/archive"))) {
  failures.push("legacy-docs: docs/archive must not exist");
}

const legacyDocReferencePattern =
  /docs\/archive(?:\/|$)|(?:^|[\s('"`])(?:\.{1,2}\/)*archive\//g;

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
      "UI cua repo la Com Tam Ma Tu Custom Theme",
      "Runtime config, primitives, adapters, runbooks, worklogs, and regression rules",
      "are evidence/enforcement for that contract",
      "design system:",
      "Khong duoc coi `shadcn` preset la authority cao hon Custom Theme contract.",
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
      "`docs/worklog/*`: history/progress only",
    ],
  },
  {
    id: "card-title-runtime-contract",
    file: "packages/ui/src/components/card.tsx",
    includes: ['className={cn("font-heading text-base font-semibold", className)}'],
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
    includes: ["`flush` cho table-edge/list-edge alignment", "`scroll` cho horizontal table"],
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
    maxCount: 107,
  },
  {
    id: "card-title-classname-baseline",
    description:
      "CardTitle className overrides are heading-scale debt and must not increase.",
    roots: [{ dir: "apps/web/app", extensions: [".tsx"] }],
    pattern: /<CardTitle\b[^\n]*\bclassName=/g,
    maxCount: 25,
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

if (failures.length > 0) {
  console.error("UI contract check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("UI contract check: baseline không tăng.");
