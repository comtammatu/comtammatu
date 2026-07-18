import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { PAGE_ARCHETYPES } from "./page-archetypes.mjs";
import {
  APP_ADAPTER_REGISTRY,
  DOMAIN_ADAPTER_FAMILIES,
  validateUiComponentRegistry,
} from "./ui-component-registry.mjs";
import {
  buildUiContractGuardReporting,
} from "./ui-contract-guard-reporting.mjs";
import {
  UI_RUNTIME_SOURCE_ROOTS,
  uiRuntimeRoots,
} from "./ui-contract-scope.mjs";

const REPO_ROOT = process.cwd();
const SELF_PATH = fileURLToPath(import.meta.url);

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

function walkUiRuntimeFiles(extensions) {
  return UI_RUNTIME_SOURCE_ROOTS.flatMap((root) => walkFiles(root, extensions));
}

function countMatches(content, pattern) {
  return [...content.matchAll(pattern)].length;
}

function extractConstObjectBody(content, name) {
  const anchor = content.indexOf(`const ${name} = {`);
  if (anchor === -1) return null;
  const start = content.indexOf("{", anchor);
  if (start === -1) return null;

  let depth = 0;
  for (let index = start; index < content.length; index += 1) {
    const char = content.charAt(index);
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return content.slice(start + 1, index);
    }
  }

  return null;
}

function extractConstArrayBody(content, name) {
  const anchor = content.indexOf(`const ${name} = [`);
  if (anchor === -1) return null;
  const start = content.indexOf("[", anchor);
  if (start === -1) return null;

  let depth = 0;
  let inString = null;
  for (let index = start; index < content.length; index += 1) {
    const char = content.charAt(index);
    if (inString) {
      if (char === inString && content[index - 1] !== "\\") inString = null;
    } else if (char === '"' || char === "'" || char === "`") {
      inString = char;
    } else if (char === "[") {
      depth += 1;
    } else if (char === "]") {
      depth -= 1;
      if (depth === 0) return content.slice(start + 1, index);
    }
  }

  return null;
}

function extractTopLevelObjectKeys(body) {
  return [...body.matchAll(/^\s{2}([A-Za-z][A-Za-z0-9]*):/gm)].map(
    (match) => match[1],
  );
}

function extractTopLevelObjectEntries(body) {
  const entries = new Map();
  const entryStartRe = /^\s{2}([A-Za-z][A-Za-z0-9]*):\s*\{/gm;
  for (const match of body.matchAll(entryStartRe)) {
    const key = match[1];
    if (!key) continue;
    const openBrace = body.indexOf("{", match.index);
    let depth = 0;
    for (let index = openBrace; index < body.length; index += 1) {
      const char = body.charAt(index);
      if (char === "{") depth += 1;
      if (char === "}") {
        depth -= 1;
        if (depth === 0) {
          entries.set(key, body.slice(openBrace + 1, index));
          break;
        }
      }
    }
  }
  return entries;
}

function extractArrayObjectIds(body) {
  if (!body) return null;
  return [...body.matchAll(/\bid:\s*"([^"]+)"/g)]
    .map((match) => match[1])
    .filter(Boolean)
    .sort();
}

function extractGuardIds(body) {
  const guardIds = new Set();
  for (const match of body.matchAll(/guardIds:\s*\[([\s\S]*?)\]/g)) {
    for (const guardIdMatch of (match[1] ?? "").matchAll(/"([a-z0-9-]+)"/g)) {
      guardIds.add(guardIdMatch[1]);
    }
  }
  return [...guardIds].sort();
}

function extractStringProperty(body, name) {
  return new RegExp(`${name}:\\s*"([^"]+)"`).exec(body)?.[1] ?? null;
}

function hasUiContractGuard(contractSource, guardId) {
  return (
    contractSource.includes(`id: "${guardId}"`) ||
    contractSource.includes(`${guardId}:`)
  );
}

function extractGuardGroupIds(contractSource, guardGroup) {
  const body = extractConstArrayBody(contractSource, guardGroup);
  return extractArrayObjectIds(body);
}

function formatMapDiff(expected, actual) {
  const expectedKeys = [...expected.keys()].sort();
  const actualKeys = [...actual.keys()].sort();
  const missing = expectedKeys.filter((key) => !actual.has(key));
  const extra = actualKeys.filter((key) => !expected.has(key));
  const changed = expectedKeys
    .filter((key) => actual.has(key) && expected.get(key) !== actual.get(key))
    .map(
      (key) => `${key} expected ${expected.get(key)}, got ${actual.get(key)}`,
    );
  return [
    missing.length > 0 ? `missing ${missing.join(", ")}` : null,
    extra.length > 0 ? `extra ${extra.join(", ")}` : null,
    changed.length > 0 ? `changed ${changed.join(", ")}` : null,
  ].filter(Boolean);
}

function validateAuditSignalGuardCoverage(contractSource) {
  const auditPath = path.join(REPO_ROOT, "scripts/audit-ui-components.mjs");
  if (!fs.existsSync(auditPath)) {
    return ["audit-to-guard-map: scripts/audit-ui-components.mjs is missing"];
  }

  const auditSource = fs.readFileSync(auditPath, "utf8");
  const signalsBody = extractConstObjectBody(auditSource, "SIGNALS");
  const guardCoverageBody = extractConstObjectBody(
    auditSource,
    "SIGNAL_GUARD_COVERAGE",
  );
  const errors = [];

  if (!signalsBody) errors.push("SIGNALS object is missing");
  if (!guardCoverageBody) {
    errors.push("SIGNAL_GUARD_COVERAGE object is missing");
  }
  if (!signalsBody || !guardCoverageBody) {
    return errors.map((error) => `audit-to-guard-map: ${error}`);
  }

  const signalKeys = extractTopLevelObjectKeys(signalsBody).sort();
  const coverageEntries = extractTopLevelObjectEntries(guardCoverageBody);
  const coverageKeys = [...coverageEntries.keys()].sort();
  const missing = signalKeys.filter((key) => !coverageKeys.includes(key));
  const extra = coverageKeys.filter((key) => !signalKeys.includes(key));
  const allowedStatuses = new Set([
    "blocking-zero",
    "advisory",
  ]);

  if (missing.length > 0) {
    errors.push(`missing coverage for signal(s): ${missing.join(", ")}`);
  }
  if (extra.length > 0) {
    errors.push(`stale coverage for removed signal(s): ${extra.join(", ")}`);
  }

  for (const [signal, entryBody] of coverageEntries) {
    const status = /status:\s*"([^"]+)"/.exec(entryBody)?.[1];
    const guardIds = extractGuardIds(entryBody);
    const guardGroup = extractStringProperty(entryBody, "guardGroup");
    if (!status) {
      errors.push(`${signal} is missing a status`);
      continue;
    }
    if (!allowedStatuses.has(status)) {
      errors.push(`${signal} has unknown status "${status}"`);
    }
    if (
      status === "advisory" &&
      !/reason:\s*["']/.test(entryBody)
    ) {
      errors.push(`${signal} is ${status} without a reason`);
    }
    if (guardGroup) {
      const groupIds = extractGuardGroupIds(contractSource, guardGroup);
      if (!groupIds) {
        errors.push(`${signal} points at missing guard group "${guardGroup}"`);
      } else {
        const diffs = formatMapDiff(
          new Map(groupIds.map((id) => [id, 1])),
          new Map(guardIds.map((id) => [id, 1])),
        );
        if (diffs.length > 0) {
          errors.push(
            `${signal} guardIds do not match ${guardGroup}: ${diffs.join("; ")}`,
          );
        }
      }
    }
    if (status === "advisory") continue;

    if (guardIds.length === 0) {
      errors.push(`${signal} is ${status} without guardIds`);
      continue;
    }

    for (const guardId of guardIds) {
      if (!hasUiContractGuard(contractSource, guardId)) {
        errors.push(
          `${signal} points at missing UI contract guard "${guardId}"`,
        );
      }
    }
  }

  return errors.map((error) => `audit-to-guard-map: ${error}`);
}

// Extract JSX opening tags for a component, brace/paren/bracket/string aware so
// that `=>` arrows and `{...}` expression props (which contain `>`) do not
// terminate the tag. Lets a gate inspect a whole opening tag — including a
// multi-line `className={cn("…")}` — which a className-literal regex cannot.
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

function countNativeInteractiveElement(content) {
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

const formatterGuards = [
  {
    id: "finance-page-local-formatter",
    description:
      "Finance routes format money, counts, dates, and times through shared helpers, not page-local Intl/toLocale formatters.",
    roots: [
      {
        dir: "apps/web/app/(protected)/finance",
        extensions: [".ts", ".tsx"],
      },
    ],
    pattern:
      /\b(?:new\s+Intl\.(?:NumberFormat|DateTimeFormat)|Intl\.(?:NumberFormat|DateTimeFormat)|\.toLocaleString\(|\.toLocaleDateString\(|\.toLocaleTimeString\()/g,
    allowlist: {},
  },
  {
    id: "app-page-local-number-formatter",
    description:
      "App UI formats money and counts through shared helpers, not page-local Intl.NumberFormat/toLocaleString formatters.",
    roots: uiRuntimeRoots([".ts", ".tsx"]),
    pattern: /\b(?:new\s+)?Intl\.NumberFormat\b|\.toLocaleString\(/g,
    allowlist: {},
  },
  {
    id: "vnd-format-ssot",
    description:
      "VND money rendering goes through formatVND from @comtammatu/shared/format; local vi-VN formatters must not spread.",
    roots: uiRuntimeRoots([".ts", ".tsx"]),
    pattern:
      /toLocaleString\(\s*(?:"vi-VN"|'vi-VN')|Intl\.NumberFormat\(\s*(?:"vi-VN"|'vi-VN')|\b(?:function|const)\s+formatVND\b/g,
    allowlist: {},
  },
  {
    id: "percent-format-ssot",
    description:
      "User-visible percentage points use formatPercent from @comtammatu/shared/format; page-local decimal-dot percent rendering must not spread.",
    roots: [
      ...uiRuntimeRoots([".ts", ".tsx"]),
      { dir: "apps/web/lib/inventory", extensions: [".ts", ".tsx"] },
    ],
    pattern:
      /\b(?:function|const)\s+formatPercent\b|\.toFixed\(\s*\d+\s*\)\s*\}\s*%/g,
    allowlist: {},
  },
  {
    id: "date-format-ssot",
    description:
      "VN date/time rendering goes through @comtammatu/shared/time (formatVNDate/formatVNDateTime/getVNDateString/..., which pin Asia/Ho_Chi_Minh); ad-hoc Intl.DateTimeFormat / toLocaleDateString / toLocaleTimeString in app code must not spread.",
    roots: uiRuntimeRoots([".ts", ".tsx"]),
    pattern:
      /Intl\.DateTimeFormat\b|\.toLocaleDateString\(|\.toLocaleTimeString\(/g,
    allowlist: {},
  },
];

const checks = [
  {
    id: "print-format-ssot",
    description:
      "Print rendering uses shared vi-VN money and time helpers; local Intl/toLocale formatting must not be reintroduced.",
    roots: [
      {
        dir: "packages/print-render/src",
        extensions: [".ts", ".tsx"],
      },
    ],
    pattern:
      /\b(?:new\s+)?Intl\.(?:NumberFormat|DateTimeFormat)\b|\.toLocale(?:String|DateString|TimeString)\(/g,
    allowlist: {},
  },
  {
    id: "raw-percent-output-ssot",
    description:
      "Dynamic percentage text is rendered through formatPercent; only CSS geometry and SQL wildcard templates may interpolate a raw percent sign.",
    roots: [
      { dir: "apps/web/app", extensions: [".ts", ".tsx"] },
      { dir: "apps/web/lib", extensions: [".ts", ".tsx"] },
      { dir: "packages/print-render/src", extensions: [".ts", ".tsx"] },
      { dir: "packages/shared/src/messages", extensions: [".ts"] },
    ],
    pattern: /\$\{[^}]+\}%|(?<!\$)\{[^{}]+\}\s*%/g,
    allowlist: {
      "apps/web/app/(protected)/br/[branchId]/(operator)/stock/receive/[id]/transfer-receive-client.tsx": 1,
      "apps/web/app/(protected)/br/[branchId]/(operator)/team/team-workspace-tabs.tsx": 1,
      "apps/web/app/(protected)/br/[branchId]/pos/order-reads.ts": 1,
      "apps/web/app/(protected)/inventory/_lib/chart-primitives.tsx": 1,
      "apps/web/app/(protected)/inventory/reports/reports-client.tsx": 1,
    },
  },
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
    roots: [
      { dir: "apps/web/app", extensions: [".tsx"] },
      { dir: "apps/web/lib", extensions: [".tsx"] },
      { dir: "packages/ui/src/components", extensions: [".tsx"] },
    ],
    pattern: /\bring-ring(?:\/\d+)?\b/g,
    allowlist: {},
  },
  {
    id: "operator-no-stat-metric",
    description:
      "Operator surfaces are job-first, not dashboards: numbers appear as badges on tiles/sections ONLY (design-system.md § Structural C -> Canonical operator-home skeleton). AppLinkCard's `metric` slot renders a mono stat readout and belongs to Admin Dashboard surfaces; under /br/ route the count through the `badge` slot.",
    roots: [{ dir: "apps/web/app/(protected)/br", extensions: [".tsx"] }],
    pattern: /\bmetric=\{/g,
    allowlist: {},
  },
  {
    id: "status-focus-ring-contrast",
    description:
      "A status-token focus ring at /NN alpha measures 1.1-1.4:1 and cannot serve as the focus indicator (WCAG 1.4.11 needs 3:1). Let the base ring-foreground keyline win, or pair the halo with a solid focus-visible:border-{status}. focus-visible:ring-primary/NN is exempt: the form-control primitives pair it with a solid focus-visible:border-primary.",
    roots: [
      { dir: "apps/web/app", extensions: [".tsx"] },
      { dir: "apps/web/lib", extensions: [".tsx"] },
      { dir: "packages/ui/src/components", extensions: [".tsx"] },
    ],
    pattern: /focus-visible:ring-(?:destructive|success|warning|info)\/\d+/g,
    allowlist: {},
  },
  {
    id: "status-foreground-on-tint",
    description:
      "--{status}-foreground is text on the SOLID status fill. On a /NN tint it inverts per theme: it reads in light mode but lands at ~1.3:1 on the night surface. Tinted chrome uses the plain ink token (text-warning on bg-warning/15).",
    roots: [
      { dir: "apps/web/app", extensions: [".tsx"] },
      { dir: "apps/web/lib", extensions: [".tsx"] },
      { dir: "packages/ui/src/components", extensions: [".tsx"] },
    ],
    pattern:
      /['"`][^'"`]*(?:(?<![:\w-])(?:dark:)?bg-(warning|success|destructive|info)\/\d+\b[^'"`]*\btext-\1-foreground\b|\btext-(warning|success|destructive|info)-foreground\b[^'"`]*(?<![:\w-])(?:dark:)?bg-\2\/\d+\b)/g,
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
    id: "app-transition-all",
    description:
      "App UI motion must name the transitioned properties instead of using transition-all.",
    roots: uiRuntimeRoots([".ts", ".tsx"]),
    pattern: /\b(?:motion-safe:)?transition-all\b/g,
    allowlist: {},
  },
  {
    id: "app-loading-spinner-ssot",
    description:
      "App loading indicators use Spinner/PageSpinner; raw Loader2/LoaderCircle icons with animate-spin are primitive-owned.",
    roots: uiRuntimeRoots([".tsx"]),
    pattern: /\b(?:Loader2|LoaderCircle|IconLoader2|animate-spin)\b/g,
    allowlist: {},
  },
  {
    id: "app-presentation-state-copy",
    description:
      "App presentation surfaces keep loading, empty, and error copy in shared messages/adapters, not route-local literals.",
    roots: uiRuntimeRoots([".tsx"]),
    pattern:
      /["'`](?:[^\n"'`]*(?:Đang tải|Không có dữ liệu|Chưa có dữ liệu|Không thể tải|No data|Loading|Error loading)[^\n"'`]*)["'`]/g,
    allowlist: {},
  },
  {
    id: "app-action-data-state-copy",
    description:
      "Action/data files keep user-facing loading, empty, and error copy in shared messages instead of route-local literals.",
    roots: uiRuntimeRoots([".ts"]),
    pattern:
      /["'`](?:[^\n"'`]*(?:Đang tải|Không có dữ liệu|Chưa có dữ liệu|Không thể tải|No data|Loading|Error loading)[^\n"'`]*)["'`]/g,
    allowlist: {},
  },
  ...formatterGuards,
  {
    id: "browser-chrome-theme-color-source",
    description:
      "Browser/PWA chrome theme colors are single-sourced in apps/web/app/_lib/theme-tokens.ts.",
    roots: [{ dir: "apps/web/app", extensions: [".ts", ".tsx"] }],
    pattern: /#(?:fff6ee|120a06)\b/gi,
    allowlist: {
      "apps/web/app/_lib/theme-tokens.ts": 2,
    },
  },
  {
    id: "root-viewport-allows-zoom",
    description:
      "Root viewport must not disable user zoom; mobile/touch UX must stay accessible.",
    roots: [{ dir: "apps/web/app", extensions: [".ts", ".tsx"] }],
    pattern:
      /\b(?:maximumScale:\s*1|userScalable:\s*false|maximum-scale\s*=\s*1|user-scalable\s*=\s*no)\b/g,
    allowlist: {},
  },
  {
    id: "scrollarea-no-max-height-only",
    description:
      "ScrollArea must not be used with max-h-* only; use a definite height/flex constraint or plain overflow.",
    roots: [
      { dir: "apps/web/app", extensions: [".tsx"] },
      { dir: "apps/web/lib", extensions: [".tsx"] },
    ],
    pattern: /<ScrollArea\b[^>]*\bmax-h-/g,
    allowlist: {},
  },
  {
    id: "no-native-dialog",
    description:
      "Use confirm() from @comtammatu/ui/components/confirm-dialog and Sonner toasts; native window.confirm/alert are forbidden.",
    roots: uiRuntimeRoots([".ts", ".tsx"]),
    pattern: /window\.(?:confirm|alert)\(/g,
    allowlist: {},
  },
  {
    id: "responsive-double-render",
    description:
      "Parallel mobile/desktop JSX trees (hidden … md:block twins) must not spread; migrate list surfaces to the shared DataTable adapter instead.",
    roots: uiRuntimeRoots([".tsx"]),
    pattern: /\bhidden\b[^"'\n]*\bmd:block\b/g,
    allowlist: {},
  },
  {
    id: "nav-shell-inline-literal",
    description:
      "Navigation is data: a shell must project nav-config.ts through a shared resolver instead of defining an inline ShellNavGroup[] literal (design-system.md § D / D019).",
    roots: [{ dir: "apps/web/app", extensions: [".tsx"] }],
    pattern: /ShellNavGroup\[\]\s*=\s*\[/g,
    allowlist: {},
  },
  {
    id: "operator-admin-dashboard-shell-boundary",
    description:
      "Branch runtime, Operations, and employee-lib surfaces must not import or render Admin Dashboard chrome. Use the operator layout, AppHeader/AppBottomNav, EmployeePage, or embedded PageContent branches instead.",
    roots: [
      {
        dir: "apps/web/app/(protected)/br/[branchId]",
        extensions: [".ts", ".tsx"],
      },
      { dir: "apps/web/lib/staff-runtime", extensions: [".ts", ".tsx"] },
    ],
    pattern:
      /\b(?:AdminDashboardModuleShell|OfficeModuleShell|ManagementShell|AppShell|FinanceShell|InventoryShell|resolveAdminDashboard(?:PrimaryTabs|DeepNav)|resolveOffice(?:PrimaryTabs|DeepNav))\b|["'][^"']*(?:admin-dashboard-module-shell|office-module-shell|management-chrome|app-shell|admin-dashboard-nav|office-nav|finance-shell|inventory-shell)["']|from\s+["']@\/\(protected\)\/inventory\/(?!_lib\/)(?!(?:[^"']*\/)?[^/"']*actions(?:\.ts)?["'])[^"']+["']/g,
    allowlist: {
      "apps/web/app/(protected)/br/[branchId]/(operator)/stock/catalog/ingredients/catalog-ingredients-client.tsx": 1,
      "apps/web/app/(protected)/br/[branchId]/(operator)/stock/catalog/suppliers/catalog-suppliers-client.tsx": 1,
      "apps/web/app/(protected)/br/[branchId]/(operator)/stock/catalog/suppliers/page.tsx": 1,
      "apps/web/app/(protected)/br/[branchId]/(operator)/stock/catalog/thresholds/page.tsx": 1,
      "apps/web/app/(protected)/br/[branchId]/(operator)/stock/grn/[id]/grn-review-operator-client.tsx": 1,
      "apps/web/app/(protected)/br/[branchId]/(operator)/stock/grn/_components/grn-line-sheet.tsx": 1,
      "apps/web/app/(protected)/br/[branchId]/(operator)/stock/production/[id]/branch-production-detail-client.tsx": 1,
      "apps/web/app/(protected)/br/[branchId]/(operator)/stock/production/new/branch-production-new-client.tsx": 1,
      "apps/web/app/(protected)/br/[branchId]/(operator)/stock/production/new/page.tsx": 1,
      "apps/web/app/(protected)/br/[branchId]/(operator)/stock/production/page.tsx": 1,
      "apps/web/app/(protected)/br/[branchId]/(operator)/stock/stocktake/[id]/count/branch-stocktake-count-client.tsx": 3,
      "apps/web/app/(protected)/br/[branchId]/(operator)/stock/stocktake/new/branch-stocktake-new-client.tsx": 1,
      "apps/web/app/(protected)/br/[branchId]/(operator)/stock/transfer/page.tsx": 1,
      "apps/web/app/(protected)/br/[branchId]/(operator)/stock/waste-approvals/branch-waste-approvals-client.tsx": 1,
      "apps/web/app/(protected)/br/[branchId]/(operator)/stock/waste/branch-waste-create-client.tsx": 6,
    },
  },
  {
    id: "operator-admin-dashboard-route-boundary",
    description:
      "Branch operator routes must not link or redirect into Admin Dashboard route roots; keep work inside /br/[branchId] or an approved utility surface.",
    roots: [
      {
        dir: "apps/web/app/(protected)/br/[branchId]/(operator)",
        extensions: [".ts", ".tsx"],
      },
      {
        dir: "apps/web/lib/staff-runtime",
        extensions: [".ts", ".tsx"],
      },
    ],
    pattern:
      /["'`]\/(?:admin|finance|inventory|menu|orders|branches|hr)(?:\/|["'`?#])/g,
    allowlist: {},
  },
  {
    id: "pos-kds-touch-reveal",
    description:
      "POS/KDS touch surfaces must not add hover-only reveal mechanisms; use visible copy, NoteCallout, tap-to-expand, or multi-line layout instead of native title attributes or Tooltip.",
    roots: [
      {
        dir: "apps/web/app/(protected)/br/[branchId]/pos",
        extensions: [".tsx"],
      },
      {
        dir: "apps/web/app/(protected)/br/[branchId]/kds",
        extensions: [".tsx"],
      },
    ],
    pattern:
      /<(?:div|span|p|button|a|li|h[1-6]|td|th)\b[^>]*\btitle\s*=|<Tooltip\b/g,
    allowlist: {},
  },
];

const failures = [];
const UI_CONTRACT_SOURCE = fs.readFileSync(SELF_PATH, "utf8");
const UI_AUDIT_SOURCE = fs.readFileSync(
  path.join(REPO_ROOT, "scripts/audit-ui-components.mjs"),
  "utf8",
);
failures.push(...validateAuditSignalGuardCoverage(UI_CONTRACT_SOURCE));
const guardReporting = buildUiContractGuardReporting(
  UI_CONTRACT_SOURCE,
  UI_AUDIT_SOURCE,
);
failures.push(
  ...guardReporting.errors.map((error) => `guard-ownership: ${error}`),
);
const componentRegistry = validateUiComponentRegistry(REPO_ROOT);
failures.push(
  ...componentRegistry.errors.map(
    (error) => `component-selection-coverage: ${error}`,
  ),
);

if (fs.existsSync(path.join(REPO_ROOT, "docs/archive"))) {
  failures.push("legacy-docs: docs/archive must not exist");
}

const blockedRootContextFiles = new Map([
  ["PRODUCT.md", "use docs/ref/business-context.md"],
  ["DESIGN.md", "use docs/spec/design-system.md"],
  [
    "theme.json",
    "route visual tokens through packages/ui/src/styles/globals.css and docs/spec/design-system.md",
  ],
  [
    "tokens.json",
    "route visual tokens through packages/ui/src/styles/globals.css and docs/spec/design-system.md",
  ],
  [
    "brand-overrides.css",
    "route visual overrides through packages/ui/src/styles/globals.css and docs/spec/design-system.md",
  ],
]);

for (const [blockedRootContextFile, replacement] of blockedRootContextFiles) {
  if (fs.existsSync(path.join(REPO_ROOT, blockedRootContextFile))) {
    failures.push(
      `external-design-context: root ${blockedRootContextFile} must not exist; ${replacement}`,
    );
  }
}

if (fs.existsSync(path.join(REPO_ROOT, "design-systems"))) {
  failures.push(
    "external-design-context: root design-systems/ must not exist; use docs/spec/design-system.md",
  );
}

const packageManifestPaths = [
  path.join(REPO_ROOT, "package.json"),
  ...walkFiles("apps", ["package.json"]),
  ...walkFiles("packages", ["package.json"]),
];

const retiredPrimitiveDependencies = new Set(["cmdk", "radix-ui", "vaul"]);

for (const packageManifestPath of packageManifestPaths) {
  const packageManifest = JSON.parse(
    fs.readFileSync(packageManifestPath, "utf8"),
  );
  const relativePath = toPosix(packageManifestPath);
  for (const dependencyField of [
    "dependencies",
    "devDependencies",
    "peerDependencies",
    "optionalDependencies",
  ]) {
    for (const dependencyName of Object.keys(
      packageManifest[dependencyField] ?? {},
    )) {
      if (
        dependencyName === "shadcn" ||
        dependencyName.startsWith("@shadcn/")
      ) {
        failures.push(
          `external-design-context: ${relativePath} must not depend on ${dependencyName}; shadcn scaffold tooling is retired`,
        );
      }
      if (
        retiredPrimitiveDependencies.has(dependencyName) ||
        dependencyName.startsWith("@radix-ui/")
      ) {
        failures.push(
          `matu-ds-boundary: ${relativePath} must not depend on ${dependencyName}; use Base UI or a native Má Tư adapter`,
        );
      }
    }
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
    if (webPackageJson[dependencyField]?.["class-variance-authority"]) {
      failures.push(
        `matu-ds-boundary: apps/web/package.json must not depend on class-variance-authority directly; keep variant helpers in @comtammatu/ui or plain app adapter maps`,
      );
    }
  }
}

for (const file of [
  ...walkFiles("apps", [".ts", ".tsx", ".css"]),
  ...walkFiles("packages", [".ts", ".tsx", ".css"]),
].filter((file) => !toPosix(file).includes("/tests/"))) {
  const relativePath = toPosix(file);
  const content = fs.readFileSync(file, "utf8");
  if (
    /from\s+["'](?:cmdk|radix-ui|vaul|@radix-ui\/[^"']+)["']|--radix-|data-vaul/.test(
      content,
    )
  ) {
    failures.push(
      `matu-ds-boundary: ${relativePath} still contains a retired primitive reference`,
    );
  }
  if (
    relativePath.startsWith("apps/web/") &&
    /from\s+["']class-variance-authority["']/.test(content)
  ) {
    failures.push(
      `matu-ds-boundary: ${relativePath} imports class-variance-authority directly; keep variant helpers in @comtammatu/ui or plain app adapter maps`,
    );
  }
  if (
    !relativePath.startsWith("packages/ui/") &&
    /from\s+["']@base-ui\/react(?:\/[^"']*)?["']/.test(content)
  ) {
    failures.push(
      `matu-ds-boundary: ${relativePath} imports Base UI directly; expose behavior through @comtammatu/ui instead`,
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
    id: "design-system-runtime-token-contract",
    file: "docs/spec/design-system.md",
    includes: [
      "Tier: `tier-elite`, `tier-note`",
      "`packages/ui/src/components/theme-provider.tsx` is the only runtime theme",
      "`max-h-dvh-95` and `max-h-dvh-80`",
      "`pos-safe-bottom` is limited to POS PWA floating bottom bars.",
      "`chrome-safe-pb` / `chrome-safe-top`",
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
    includes: ["Use Má Tư DS primitives and approved surface adapters"],
  },
  {
    id: "matu-ds-module-doc",
    file: "docs/modules/ui.md",
    includes: ["Runtime hiện tại: Má Tư DS primitives"],
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

for (const check of checks) {
  if (typeof check.custom === "function") {
    check.custom();
    continue;
  }

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
const ROUTE_MANIFEST_SHIM_ROUTES = new Set(["/br", "/inventory/drafts"]);
// ACL family roots without a landing page still resolve through shared ACL.
const ROUTE_MANIFEST_NO_PAGE_ACL = new Set();

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
const rootPage = "apps/web/app/page.tsx";
const routeManifestPages = fs.existsSync(path.join(REPO_ROOT, rootPage))
  ? [...protectedPages, rootPage]
  : protectedPages;
const landingRouteSet = new Set(routeManifestPages.map(routePathFromPageFile));

for (const file of protectedPages) {
  const route = routePathFromPageFile(file);
  if (!resolveFamilyPath(route) && !ROUTE_MANIFEST_SHIM_ROUTES.has(route)) {
    failures.push(
      `route-manifest: ${file} (${route}) resolves to no MODULE_ACL family. Place it under a declared family in ${MODULE_ACL_SOURCE} or make it a redirect shim (design-system.md § C / D019).`,
    );
  }
}

for (const filePath of walkUiRuntimeFiles([".tsx"])) {
  const normalized = toPosix(filePath);
  const content = fs.readFileSync(filePath, "utf8");
  const count = countMatches(content, /<table\b/g);
  if (count > 0) {
    failures.push(
      `raw-table-element: ${normalized} renders ${count} raw <table> element(s). Use DataTable, TableEmptyStateRow, or the shared Table primitive through an approved adapter.`,
    );
  }
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

// page-archetype (design-system.md § F / D058 W5): every protected page.tsx
// declares exactly one archetype id from docs/spec/page-archetypes.md. This is
// a mapping-presence gate only — it does not regex-enforce recipe internals
// (which primitives a page actually renders stays a review concern); it just
// keeps every page inside the declared taxonomy so a new page cannot land
// without an owner picking its archetype. EMBED-WRAPPER carries two cheap
// signature checks (line count, no local fetch) because that archetype's
// entire contract is "delegate, nothing else" — the other archetypes do not
// get signature checks here for the same reason recipe compliance stays
// review-owned.
const VALID_ARCHETYPES = new Set([
  "LIST",
  "EMBED-WRAPPER",
  "DETAIL",
  "SETTINGS-PANEL",
  "DOC-WORKFLOW",
  "REDIRECT-SHIM",
  "HUB",
  "REPORT",
  "DASHBOARD",
  "GATE/AUTH",
  "BOARD",
  "PUBLIC-WORKFLOW",
]);

const allPageFiles = walkFiles("apps/web/app", [".tsx"])
  .map(toPosix)
  .filter((file) => file.endsWith("/page.tsx"));

for (const file of allPageFiles) {
  const archetype = PAGE_ARCHETYPES[file];
  if (!archetype) {
    failures.push(
      `page-archetype: ${file} has no archetype entry in PAGE_ARCHETYPES. Pick an archetype from docs/spec/page-archetypes.md and add it to scripts/check-ui-contract.mjs.`,
    );
    continue;
  }
  if (!VALID_ARCHETYPES.has(archetype)) {
    failures.push(
      `page-archetype: ${file} declares unknown archetype "${archetype}". Valid ids are documented in docs/spec/page-archetypes.md § 2.`,
    );
  }
}

for (const file of Object.keys(PAGE_ARCHETYPES)) {
  if (!allPageFiles.includes(file)) {
    failures.push(
      `page-archetype: PAGE_ARCHETYPES has a dead entry for ${file}, which no longer exists. Remove it from scripts/check-ui-contract.mjs.`,
    );
  }
}

function findNearestRouteBoundary(pageFile, boundaryFile) {
  const appRoot = path.join(REPO_ROOT, "apps/web/app");
  let currentDir = path.dirname(path.join(REPO_ROOT, pageFile));

  while (currentDir.startsWith(appRoot)) {
    const candidate = path.join(currentDir, boundaryFile);
    if (fs.existsSync(candidate)) return toPosix(candidate);
    if (currentDir === appRoot) break;
    currentDir = path.dirname(currentDir);
  }

  return null;
}

for (const file of allPageFiles) {
  for (const boundaryFile of ["loading.tsx", "error.tsx"]) {
    if (findNearestRouteBoundary(file, boundaryFile)) continue;
    failures.push(
      `route-boundary-coverage: ${file} cannot resolve an inherited ${boundaryFile}. Add a route-family boundary using the shared adapter or restore the app-level boundary.`,
    );
  }
}

for (const file of allPageFiles) {
  if (PAGE_ARCHETYPES[file] !== "EMBED-WRAPPER") continue;
  const content = fs.readFileSync(path.join(REPO_ROOT, file), "utf8");
  const lineCount = content.split("\n").length;
  if (lineCount > 40) {
    failures.push(
      `page-archetype: ${file} is an EMBED-WRAPPER with ${lineCount} lines (limit 40). EMBED-WRAPPER pages only delegate to a canonical *PageContent export (docs/spec/page-archetypes.md § EMBED-WRAPPER).`,
    );
  }
  if (/\bcreateClient\s*\(|\.from\(\s*["'`]/.test(content)) {
    failures.push(
      `page-archetype: ${file} is an EMBED-WRAPPER with a local Supabase call. EMBED-WRAPPER pages must have zero local fetch — delegate to the canonical *PageContent export (docs/spec/page-archetypes.md § EMBED-WRAPPER).`,
    );
  }
}

for (const file of allPageFiles) {
  if (PAGE_ARCHETYPES[file] !== "REDIRECT-SHIM") continue;
  const content = fs.readFileSync(path.join(REPO_ROOT, file), "utf8");
  if (content.includes("return (") || content.includes("return <")) {
    failures.push(
      `page-archetype: ${file} is a REDIRECT-SHIM that renders JSX. REDIRECT-SHIM is redirect()-only (docs/spec/page-archetypes.md § REDIRECT-SHIM).`,
    );
  }
}

// button-height-on-button (D030): the touch-height check is scoped to action
// elements (<Button>/<TouchButton>/<button>/<Link>). A raw h-10..h-44 or
// min-h-12..min-h-24 on an action is height drift that should use a size
// variant; raw heights on
// non-button elements (Input/Select/Skeleton/layout containers) are out of
// scope by design (design-system.md § Enforcement Status — the old "any raw
// height" gate was ~37 non-button false-positives). The tag scanner is
// brace/string-aware, so cn() and multi-line className props are covered. The
// Form-control trigger buttons route through size="field".
const BUTTON_HEIGHT_TOKEN =
  /\b(?:h-(?:10|11|12|14|16|20|24|28|32|36|40|44)|min-h-(?:12|14|16|20|24))\b/;
const NATIVE_INTERACTIVE_EXCEPTIONS = new Set([
  "apps/web/app/global-error.tsx",
]);
for (const filePath of walkUiRuntimeFiles([".tsx"])) {
  const normalized = toPosix(filePath);
  if (NATIVE_INTERACTIVE_EXCEPTIONS.has(normalized)) continue;
  const content = fs.readFileSync(filePath, "utf8");
  const count = countNativeInteractiveElement(content);
  if (count > 0) {
    failures.push(
      `native-interactive-element: ${normalized} has ${count} raw native action(s). Use Button/Link via a Má Tư DS primitive; keep raw anchors only for hash/tel/external links or primitive render children.`,
    );
  }
}
for (const filePath of walkUiRuntimeFiles([".tsx"])) {
  const normalized = toPosix(filePath);
  const content = fs.readFileSync(filePath, "utf8");
  const count = countIconButtonAriaRisk(content);
  if (count > 0) {
    failures.push(
      `icon-button-accessible-name: ${normalized} has ${count} icon-only Button(s) without an accessible name. Add aria-label/aria-labelledby or sr-only text.`,
    );
  }
}
for (const filePath of walkUiRuntimeFiles([".tsx"])) {
  const normalized = toPosix(filePath);
  if (
    !normalized.endsWith("/loading.tsx") &&
    !normalized.endsWith("/error.tsx")
  ) {
    continue;
  }
  const content = fs.readFileSync(filePath, "utf8");
  if (
    normalized.endsWith("/loading.tsx") &&
    !/\b(PageSkeleton|PageSpinner)\b/.test(content)
  ) {
    failures.push(
      `route-boundary-adapters: ${normalized} must render PageSkeleton or PageSpinner.`,
    );
  }
  if (normalized.endsWith("/error.tsx") && !/\bErrorPanel\b/.test(content)) {
    failures.push(
      `route-boundary-adapters: ${normalized} must delegate to ErrorPanel.`,
    );
  }
}
for (const filePath of walkUiRuntimeFiles([".tsx"])) {
  const normalized = toPosix(filePath);
  const content = fs.readFileSync(filePath, "utf8");
  let count = 0;
  for (const tagName of ["Button", "TouchButton", "button", "Link"]) {
    for (const tag of extractJsxOpeningTags(content, tagName)) {
      if (BUTTON_HEIGHT_TOKEN.test(tag)) count += 1;
    }
  }
  if (count > 0) {
    failures.push(
      `button-height-on-button: ${normalized} has ${count} action raw height(s). Use a Button size variant; non-action heights are out of scope (design-system.md § Enforcement Status / D030).`,
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

console.log("UI contract check: outcome boundaries pass.");
