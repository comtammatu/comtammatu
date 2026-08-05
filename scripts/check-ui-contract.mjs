import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { PAGE_ARCHETYPES, PAGE_DISPOSITIONS } from "./page-archetypes.mjs";
import {
  APP_ADAPTER_REGISTRY,
  DOMAIN_ADAPTER_FAMILIES,
  validateUiComponentRegistry,
} from "./ui-component-registry.mjs";
import {
  buildUiContractGuardReporting,
  UI_CONTRACT_LINT_ONLY_GROUPS,
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

function collectPatternCounts(check) {
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

  return seen;
}

function totalBudgetFailure(check, seen) {
  const count = [...seen.values()].reduce((sum, value) => sum + value, 0);
  return count > check.maxCount
    ? `${check.id}: repository has ${count} hit(s), allowed ${check.maxCount}`
    : null;
}

function perFileBudgetFailures(check, seen) {
  const errors = [];
  for (const [filePath, count] of seen) {
    const allowed = check.allowlist[filePath] ?? 0;
    if (count > allowed) {
      errors.push(
        `${check.id}: ${filePath} has ${count} hit(s), allowed ${allowed}`,
      );
    }
  }
  return errors;
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
  const allowedStatuses = new Set(["blocking-zero", "advisory"]);

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
    if (status === "advisory" && !/reason:\s*["']/.test(entryBody)) {
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

function countRawInputFixedHeightTags(content) {
  return extractJsxOpeningTags(content, "Input").filter(
    (tag) =>
      /\bclassName\s*=/.test(tag) && /\bh-(?:10|11|12|14|16)\b/.test(tag),
  ).length;
}

function collectRawInputFixedHeightCounts() {
  const seen = new Map();
  for (const filePath of walkUiRuntimeFiles([".tsx"])) {
    const file = toPosix(filePath);
    if (file.startsWith("apps/web/app/components/form/")) continue;
    const content = fs.readFileSync(filePath, "utf8");
    if (!/from\s+["']@comtammatu\/ui\/components\/input["']/.test(content)) {
      continue;
    }
    const count = countRawInputFixedHeightTags(content);
    if (count > 0) seen.set(file, count);
  }
  return seen;
}

const rawInputFixedHeightCheck = {
  id: "raw-input-fixed-height-baseline",
  description:
    "Route Inputs select default, field, or touch size semantically; raw fixed-height class patches are forbidden.",
  allowlist: {},
  custom() {
    failures.push(
      ...perFileBudgetFailures(
        rawInputFixedHeightCheck,
        collectRawInputFixedHeightCounts(),
      ),
    );
  },
};

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
  rawInputFixedHeightCheck,
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
    id: "legacy-css-variable-name",
    description:
      "CSS variable names must express current semantics; legacy/old/v1/compat aliases require a consumer migration and removal instead of becoming permanent tokens.",
    roots: [
      { dir: "apps/web", extensions: [".css"] },
      { dir: "packages/ui/src/styles", extensions: [".css"] },
    ],
    pattern:
      /--(?:[a-z0-9]+-)*(?:legacy|old|v1|compat)(?:-[a-z0-9]+)*(?=\s*:)/gi,
    allowlist: {},
  },
  {
    id: "input-legacy-size-prop",
    description:
      "Input and Input-derived wrappers use controlSize; the native size name is not a compatibility alias or a route-level visual API.",
    roots: uiRuntimeRoots([".tsx"]),
    pattern:
      /<(?:Input|FormattedNumberInput|MoneyVndInput|QuantityInput)\b[^>]*\bsize=/gs,
    allowlist: {},
  },
  {
    id: "retired-utility-reference",
    description:
      "Removed no-consumer utilities must not return as silent class names or duplicate CSS definitions.",
    roots: [
      ...uiRuntimeRoots([".ts", ".tsx"]),
      { dir: "packages/ui/src/styles", extensions: [".css"] },
    ],
    pattern: /\b(?:bg-glass-nav|scrollbar-thin|active-touch-press)\b/g,
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
      "Operator surfaces are job-first, not dashboards: numbers appear as badges on tiles/sections ONLY (design-system.md § Structural C -> Canonical operator-home skeleton). AppLinkCard's `metric` slot renders a mono stat readout and belongs to Owner surface surfaces; under /br/ route the count through the `badge` slot.",
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
    id: "operator-owner-shell-boundary",
    description:
      "Branch runtime, Operations, and employee-lib surfaces must not import or render Owner surface chrome or import Owner inventory modules outside Server Actions. Use shared lib modules or the operator layout instead.",
    roots: [
      {
        dir: "apps/web/app/(protected)/br/[branchId]",
        extensions: [".ts", ".tsx"],
      },
      { dir: "apps/web/lib/staff-runtime", extensions: [".ts", ".tsx"] },
    ],
    pattern:
      /\b(?:OwnerModuleShell|ControlSurfaceShell|OfficeModuleShell|ManagementShell|AppShell|FinanceShell|InventoryShell|resolveOwner(?:PrimaryTabs|DeepNav)|resolveControlSurface(?:PrimaryTabs|CoreDeepNav|DeepNav)|resolveOffice(?:PrimaryTabs|DeepNav))\b|["'][^"']*(?:owner-module-shell|control-surface-shell|office-module-shell|management-chrome|app-shell|owner-nav|control-surface-nav|office-nav|finance-shell|inventory-shell)["']|from\s+["']@\/\(protected\)\/inventory\/(?!(?:[^"']*\/)?[^/"']*actions(?:\.ts)?["'])[^"']+["']/g,
    allowlist: {
      "apps/web/app/(protected)/br/[branchId]/(operator)/stock/catalog/ingredients/catalog-ingredients-client.tsx": 1,
      "apps/web/app/(protected)/br/[branchId]/(operator)/stock/catalog/suppliers/catalog-suppliers-client.tsx": 1,
      "apps/web/app/(protected)/br/[branchId]/(operator)/stock/catalog/suppliers/page.tsx": 1,
      "apps/web/app/(protected)/br/[branchId]/(operator)/stock/catalog/thresholds/page.tsx": 1,
      "apps/web/app/(protected)/br/[branchId]/(operator)/stock/grn/[id]/grn-review-operator-client.tsx": 1,
      "apps/web/app/(protected)/br/[branchId]/(operator)/stock/grn/_components/grn-line-sheet.tsx": 1,
      "apps/web/app/(protected)/br/[branchId]/(operator)/stock/production/[id]/branch-production-detail-client.tsx": 2,
      "apps/web/app/(protected)/br/[branchId]/(operator)/stock/production/new/branch-production-new-client.tsx": 3,
      "apps/web/app/(protected)/br/[branchId]/(operator)/stock/production/new/page.tsx": 1,
      "apps/web/app/(protected)/br/[branchId]/(operator)/stock/production/page.tsx": 1,
      "apps/web/app/(protected)/br/[branchId]/(operator)/stock/purchase-requests/page.tsx": 3,
      "apps/web/app/(protected)/br/[branchId]/(operator)/stock/stocktake/[id]/count/branch-stocktake-count-client.tsx": 3,
      "apps/web/app/(protected)/br/[branchId]/(operator)/stock/stocktake/new/branch-stocktake-new-client.tsx": 1,
      "apps/web/app/(protected)/br/[branchId]/(operator)/stock/transfer/new/page.tsx": 1,
      "apps/web/app/(protected)/br/[branchId]/(operator)/stock/transfer/page.tsx": 1,
      "apps/web/app/(protected)/br/[branchId]/(operator)/stock/waste-approvals/branch-waste-approvals-client.tsx": 1,
      "apps/web/app/(protected)/br/[branchId]/(operator)/stock/waste/branch-waste-create-client.tsx": 7,
      "apps/web/app/(protected)/br/[branchId]/(operator)/settings/pos/page.tsx": 1,
      "apps/web/app/(protected)/br/[branchId]/(operator)/stock/issues/[id]/branch-stock-issue-detail-client.tsx": 1,
      "apps/web/app/(protected)/br/[branchId]/(operator)/stock/on-hand/[ingredientId]/branch-stock-ingredient-detail.tsx": 1,
      "apps/web/app/(protected)/br/[branchId]/(operator)/stock/on-hand/branch-stock-on-hand-client.tsx": 2,
    },
  },
  {
    id: "operator-owner-route-boundary",
    description:
      "Branch operator routes must not link or redirect into Owner surface route roots; keep work inside /br/[branchId] or an approved utility surface.",
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
      /["'`]\/(?:finance|inventory|menu|orders|branches|hr|settings)(?:\/|["'`?#])/g,
    allowlist: {
      "apps/web/app/(protected)/br/[branchId]/(operator)/stock/production/page.tsx": 1,
      "apps/web/app/(protected)/br/[branchId]/(operator)/stock/production/new/page.tsx": 1,
      "apps/web/app/(protected)/br/[branchId]/(operator)/stock/production/[id]/page.tsx": 1,
    },
  },
  {
    id: "owner-page-header-no-module-eyebrow",
    description:
      "Owner control_surface AppPageHeader must not repeat sidebar module labels or marketing synonyms as eyebrow; keep contextual eyebrows only (site-kind, workflow surface).",
    roots: [
      { dir: "apps/web/app/(protected)/inventory", extensions: [".tsx"] },
      { dir: "apps/web/app/(protected)/orders", extensions: [".tsx"] },
      { dir: "apps/web/app/(protected)/menu", extensions: [".tsx"] },
      { dir: "apps/web/app/(protected)/hr", extensions: [".tsx"] },
      { dir: "apps/web/app/(protected)/finance", extensions: [".tsx"] },
      { dir: "apps/web/app/(protected)/branches", extensions: [".tsx"] },
      { dir: "apps/web/app/(protected)/settings", extensions: [".tsx"] },
      { dir: "apps/web/app/(protected)/feedback", extensions: [".tsx"] },
      { dir: "apps/web/app/_components", extensions: [".tsx"] },
    ],
    pattern:
      /eyebrow=\{(?:messages\.inventory\.shell\.moduleName|INVENTORY_VI\.warehouse|INVENTORY_VI\.countAssignEyebrow|MENU_VI\.eyebrow|ORDERS_COPY\.eyebrow|APP_COPY_VI\.hrWorkspace|messages\.hr\.workspace\.eyebrow|workspaceCopy\.eyebrow|getModuleLabelVi\([^)]*\)|copy\.settingsHomeEyebrow|messages\.settings\.pages\.settingsEyebrow|messages\.inventory\.value\.eyebrow|messages\.inventory\.stocktake\.title|messages\.finance\.foodCost\.eyebrow|GRN_CREATE_COPY\.newReceiptEyebrow|revCopy\.page\.eyebrow|copy\.page\.eyebrow|detailCopy\.eyebrow|copy\.eyebrow|eyebrowLabel)\}|eyebrow=["']Kho hàng["']|eyebrow=["']Kho["']|eyebrow\s*=\s*["']Kho hàng["']/g,
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

// Root DESIGN.md is blocked. Allowed Stitch/agent mirror: `.stitch/DESIGN.md`
// (seeded from docs/spec/design-system.md; never a second product SSOT).
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
  if (/\bComboboxPrimitive\b/.test(content)) {
    failures.push(
      `matu-ds-boundary: ${relativePath} consumes or exports the raw Combobox primitive namespace; use the typed shared Combobox components`,
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

function isHistoricalSqlSnapshot(filePath) {
  const relativePath = toPosix(filePath);
  return (
    relativePath.startsWith("supabase/migration-archive/") ||
    /supabase\/migrations\/\d{14}_baseline\.sql$/.test(relativePath)
  );
}

for (const file of legacyDocReferenceFiles.filter(
  (file) => !isHistoricalSqlSnapshot(file),
)) {
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
    id: "input-control-size-api",
    files: ["packages/ui/src/components/input.tsx"],
    pattern:
      /\bVariantProps\s*<\s*typeof\s+inputVariants\s*>|\bcontrolSize\s*\?\?\s*size\b|\bcontrolSize\s*\?\?\s*[^\n]*\?\?\s*["']default["']/g,
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
    id: "input-group-direct-input-contract",
    file: "packages/ui/src/components/input-group.tsx",
    includes: [
      "has-[>input:focus-visible]:ring-2",
      "[&>input]:rounded-none",
      "[&>input]:border-0",
      "[&>input]:focus-visible:ring-0",
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
    id: "owner-page-header-no-module-eyebrow-docs",
    file: "docs/spec/page-archetypes.md",
    includes: [
      "**no** module-name eyebrow — the",
      "control_surface sidebar + deep-nav already own module context",
    ],
  },
  {
    id: "owner-page-header-no-module-eyebrow-design-system",
    file: "docs/spec/design-system.md",
    includes: [
      "AppPageHeader.eyebrow` MUST NOT repeat the primary sidebar module",
    ],
  },
  {
    id: "owner-page-header-no-module-eyebrow-module-doc",
    file: "docs/modules/ui.md",
    includes: ["không** dùng `eyebrow` để lặp tên module"],
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
    includes: ["shared component source: `packages/ui/src/components/*`"],
  },
  {
    id: "matu-ds-agent-rule",
    file: "docs/agent/rules/ui.md",
    includes: ["Use Má Tư DS shared components and approved surface adapters"],
  },
  {
    id: "matu-ds-module-doc",
    file: "docs/modules/ui.md",
    includes: ["Runtime hiện tại: Má Tư DS shared components"],
  },
  {
    id: "readme-ui-runtime-current",
    file: "README.md",
    includes: ["Má Tư Design System shared components (`@comtammatu/ui`)"],
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

const countBudgets = [
  {
    id: "card-title-classname-baseline",
    description:
      "CardTitle className overrides are heading-scale debt and must not increase.",
    roots: [{ dir: "apps/web/app", extensions: [".tsx"] }],
    pattern: /<CardTitle\b[^\n]*\bclassName=/g,
    maxCount: 0,
  },
  {
    id: "raw-hover-shadow",
    description:
      "Interactive UI elevation uses the named card-hover effect instead of raw Tailwind shadow utilities.",
    roots: uiRuntimeRoots([".tsx"]),
    pattern: /\bhover:shadow-(?!effect-)[^\s"']+/g,
    maxCount: 0,
  },
  {
    id: "input-group-child-chrome",
    description:
      "InputGroup owns direct-input border, background, shadow, and focus-ring normalization; route callers keep only semantic text or density classes.",
    roots: uiRuntimeRoots([".tsx"]),
    pattern: /\brounded-none\b[^"'\n]*\bborder-0\b[^"'\n]*\bbg-transparent\b/g,
    maxCount: 0,
  },
];

const perFileCountBudgets = [
  {
    id: "heading-weight-lock",
    description:
      "Headings use semibold; bold is restricted to the documented print-mode page-header exception.",
    roots: uiRuntimeRoots([".tsx"]),
    pattern:
      /(?:\bfont-heading\b[^"'\n]*\bfont-bold\b|\bfont-bold\b[^"'\n]*\bfont-heading\b)/g,
    allowlist: {
      "apps/web/app/(protected)/br/[branchId]/pos/_components/bill/bill-receipt-summary.tsx": 1,
    },
  },
  {
    id: "card-content-classname-baseline",
    description:
      "CardContent layout overrides are restricted to the shared link-card adapter.",
    roots: [{ dir: "apps/web/app", extensions: [".tsx"] }],
    pattern: /<CardContent\b[^\n]*\bclassName=/g,
    allowlist: {
      "apps/web/app/components/surface.tsx": 1,
    },
  },
  {
    id: "resting-shadow-baseline",
    description:
      "Raw elevation utilities are restricted to the two fixed/sticky chrome roles approved by the design-system elevation ladder.",
    roots: [{ dir: "apps/web/app", extensions: [".tsx"] }],
    pattern:
      /(?<!drop-)(?<!hover:)(?<!focus:)(?<!focus-visible:)(?<!active:)(?<!data-\[state=open\]:)\bshadow-(?:sm|md|lg|xl|2xl)\b/g,
    allowlist: {
      "apps/web/app/components/surface.tsx": 2,
      "apps/web/app/(protected)/br/[branchId]/pos/_components/pos-mobile-action-bar.tsx": 1,
    },
  },
  {
    id: "space-y-baseline",
    description:
      "Vertical rhythm debt is frozen per file; cleanup in one file must not let another file add space-y drift.",
    roots: [{ dir: "apps/web/app", extensions: [".tsx"] }],
    pattern:
      /\bspace-y-(?:px|0|0\.5|1|1\.5|2|2\.5|3|3\.5|4|5|6|7|8|9|10|11|12|14|16|20|24|\[[^\]]+\])\b/g,
    allowlist: {},
  },
  {
    id: "raw-padding-baseline",
    description:
      "Large local padding debt is zero; use the page, surface, empty-state, or input-group contract instead.",
    roots: [{ dir: "apps/web/app", extensions: [".tsx"] }],
    pattern:
      /className=\{?(?:cn\()?['"][^'"]*\b(?:p|px|py|pt|pb|pl|pr)-(?:5|6|7|8|9|10|11|12|14|16|20|24)\b/g,
    allowlist: {},
  },
  {
    id: "gap-atypical-baseline",
    description:
      "Gap values outside the documented app scale are frozen per file until they are normalized.",
    roots: [{ dir: "apps/web/app", extensions: [".tsx"] }],
    pattern: /\bgap-(?:0|0\.5|2\.5)\b/g,
    allowlist: {},
  },
  {
    id: "inline-chrome-baseline",
    description:
      "Hand-rolled card/inset chrome (rounded-md|lg + border on a raw element — including border-only, bg-*/N-tinted, and bg-muted|accent|secondary card-clones) is frozen per file; delegate to Card/AppSection/Item/NoteCallout/Alert instead of reimplementing surface chrome inline. Multiline-tolerant (className={cn( then whitespace/newline before the literal).",
    roots: [{ dir: "apps/web/app", extensions: [".tsx"] }],
    pattern:
      /className=\{?(?:cn\()?\s*['"](?=[^'"]*\brounded-(?:md|lg)\b)(?=[^'"]*\bborder\b)[^'"]*['"]/g,
    allowlist: {},
  },
  {
    id: "radius-tier-baseline",
    description:
      "Detectable-subset heuristic for wrong-tier radius (full tier-correctness is enforced by review + the design-system Radius table): rounded-full on an icon-box (size-8|10|12|14|16) should be rounded-md, and rounded-lg on a small inset (size-8|10|12) should be rounded-md. Frozen per file.",
    roots: [{ dir: "apps/web/app", extensions: [".tsx"] }],
    pattern:
      /className=\{?(?:cn\()?['"](?:(?=[^'"]*\brounded-full\b)(?=[^'"]*\bsize-(?:8|10|12|14|16)\b)|(?=[^'"]*\brounded-lg\b)(?=[^'"]*\bsize-(?:8|10|12)\b))[^'"]*['"]/g,
    allowlist: {},
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
      /\bshadow-\[[^\]]+\]|\bboxShadow\s*:|\bbox-shadow\s*:|--shadow-[\w-]+/g,
    allowlist: {},
  },
  {
    id: "tint-opacity",
    description:
      "Status-token tints use the locked opacity scale only: fill /10, fill-strong /15, hairline-border /20 (and muted /30 or /50). Every other step (/5,/8,/12,/25,/35,/45,/55,/60,/90,/95,…) is frozen per file and burns down; solid status backgrounds use the bare token, not /95 (design-system.md § Token Contract → Tint Opacity Scale).",
    roots: [
      { dir: "apps/web/app", extensions: [".ts", ".tsx"] },
      { dir: "apps/web/lib/branch-operator", extensions: [".ts", ".tsx"] },
      { dir: "apps/web/lib/staff-runtime", extensions: [".ts", ".tsx"] },
      { dir: "packages/ui/src/components", extensions: [".tsx"] },
    ],
    pattern:
      /\b(?:bg|border|ring|text|fill|stroke)-(?:warning|success|destructive|info|primary|accent|secondary)\/(?!(?:10|15|20)\b)\d+\b|\b(?:bg|border|ring|text|fill|stroke)-muted\/(?!(?:30|50)\b)\d+\b/g,
    allowlist: {},
  },
  {
    id: "uppercase-label-scale",
    description:
      "Uppercase eyebrow / panel / field / section labels are one locked role (text-xs, dense KDS text-2xs) — never text-sm/text-base. A className mixing uppercase with text-sm or text-base is label-role drift, frozen per file and burning down (design-system.md § Rhythm B).",
    roots: [{ dir: "apps/web/app", extensions: [".tsx"] }],
    pattern:
      /className=\{?(?:cn\()?['"](?=[^'"]*\buppercase\b)(?=[^'"]*\b(?:text-sm|text-base)\b)[^'"]*['"]/g,
    allowlist: {},
  },
  {
    id: "status-chip-wrapper-baseline",
    description:
      "Page-local status chip wrappers and badge-variant maps are frozen; route business states through StatusBadge/getStatusBadgeMeta instead of adding another *StatusBadge or *_BADGE_VARIANT map.",
    roots: [{ dir: "apps/web/app", extensions: [".ts", ".tsx"] }],
    pattern:
      /\b(?:function|const)\s+[A-Z]\w*StatusBadge\b|\bconst\s+[A-Z0-9_]*BADGE_VARIANT[A-Z0-9_]*\s*=\s*[{[]/g,
    allowlist: {},
  },
  {
    id: "hand-rolled-page-heading-baseline",
    description:
      "Hand-rolled font-heading <h1> page titles are frozen; app page H1 must route through AppPageHeader unless the surface is an approved standalone/operator exception.",
    roots: [{ dir: "apps/web/app", extensions: [".tsx"] }],
    pattern:
      /<h1\b[^>]*className=["'][^"']*\bfont-heading\b(?=[^"']*\b(?:text-lg|text-xl|text-2xl|text-3xl|sm:text-2xl|sm:text-3xl)\b)[^"']*["']/g,
    allowlist: {
      "apps/web/app/(protected)/br/[branchId]/(operator)/stock/catalog/catalog-back-header.tsx": 1,
      "apps/web/app/q/[token]/self-order-client.tsx": 1,
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

const frozenPrimitiveImportChecks = frozenPrimitiveImportBaselines.map(
  (check) => ({
    ...check,
    roots: [{ dir: "apps/web/app", extensions: [".ts", ".tsx"] }],
    pattern: new RegExp(
      String.raw`from\s+["']@comtammatu/ui/components/${check.component}["']`,
      "g",
    ),
  }),
);

function runLegacyDebtBudgetSelfTest() {
  const selfTestId = "legacy-debt-budget-self-test";
  const totalFailure = totalBudgetFailure(
    { id: selfTestId, maxCount: 1 },
    new Map([["sample.tsx", 2]]),
  );
  if (!totalFailure) throw new Error("total budget self-test did not fail");

  const perFileFailures = perFileBudgetFailures(
    { id: selfTestId, allowlist: { "sample.tsx": 1 } },
    new Map([["sample.tsx", 2]]),
  );
  if (perFileFailures.length !== 1) {
    throw new Error("per-file budget self-test did not fail");
  }

  const primitiveCheck = frozenPrimitiveImportChecks[0];
  if (
    !primitiveCheck ||
    countMatches(
      'import { Card } from "@comtammatu/ui/components/card";',
      primitiveCheck.pattern,
    ) !== 1
  ) {
    throw new Error("primitive import budget self-test did not match");
  }

  const rawHoverShadowCheck = countBudgets.find(
    (check) => check.id === "raw-hover-shadow",
  );
  if (
    !rawHoverShadowCheck ||
    countMatches(
      'className="hover:shadow-inner hover:shadow-[0_2px_8px_rgb(0_0_0/0.2)]"',
      rawHoverShadowCheck.pattern,
    ) !== 2 ||
    countMatches(
      'className="hover:shadow-effect-card-hover"',
      rawHoverShadowCheck.pattern,
    ) !== 0
  ) {
    throw new Error("raw hover shadow self-test did not enforce named effects");
  }

  const headingWeightCheck = perFileCountBudgets.find(
    (check) => check.id === "heading-weight-lock",
  );
  if (
    !headingWeightCheck ||
    countMatches(
      'className="font-heading text-xl font-bold"',
      headingWeightCheck.pattern,
    ) !== 1 ||
    countMatches(
      'className="font-bold text-xl font-heading"',
      headingWeightCheck.pattern,
    ) !== 1 ||
    countMatches(
      'className="font-heading text-xl font-semibold"',
      headingWeightCheck.pattern,
    ) !== 0
  ) {
    throw new Error("heading weight self-test did not enforce the lock");
  }

  if (
    countRawInputFixedHeightTags(
      '<Input type="text" className="w-full h-10" />',
    ) !== 1 ||
    countRawInputFixedHeightTags('<Input type="text" />') !== 0 ||
    countRawInputFixedHeightTags('<Input type="file" />') !== 0 ||
    countRawInputFixedHeightTags(
      '<InputGroup className="h-10"><InputGroupInput /></InputGroup>',
    ) !== 0
  ) {
    throw new Error("raw input fixed-height self-test did not enforce scope");
  }

  const legacyCssVariableCheck = checks.find(
    (check) => check.id === "legacy-css-variable-name",
  );
  const inputLegacySizeCheck = checks.find(
    (check) => check.id === "input-legacy-size-prop",
  );
  const retiredUtilityCheck = checks.find(
    (check) => check.id === "retired-utility-reference",
  );
  if (
    !legacyCssVariableCheck ||
    countMatches("--surface-legacy: red;", legacyCssVariableCheck.pattern) !==
      1 ||
    countMatches("--compatibility-mode: 1;", legacyCssVariableCheck.pattern) !==
      0 ||
    countMatches(
      "color: var(--surface-legacy);",
      legacyCssVariableCheck.pattern,
    ) !== 0 ||
    !inputLegacySizeCheck ||
    countMatches('<Input size="field" />', inputLegacySizeCheck.pattern) !==
      1 ||
    countMatches(
      '<FormattedNumberInput size="field" />',
      inputLegacySizeCheck.pattern,
    ) !== 1 ||
    countMatches(
      '<Input controlSize="field" />',
      inputLegacySizeCheck.pattern,
    ) !== 0 ||
    !retiredUtilityCheck ||
    countMatches(
      'className="bg-glass-nav scrollbar-thin active-touch-press"',
      retiredUtilityCheck.pattern,
    ) !== 3 ||
    countMatches(
      'className="bg-glass-overlay touch-target"',
      retiredUtilityCheck.pattern,
    ) !== 0
  ) {
    throw new Error(
      "legacy Input and CSS variable self-test did not enforce scope",
    );
  }

  if (
    !isHistoricalSqlSnapshot(
      path.join(
        REPO_ROOT,
        "supabase/migration-archive/20260101000000_history.sql",
      ),
    ) ||
    !isHistoricalSqlSnapshot(
      path.join(REPO_ROOT, "supabase/migrations/20260101000000_baseline.sql"),
    ) ||
    isHistoricalSqlSnapshot(
      path.join(REPO_ROOT, "supabase/migrations/20260101000001_forward.sql"),
    )
  ) {
    throw new Error(
      "historical SQL snapshot filter self-test did not enforce scope",
    );
  }
}

if (process.argv.includes("--self-test")) {
  runLegacyDebtBudgetSelfTest();
  console.log("UI legacy debt budget self-test: pass.");
  process.exit(0);
}

const executedLegacyDebtGuardIds = new Set();

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
  executedLegacyDebtGuardIds.add(check.id);
  const failure = totalBudgetFailure(check, collectPatternCounts(check));
  if (failure) failures.push(failure);
}

for (const check of [
  ...checks,
  ...perFileCountBudgets,
  ...frozenPrimitiveImportChecks,
]) {
  executedLegacyDebtGuardIds.add(check.id);
  if (typeof check.custom === "function") {
    check.custom();
    continue;
  }

  failures.push(...perFileBudgetFailures(check, collectPatternCounts(check)));
}

const missingLegacyDebtExecutions = UI_CONTRACT_LINT_ONLY_GROUPS[
  "legacy-debt-ratchet"
].guardIds.filter((guardId) => !executedLegacyDebtGuardIds.has(guardId));
if (missingLegacyDebtExecutions.length > 0) {
  throw new Error(
    `UI legacy debt guards are registered but not executed: ${missingLegacyDebtExecutions.join(", ")}`,
  );
}

// route-manifest (Stage 0, design-system.md § C/D / D019): every protected page
// resolves to exactly one MODULE_ACL family, and every family-root has a
// landing page. Keeps the route tree inside the declared taxonomy so a new
// route cannot escape the family/nav contract. ACL paths are read live from
// the SSoT so the gate never drifts from the access map.
const MODULE_ACL_SOURCE = "packages/shared/src/auth/module-acl.ts";
// ACL entries for other app hosts (e.g. `app: "workspace"`) own no web
// routes; the web route-manifest must ignore them so a separate hostname
// cannot collide with web family paths.
function parseWebAclPaths(source) {
  const block = source.match(
    /export const MODULE_ACL: Record<ModuleKey, ModuleAcl> = \{([\s\S]*?)\n\};/,
  );
  if (!block) {
    throw new Error("module-acl.ts: could not find MODULE_ACL");
  }
  const body = block[1];
  const paths = [];
  const entryRegex = /(\w+):\s*\{/g;
  let match;
  while ((match = entryRegex.exec(body)) !== null) {
    const start = match.index + match[0].length;
    let depth = 1;
    let i = start;
    while (depth > 0 && i < body.length) {
      if (body[i] === "{") depth++;
      else if (body[i] === "}") depth--;
      i++;
    }
    const entryBody = body.slice(start, i - 1);
    if (/app:\s*"workspace"/.test(entryBody)) continue;
    const pathMatch = entryBody.match(/path:\s*"([^"]+)"/);
    if (pathMatch) paths.push(pathMatch[1]);
  }
  return paths;
}
const ACL_PATHS = parseWebAclPaths(
  fs.readFileSync(path.join(REPO_ROOT, MODULE_ACL_SOURCE), "utf8"),
);

// Canonical route selectors may resolve to no family when they only redirect.
const ROUTE_MANIFEST_SELECTOR_ROUTES = new Set();
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

const protectedPages = [...walkFiles("apps/web/app/(protected)", [".tsx"])]
  .map(toPosix)
  .filter((file) => file.endsWith("/page.tsx"));
const routeManifestPages = protectedPages;
const landingRouteSet = new Set(routeManifestPages.map(routePathFromPageFile));

for (const file of protectedPages) {
  const route = routePathFromPageFile(file);
  if (!resolveFamilyPath(route) && !ROUTE_MANIFEST_SELECTOR_ROUTES.has(route)) {
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
  "LANDING",
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

const VALID_PAGE_DISPOSITIONS = new Set(["keep", "tune", "rebuild"]);
const VALID_PAGE_DISPOSITION_EVIDENCE = new Set([
  "source-baseline",
  "implemented-static",
  "browser-runtime",
  "authenticated-runtime",
]);

for (const file of allPageFiles) {
  const disposition = PAGE_DISPOSITIONS[file];
  if (!disposition) {
    failures.push(
      `page-disposition: ${file} has no keep/tune/rebuild entry in PAGE_DISPOSITIONS. Record the current evidence gate before changing the route.`,
    );
    continue;
  }
  if (!VALID_PAGE_DISPOSITIONS.has(disposition.status)) {
    failures.push(
      `page-disposition: ${file} declares unknown status "${disposition.status}".`,
    );
  }
  if (!VALID_PAGE_DISPOSITION_EVIDENCE.has(disposition.evidence)) {
    failures.push(
      `page-disposition: ${file} declares unknown evidence "${disposition.evidence}".`,
    );
  }
  if (typeof disposition.final !== "boolean") {
    failures.push(
      `page-disposition: ${file} must declare a boolean final gate.`,
    );
  }
  const protectedPage = file.includes("/(protected)/");
  const hasFinalRuntimeEvidence = protectedPage
    ? disposition.evidence === "authenticated-runtime"
    : disposition.evidence === "browser-runtime" ||
      disposition.evidence === "authenticated-runtime";
  if (disposition.final && !hasFinalRuntimeEvidence) {
    failures.push(
      `page-disposition: ${file} cannot be final without ${protectedPage ? "authenticated-runtime" : "browser-runtime"} evidence.`,
    );
  }
}

for (const file of Object.keys(PAGE_DISPOSITIONS)) {
  if (!allPageFiles.includes(file)) {
    failures.push(
      `page-disposition: PAGE_DISPOSITIONS has a dead entry for ${file}.`,
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

// list-width-tier (page-archetypes.md § 3 LIST / § 4): the LIST recipe pins the
// single dense-data width tier `xwide` (design-system.md § Rhythm Contract). A
// LIST-declared page whose page shell renders on a narrower tier is drift, so
// this reads the width prop off the page's own AppPage/InventoryPageContent
// shell and fails anything but `xwide`. Scoped to the inventory LIST pages the
// owner pinned (2026-07-04): the co-located client owns an `AppPage width` prop
// this gate can read statically. The three inventory approval/assignment queue
// pages are § 4 Named Exceptions (card/ItemGroup, no DataTable, no LIST width
// tier) and are excluded. Widening this set to a page whose shell is an
// InventoryPageContent (width union is "wide" | "narrow") needs that adapter to
// gain the `xwide` tier first.
const LIST_WIDTH_TIER_QUEUE_EXCEPTIONS = new Set([
  "apps/web/app/(protected)/inventory/waste/approvals/page.tsx",
]);
const ADMIN_LIST_WIDTH_TIER_FAMILIES = [
  "apps/web/app/(protected)/finance/",
  "apps/web/app/(protected)/hr/",
];
const LIST_WIDTH_TIER_PINNED_PAGES = [
  ...Object.entries(PAGE_ARCHETYPES)
    .filter(
      ([file, archetype]) =>
        archetype === "LIST" &&
        ADMIN_LIST_WIDTH_TIER_FAMILIES.some((family) =>
          file.startsWith(family),
        ),
    )
    .map(([file]) => file),
  "apps/web/app/(protected)/inventory/grn/page.tsx",
  "apps/web/app/(protected)/inventory/ingredients/page.tsx",
  "apps/web/app/(protected)/inventory/menu-recipes/page.tsx",
  "apps/web/app/(protected)/inventory/stocktake/page.tsx",
  "apps/web/app/(protected)/inventory/transfers/page.tsx",
];

// Read the width tier declared on the non-embedded page shell for a LIST page.
// The shell (AppPage / InventoryPageContent) lives in a client co-located in the
// page's own directory; the `embedded` return path is a bare <div>, so any shell
// opening tag in that directory is the Owner surface LIST shell. Returns the set
// of tiers seen ("(default)" for a shell with no explicit width prop) so the
// gate can flag any tier that is not exactly `xwide`.
function readListShellWidthTiers(pageFile) {
  const dir = path.dirname(path.join(REPO_ROOT, pageFile));
  const tiers = new Set();
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".tsx")) continue;
    const content = fs.readFileSync(path.join(dir, entry.name), "utf8");
    for (const shell of ["AppPage", "InventoryPageContent"]) {
      for (const tag of extractJsxOpeningTags(content, shell)) {
        const match = /\bwidth=["']([a-z]+)["']/.exec(tag);
        tiers.add(match ? match[1] : "(default)");
      }
    }
  }
  return tiers;
}

for (const file of LIST_WIDTH_TIER_PINNED_PAGES) {
  if (PAGE_ARCHETYPES[file] !== "LIST") {
    failures.push(
      `list-width-tier: LIST_WIDTH_TIER_PINNED_PAGES has a stale entry for ${file}, which is no longer LIST. Remove it or re-pin its width (page-archetypes.md § 3 LIST).`,
    );
    continue;
  }
  if (LIST_WIDTH_TIER_QUEUE_EXCEPTIONS.has(file)) continue;
  const tiers = readListShellWidthTiers(file);
  if (tiers.size === 0) {
    failures.push(
      `list-width-tier: ${file} has no AppPage/InventoryPageContent shell in its directory to read a width tier from. The LIST recipe pins width="xwide" (page-archetypes.md § 3 LIST).`,
    );
    continue;
  }
  const offTier = [...tiers].filter((tier) => tier !== "xwide");
  if (offTier.length > 0) {
    failures.push(
      `list-width-tier: ${file} declares LIST width tier(s) ${offTier
        .map((tier) => `"${tier}"`)
        .join(
          ", ",
        )}, but the LIST recipe pins width="xwide" (page-archetypes.md § 3 LIST / design-system.md § Rhythm Contract).`,
    );
  }
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
