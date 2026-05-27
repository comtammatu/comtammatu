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
      "Legacy matu-surface / matu-* / font-matu-body usage is retired.",
    roots: [
      { dir: "apps/web/app", extensions: [".ts", ".tsx"] },
      { dir: "packages/ui/src/styles", extensions: [".css"] },
    ],
    pattern:
      /matu-surface|font-matu-body|bg-matu-|text-matu-|border-matu-|rounded-matu|spacing-matu|radius-matu|matu-superapp\/DESIGN/g,
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
      "apps/web/app/(public)/r/[token]/_components/feedback-form.tsx": 1,
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
      "apps/web/app/(protected)/admin/feedback/qr/_components/qr-management-client.tsx": 1,
      "apps/web/app/(protected)/br/[branchId]/kds/components/filter-bar.tsx": 2,
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
      "apps/web/app/(protected)/finance/components/trend-sparkline.tsx": 1,
      "apps/web/app/(protected)/hr/shift-assignments-table.tsx": 1,
      "apps/web/app/(protected)/inventory/issues/[id]/issue-detail-client.tsx": 1,
      "apps/web/app/(protected)/menu/import-export-menu.tsx": 1,
      "apps/web/app/(protected)/menu/item-table.tsx": 2,
      "apps/web/app/(protected)/menu/menu-image-input.tsx": 1,
      "apps/web/app/(protected)/orders/orders-client.tsx": 1,
      "apps/web/app/(protected)/orders/refunds-client.tsx": 1,
    },
  },
  {
    id: "card-content-named-layout-props",
    description:
      "Use CardContent flush/scroll instead of local p-0 or overflow-x-auto layout overrides.",
    roots: [{ dir: "apps/web/app", extensions: [".tsx"] }],
    pattern:
      /<CardContent\b[^\n>]*className=["'](?:p-0|overflow-x-auto|overflow-x-auto p-0)["']/g,
    allowlist: {},
  },
];

const failures = [];

const textChecks = [
  {
    id: "ux-rebuild-freeze-design-system-contract",
    file: "docs/spec/design-system.md",
    includes: [
      "Status: frozen legacy runtime with scoped Khung quản trị rebuild authority",
      "Until a new UX reference is chosen with the owner, no broad rebuild",
      "Agents must not renovate route layouts",
      "new owner-approved design-system contract",
      "Current-runtime maintenance UI must not import `matu-surface`",
      "## Scoped Khung quản trị Rebuild Authority",
      "Shadcn preset candidate: `b6FS5q9aq`",
      "owner chooses the switch mode: reinstall, merge,",
      "## Frozen Runtime UX Thesis",
      "## Frozen Runtime Token Contract",
      "## Frozen Runtime Rhythm Contract",
      "## Frozen Runtime Component Authority",
      "## Frozen Runtime Surface Contracts",
    ],
  },
  {
    id: "ux-rebuild-freeze-agent-rule",
    file: "docs/agent/rules/ui.md",
    includes: [
      "The current runtime UI has one frozen maintenance contract:",
      "That file is not UX rebuild authority.",
      "For broad UX rebuild work, no design-system source of truth exists yet.",
      "owner-approved authority reset defines the new preset/tokens/components",
      "scoped rebuild authority in `docs/spec/design-system.md`",
      "Do not run `shadcn init --preset b6FS5q9aq` until the owner chooses",
      "`docs/spec/design-system.md`",
    ],
  },
  {
    id: "ux-rebuild-freeze-module-doc",
    file: "docs/modules/ui.md",
    includes: [
      "duoc dong bang thanh legacy runtime maintenance contract",
      "Scoped Khung quản trị",
      "authority de trung tu UX moi",
      "khong run `shadcn init --preset b6FS5q9aq`",
      "authority reset docs + guard da duoc update truoc runtime patch",
    ],
  },
  {
    id: "ux-rebuild-freeze-regression",
    file: "tasks/regressions.md",
    includes: [
      "UX-REBUILD-NOT-ON-FROZEN-LEGACY-AUTHORITY",
      "ADMIN-SHELL-SCOPED-REBUILD-ONLY",
      "FROZEN-RUNTIME MAINTENANCE ONLY",
      "This rule is not UX rebuild authority",
      "SHADCN PRIMITIVE RULE, NOT VISUAL LEGACY",
      "This rule is explicitly not UX rebuild authority",
      "frozen runtime `apps/web` target shadcn preset evidence is `buFywKm`",
    ],
  },
  {
    id: "ux-rebuild-freeze-agents-entrypoint",
    file: "AGENTS.md",
    includes: [
      "frozen legacy runtime contract for maintenance only",
      "NEVER start UX rebuild implementation on top of the frozen legacy contract",
      "BEFORE UI/UX rebuild work, first choose the UX reference with the owner",
      "owner-approved authority reset defines the new preset/tokens/components",
      "do not run `shadcn init --preset b6FS5q9aq` until the owner chooses",
    ],
  },
  {
    id: "ux-rebuild-freeze-reference-map",
    file: "docs/agent/rules/references.md",
    includes: [
      "Current UI maintenance contract:",
      "frozen runtime evidence, not UX rebuild authority",
    ],
  },
  {
    id: "ux-rebuild-freeze-codebase-map",
    file: "docs/CODEBASE_MAP.md",
    includes: [
      "UX rebuild: owner-approved authority reset first",
      "UX rebuild work must not use the frozen contract as visual authority",
      "New visual language without authority reset",
    ],
  },
  {
    id: "ux-rebuild-freeze-runtime-css-comment",
    file: "packages/ui/src/styles/globals.css",
    includes: [
      "Frozen runtime source: shadcn radix-lyra primitives + Ma Tu Concept 01 tokens.",
      "Maintenance evidence only; not UX rebuild authority.",
    ],
  },
  {
    id: "ux-rebuild-freeze-readme",
    file: "README.md",
    includes: [
      "Current runtime styling is frozen maintenance evidence",
      "UX rebuild authority must be reset before new layout work",
    ],
  },
  {
    id: "ux-rebuild-freeze-visual-baseline",
    file: "apps/web/e2e/visual/theme-baseline.spec.ts",
    includes: [
      "Visual baseline — frozen runtime light + dark mode regression guard.",
      "Maintenance evidence only; not UX rebuild authority.",
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
    id: "shadcn-frozen-runtime-preset-contract",
    file: "docs/spec/design-system.md",
    includes: ["resolved `apps/web` target preset evidence: `buFywKm`"],
  },
  {
    id: "shadcn-frozen-runtime-preset-agent-rule",
    file: "docs/agent/rules/ui.md",
    includes: [
      "Current `apps/web` runtime preset evidence",
      "pnpm dlx shadcn@latest init --preset buFywKm",
    ],
  },
  {
    id: "shadcn-frozen-runtime-preset-module-doc",
    file: "docs/modules/ui.md",
    includes: [
      "target `apps/web` resolved",
      "preset evidence `buFywKm`",
      "Day la frozen runtime evidence, khong phai",
      "rebuild authority",
    ],
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
  {
    id: "admin-shell-scoped-rebuild-runtime",
    file: "apps/web/app/(protected)/admin/components/admin-shell.tsx",
    includes: [
      "MODULE_LABELS_VI",
      "messages.common.brandName",
      "mainLabel: APP_COPY_VI.adminSurface",
      "IconUsers data-icon=\"inline-start\"",
      "IconChartBar data-icon=\"inline-start\"",
    ],
  },
  {
    id: "app-shell-shadcn-runtime-composition",
    file: "apps/web/app/components/app-shell.tsx",
    includes: [
      "SidebarGroupContent",
      "SidebarMenuAction",
      "SidebarRail",
      "const mobileHeaderExtras",
      "const brandHref",
      "<SidebarRail />",
      "<Separator className=\"md:hidden\" />",
      "flex w-full flex-col gap-4",
    ],
  },
];

const forbiddenTextChecks = [
  {
    id: "no-locked-single-source-status",
    file: "docs/spec/design-system.md",
    forbidden: ["Status: locked single source for UI agents"],
  },
  {
    id: "no-one-source-ui-authority-contract",
    file: "docs/spec/design-system.md",
    forbidden: [
      "This is intentionally **one source of truth**, not a source-of-truth bundle.",
      "Agents must preserve this decision unless the task explicitly asks to change the design system itself.",
      "Forbidden for new app UI:",
      "New app UI must not import `matu-surface`",
      "## Product UX Thesis",
      "## Token Contract",
      "## Rhythm Contract",
      "## Component Authority",
      "## Surface Contracts",
    ],
  },
  {
    id: "no-one-source-ui-authority-agent-rule",
    file: "docs/agent/rules/ui.md",
    forbidden: [
      "There is exactly one UI design-system source of truth:",
      "BEFORE UI/UX rebuild work, read and follow `docs/spec/design-system.md` as the locked design-system contract.",
      "USE `shadcn/ui` components and the project's active preset as the default UI path.",
      "NEVER invent or redesign the UI outside the active design-system contract.",
      "`DESIGN-SYSTEM-CONTRACT-FIRST`",
    ],
  },
  {
    id: "no-one-source-ui-authority-module-doc",
    file: "docs/modules/ui.md",
    forbidden: [
      "Single source of truth for agent decisions:",
      "Tat ca UI/UX rebuild phai di theo contract do truoc khi sua runtime.",
      "active design-system contract",
      "shadcn preset hien hanh",
      "frozen design system la authority",
    ],
  },
  {
    id: "no-superseded-design-system-regression",
    file: "tasks/regressions.md",
    forbidden: [
      "DESIGN-SYSTEM-ONE-SOURCE-ONLY",
      "DESIGN-SYSTEM-CONTRACT-FIRST",
    ],
  },
  {
    id: "no-active-legacy-ui-regression-wording",
    file: "tasks/regressions.md",
    forbidden: [
      "New app UI MUST use primitive variants",
      "App UI MUST use `docs/spec/design-system.md`",
      "Repeated app-level page/header/section/toolbar/empty-state/link-card patterns MUST go through `apps/web/app/components/surface.tsx`. Domain wrappers",
      "active shadcn preset is `b6G3vbGue`",
      "prior to b1GN1lxvE alignment",
    ],
  },
  {
    id: "no-active-legacy-codebase-map-wording",
    file: "docs/CODEBASE_MAP.md",
    forbidden: [
      "Use design-system primitives<br/>docs/spec/design-system.md + shadcn/ui",
      "UI changes stay inside the active design-system contract.",
      "New visual language outside design system",
    ],
  },
  {
    id: "no-active-legacy-readme-preset",
    file: "README.md",
    forbidden: [
      "preset `b1GN1lxvE`",
      "preset `b6G3vbGue`",
      "preset `buFywKm`",
    ],
  },
  {
    id: "no-active-legacy-visual-baseline-preset",
    file: "apps/web/e2e/visual/theme-baseline.spec.ts",
    forbidden: [
      "preset b1GN1lxvE",
      "preset b6G3vbGue",
      "preset buFywKm",
    ],
  },
  {
    id: "no-admin-shell-hardcoded-action-copy",
    file: "apps/web/app/(protected)/admin/components/admin-shell.tsx",
    forbidden: [
      'subLabel: "Cơm Tấm Má Tư"',
      'mainLabel: "Quản trị"',
      ">Cổng nhân viên</Link>",
    ],
  },
  {
    id: "no-app-shell-raw-legacy-shell-patterns",
    file: "apps/web/app/components/app-shell.tsx",
    forbidden: [
      "space-y-4",
      "IconArrowLeft className",
      "IconLogout className",
      "border-t px-4 py-2 md:hidden",
      "sticky top-0 z-10 -mx-4",
      "inline-flex items-center gap-1.5 text-xs font-medium text-sidebar-foreground/65",
    ],
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
  const filePath = path.join(REPO_ROOT, check.file);
  if (!fs.existsSync(filePath)) {
    failures.push(`${check.id}: ${check.file} is missing`);
    continue;
  }

  const content = fs.readFileSync(filePath, "utf8");
  for (const forbidden of check.forbidden) {
    if (content.includes(forbidden)) {
      failures.push(`${check.id}: ${check.file} still contains "${forbidden}"`);
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
