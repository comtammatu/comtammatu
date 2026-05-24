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
    id: "design-system-one-source-contract",
    file: "docs/spec/design-system.md",
    includes: [
      "This is intentionally **one source of truth**, not a source-of-truth bundle.",
      "They must point back to this contract.",
      "the conflict is a bug to resolve",
    ],
  },
  {
    id: "design-system-one-source-agent-rule",
    file: "docs/agent/rules/ui.md",
    includes: [
      "There is exactly one UI design-system source of truth:",
      "`docs/spec/design-system.md`",
      "Everything else is evidence, implementation, or enforcement for that contract",
    ],
  },
  {
    id: "design-system-one-source-module-doc",
    file: "docs/modules/ui.md",
    includes: [
      "Single source of truth for agent decisions:",
      "Runtime config, primitives, adapters, and regression rules are evidence and",
      "They do not authorize a second design system",
    ],
  },
  {
    id: "design-system-one-source-regression",
    file: "tasks/regressions.md",
    includes: ["DESIGN-SYSTEM-ONE-SOURCE-ONLY"],
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
    maxCount: 113,
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
