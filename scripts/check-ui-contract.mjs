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
  UI_CONTRACT_BASELINE_POLICIES,
  buildUiContractBaselineReporting,
  buildUiContractGuardReporting,
} from "./ui-contract-guard-reporting.mjs";
import {
  UI_RUNTIME_SOURCE_ROOTS,
  uiRuntimeRoots,
} from "./ui-contract-scope.mjs";

const REPO_ROOT = process.cwd();
const SELF_PATH = fileURLToPath(import.meta.url);
const WRITE_MODE = process.argv.includes("--write");
const BASELINE_REPORT_MODE = process.argv.includes("--report-baselines=json");

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

function extractObjectPropertyBody(body, name) {
  const anchor = body.indexOf(`${name}: {`);
  if (anchor === -1) return null;
  const start = body.indexOf("{", anchor);
  if (start === -1) return null;

  let depth = 0;
  for (let index = start; index < body.length; index += 1) {
    const char = body.charAt(index);
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return body.slice(start + 1, index);
    }
  }

  return null;
}

function extractStringNumberObjectEntries(body) {
  const entries = new Map();
  if (!body) return entries;
  for (const match of body.matchAll(/"([^"]+)":\s*(\d+)/g)) {
    const key = match[1];
    const value = Number(match[2]);
    if (key) entries.set(key, value);
  }
  return entries;
}

function hasUiContractGuard(contractSource, guardId) {
  return (
    contractSource.includes(`id: "${guardId}"`) ||
    contractSource.includes(`${guardId}:`)
  );
}

function extractGuardAllowlist(contractSource, guardId) {
  for (const varName of [
    "checks",
    "perFileCountBudgets",
    "frozenPrimitiveImportBaselines",
    "formatterGuardBaselines",
  ]) {
    const span = locateGateValueSpan(
      contractSource,
      varName,
      guardId,
      "allowlist",
    );
    if (!span) continue;
    return extractStringNumberObjectEntries(
      contractSource.slice(span.valueStart, span.valueEnd),
    );
  }
  return null;
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
    "blocking-baseline",
    "blocking-mixed",
    "blocking-exception",
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
    const exceptionAllowlistGuard = extractStringProperty(
      entryBody,
      "exceptionAllowlistGuard",
    );
    const exceptionAllowlistGroup = extractStringProperty(
      entryBody,
      "exceptionAllowlistGroup",
    );
    const exceptionAllowlistBody = extractObjectPropertyBody(
      entryBody,
      "exceptionAllowlist",
    );
    if (!status) {
      errors.push(`${signal} is missing a status`);
      continue;
    }
    if (!allowedStatuses.has(status)) {
      errors.push(`${signal} has unknown status "${status}"`);
    }
    if (
      (status === "advisory" || status === "blocking-exception") &&
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
    if (status === "blocking-exception") {
      if (exceptionAllowlistGuard && exceptionAllowlistGroup) {
        errors.push(
          `${signal} cannot declare both exceptionAllowlistGuard and exceptionAllowlistGroup`,
        );
      } else if (
        exceptionAllowlistGuard &&
        !guardIds.includes(exceptionAllowlistGuard)
      ) {
        errors.push(
          `${signal} exceptionAllowlistGuard is not listed in guardIds`,
        );
      } else if (
        exceptionAllowlistGroup &&
        exceptionAllowlistGroup !== guardGroup
      ) {
        errors.push(`${signal} exceptionAllowlistGroup must match guardGroup`);
      } else if (!exceptionAllowlistGuard && !exceptionAllowlistGroup) {
        errors.push(
          `${signal} is blocking-exception without an exception allowlist owner`,
        );
      }

      if (!exceptionAllowlistBody) {
        errors.push(
          `${signal} is blocking-exception without exceptionAllowlist`,
        );
      } else if (exceptionAllowlistGuard || exceptionAllowlistGroup) {
        const auditAllowlist = extractStringNumberObjectEntries(
          exceptionAllowlistBody,
        );
        const guardAllowlist = new Map();
        const ownerGuardIds = exceptionAllowlistGroup
          ? guardIds
          : [exceptionAllowlistGuard];
        for (const ownerGuardId of ownerGuardIds) {
          const ownerAllowlist = extractGuardAllowlist(
            contractSource,
            ownerGuardId,
          );
          if (!ownerAllowlist) {
            errors.push(
              `${signal} exception owner "${ownerGuardId}" has no guard allowlist`,
            );
            continue;
          }
          for (const [file, count] of ownerAllowlist) {
            guardAllowlist.set(file, (guardAllowlist.get(file) ?? 0) + count);
          }
        }
        const diffs = formatMapDiff(guardAllowlist, auditAllowlist);
        if (diffs.length > 0) {
          errors.push(
            `${signal} exceptionAllowlist does not match its guard allowance: ${diffs.join("; ")}`,
          );
        }
      }
    } else if (
      exceptionAllowlistGuard ||
      exceptionAllowlistGroup ||
      exceptionAllowlistBody
    ) {
      errors.push(
        `${signal} has exception metadata without blocking-exception status`,
      );
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

function resolveRelativeTsxImport(fromFile, specifier) {
  if (!specifier.startsWith(".")) return null;
  const importerDir = path.dirname(path.join(REPO_ROOT, fromFile));
  const absolute = path.resolve(importerDir, specifier);
  const candidates = [`${absolute}.tsx`, path.join(absolute, "index.tsx")];
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}

function pageOrDirectClientUsesDocumentFormFrame(file) {
  const absoluteFile = path.join(REPO_ROOT, file);
  const content = fs.readFileSync(absoluteFile, "utf8");
  if (content.includes("DocumentFormFrame")) return true;

  const importPattern = /from\s+["'](\.{1,2}\/[^"']+)["']/g;
  for (const match of content.matchAll(importPattern)) {
    const imported = resolveRelativeTsxImport(file, match[1]);
    if (!imported) continue;
    if (fs.readFileSync(imported, "utf8").includes("DocumentFormFrame")) {
      return true;
    }
  }

  return false;
}

function branchPageOrDirectClientUsesOperatorWorkflowFrame(file) {
  if (!file.includes("/br/") || !file.includes("/(operator)/")) return false;

  const absoluteFile = path.join(REPO_ROOT, file);
  const pageContent = fs.readFileSync(absoluteFile, "utf8");
  if (!pageContent.includes("BranchOperatorPage")) return false;

  const sources = [pageContent];
  const importPattern = /from\s+["'](\.{1,2}\/[^"']+)["']/g;
  for (const match of pageContent.matchAll(importPattern)) {
    const imported = resolveRelativeTsxImport(file, match[1]);
    if (!imported) continue;
    sources.push(fs.readFileSync(imported, "utf8"));
  }

  const combined = sources.join("\n");
  return (
    combined.includes("BranchOperatorPanel") &&
    combined.includes("AppDetailFooter") &&
    !combined.includes("DocumentFormFrame")
  );
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

const SURFACE_CLONE_ADAPTER_IMPLEMENTATIONS = new Set([
  ...Object.values(APP_ADAPTER_REGISTRY).map((entry) => entry.source),
  ...Object.values(DOMAIN_ADAPTER_FAMILIES).map((entry) => entry.source),
]);

const SURFACE_CLONE_EXCEPTIONS = new Set([
  "apps/web/app/(protected)/br/[branchId]/pos/pos-page-skeleton.tsx",
]);

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

function countLocalDefinition(content, pattern, { skipDynamic = false } = {}) {
  let count = 0;
  for (const match of content.matchAll(pattern)) {
    if (skipDynamic) {
      const tail = content.slice(
        match.index + match[0].length,
        match.index + match[0].length + 40,
      );
      if (/^\s*=\s*dynamic\b/.test(tail)) continue;
    }
    count += 1;
  }
  return count;
}

function countLocalSurfaceClone(content, file) {
  if (SURFACE_CLONE_ADAPTER_IMPLEMENTATIONS.has(file)) return 0;
  if (SURFACE_CLONE_EXCEPTIONS.has(file)) return 0;

  let count = countLocalDefinition(content, LOCAL_SURFACE_CLONE_RE);
  if (
    !/\b(?:AppSection|BranchOperatorPanel|SettingsFormSection)\b/.test(content)
  ) {
    count += countLocalDefinition(content, LOCAL_SECTION_CLONE_RE);
  }
  if (!/\b(?:AppToolbar|PwaToolbar)\b/.test(content)) {
    count += countLocalDefinition(content, LOCAL_TOOLBAR_CLONE_RE);
  }
  if (!/\bDataTable\b/.test(content)) {
    count += countLocalDefinition(content, LOCAL_TABLE_CLONE_RE);
  }
  if (
    !/\b(?:AppDialog|FormDialog|FileImportDialog|ReasonConfirmDialog)\b/.test(
      content,
    )
  ) {
    count += countLocalDefinition(content, LOCAL_DIALOG_CLONE_RE, {
      skipDynamic: true,
    });
  }
  return count;
}

function extractConstExpressions(content, name) {
  const expressions = [];
  let searchFrom = 0;
  const needle = `const ${name} =`;
  while (searchFrom < content.length) {
    const anchor = content.indexOf(needle, searchFrom);
    if (anchor === -1) break;

    let i = anchor + needle.length;
    while (i < content.length && /\s/.test(content[i])) i += 1;

    const start = i;
    let depth = 0;
    let inString = null;
    while (i < content.length) {
      const ch = content[i];
      if (inString) {
        if (ch === inString && content[i - 1] !== "\\") inString = null;
      } else if (ch === '"' || ch === "'" || ch === "`") {
        inString = ch;
      } else if (ch === "{" || ch === "(" || ch === "[") {
        depth += 1;
      } else if (ch === "}" || ch === ")" || ch === "]") {
        depth -= 1;
      } else if (ch === ";" && depth === 0) {
        break;
      }
      i += 1;
    }

    expressions.push(content.slice(start, i));
    searchFrom = i + 1;
  }
  return expressions;
}

const formatterGuardBaselines = [
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
    id: "heading-scale",
    description:
      "Locked heading scale forbids app-surface text-4xl/text-5xl/font-black drift.",
    roots: [
      { dir: "apps/web/app", extensions: [".tsx"] },
      { dir: "apps/web/lib", extensions: [".tsx"] },
    ],
    pattern:
      /className=\{?(?:cn\()?['"][^'"]*\b(text-4xl|text-5xl|font-black)\b/g,
    allowlist: {},
  },
  {
    id: "icon-size",
    description:
      "Banned icon-size classes size-7/9/11 must not spread; size-14/16 stay limited to media thumbnails.",
    roots: [
      { dir: "apps/web/app", extensions: [".tsx"] },
      { dir: "apps/web/lib", extensions: [".tsx"] },
    ],
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
    roots: [
      { dir: "apps/web/app", extensions: [".tsx"] },
      { dir: "apps/web/lib", extensions: [".tsx"] },
    ],
    pattern:
      /className=\{?(?:cn\()?['"][^'"]*(\brounded\b(?!-(?:md|lg|full|none|t|b|l|r))|\brounded-(sm|xl|2xl|3xl|4xl)\b)/g,
    allowlist: {},
  },
  {
    id: "gap-scale",
    description:
      "App surfaces use the documented gap scale only: gap-1/1.5/2/3/4/6. gap-5/7/8+ is blocked at zero.",
    roots: [
      { dir: "apps/web/app", extensions: [".tsx"] },
      { dir: "apps/web/lib", extensions: [".tsx"] },
    ],
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
    id: "surface-clone-ssot",
    description:
      "Route-local components named like DS surfaces must route through existing adapters or use workflow-specific names.",
    custom: () => {
      for (const filePath of walkUiRuntimeFiles([".tsx"])) {
        const normalized = toPosix(filePath);
        const content = fs.readFileSync(filePath, "utf8");
        const count = countLocalSurfaceClone(content, normalized);
        if (count > 0) {
          failures.push(
            `surface-clone-ssot: ${normalized} has ${count} route-local surface clone definition(s). Use an existing adapter or a workflow-specific name; expanding this baseline needs a design-system contract reason.`,
          );
        }
      }
    },
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
  ...formatterGuardBaselines,
  {
    id: "browser-chrome-theme-color-source",
    description:
      "Browser/PWA chrome theme colors are single-sourced in apps/web/app/_lib/theme-tokens.ts.",
    roots: [{ dir: "apps/web/app", extensions: [".ts", ".tsx"] }],
    pattern: /#(?:fff6ee|1f1812)\b/gi,
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
    id: "primitive-runtime-arbitrary-px-rem-sizing",
    description:
      "Primitive and app-adapter sizing must use named Tailwind/theme tokens instead of raw px/rem arbitrary values.",
    roots: [
      { dir: "packages/ui/src/components", extensions: [".tsx"] },
      { dir: "apps/web/app/components", extensions: [".tsx"] },
      { dir: "apps/web/lib", extensions: [".ts", ".tsx"] },
    ],
    pattern: /\b(?:text|w|h|min-w|min-h|max-w|max-h)-\[[0-9.]+(?:px|rem)\]/g,
    allowlist: {
      "apps/web/app/components/surface.tsx": 1,
    },
  },
  {
    id: "primitive-arbitrary-shadow",
    description:
      "Primitive and app-adapter shadows must use named shadow/ring tokens instead of arbitrary box-shadow values.",
    roots: [
      { dir: "packages/ui/src/components", extensions: [".tsx"] },
      { dir: "apps/web/app/components", extensions: [".tsx"] },
      { dir: "apps/web/lib", extensions: [".ts", ".tsx"] },
    ],
    pattern: /\bshadow-\[[^\]]+\]/g,
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
    roots: [
      { dir: "apps/web/app", extensions: [".tsx"] },
      { dir: "apps/web/lib", extensions: [".tsx"] },
    ],
    pattern:
      /<CardContent\b[^>]*className=["'][^"']*\b(?:p-0|overflow-x-auto)\b/g,
    allowlist: {},
  },
  {
    id: "app-section-content-named-layout-props",
    description:
      "Use AppSection contentFlush/contentScroll instead of contentClassName p-0 or overflow-x-auto.",
    roots: [
      { dir: "apps/web/app", extensions: [".tsx"] },
      { dir: "apps/web/lib", extensions: [".tsx"] },
    ],
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
    allowlist: {},
  },
  {
    id: "app-arbitrary-sizing",
    description:
      "Arbitrary app sizing remains baseline debt and must not spread.",
    roots: [
      { dir: "apps/web/app", extensions: [".tsx"] },
      { dir: "apps/web/lib", extensions: [".tsx"] },
    ],
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
    roots: uiRuntimeRoots([".ts", ".tsx"]),
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
    id: "stat-card-ssot",
    description:
      "KPI/stat metric cards are single-sourced in apps/web/app/components/kpi/; page-local StatCard/StatTile/SummaryCard/SummaryMetric/MetricCard/MetricTile definitions must not spread.",
    roots: uiRuntimeRoots([".tsx"]),
    pattern:
      /\b(?:function|const)\s+\w*(?:StatCard|StatTile|SummaryCard|SummaryMetric|MetricCard|MetricTile|KpiCard)\b/g,
    allowlist: {
      "apps/web/app/components/kpi/kpi-card.tsx": 1,
    },
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
    id: "use-is-mobile-budget",
    description:
      "useIsMobile is for composition-level switches (page width, drawer vs sheet, wizard density) — list surfaces use the shared DataTable adapter. Budget only shrinks.",
    roots: uiRuntimeRoots([".tsx"]),
    pattern: /\buseIsMobile\b/g,
    allowlist: {
      "apps/web/app/(protected)/br/[branchId]/pos/_components/archived-orders-sheet.tsx": 2,
      "apps/web/app/(protected)/br/[branchId]/pos/pos-desktop-inner.tsx": 2,
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
    id: "operator-office-shell-boundary",
    description:
      "Branch runtime, Operations, and employee-lib surfaces must not import or render Management/Office chrome. Use the operator layout, AppHeader/AppBottomNav, EmployeePage, or embedded PageContent branches instead.",
    roots: [
      {
        dir: "apps/web/app/(protected)/br/[branchId]",
        extensions: [".ts", ".tsx"],
      },
      { dir: "apps/web/lib/staff-runtime", extensions: [".ts", ".tsx"] },
    ],
    pattern:
      /\b(?:OfficeModuleShell|ManagementShell|AppShell|FinanceShell|InventoryShell|resolveOffice(?:PrimaryTabs|DeepNav))\b|["'][^"']*(?:office-module-shell|management-chrome|app-shell|office-nav|finance-shell|inventory-shell)["']/g,
    allowlist: {},
  },
  {
    id: "operator-office-route-boundary",
    description:
      "Branch operator routes must not link or redirect into Office route roots; keep work inside /br/[branchId] or a shared non-office surface.",
    roots: [
      {
        dir: "apps/web/app/(protected)/br/[branchId]/(operator)",
        extensions: [".ts", ".tsx"],
      },
    ],
    pattern:
      /["'`]\/(?:admin|finance|inventory|menu|orders|branches|hr)(?:\/|["'`?#])/g,
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
      /(?<!drop-)(?<!hover:)(?<!focus:)(?<!focus-visible:)(?<!active:)(?<!data-\[state=open\]:)\bshadow-(?:sm|md|lg|xl|2xl)\b/g,
    allowlist: {
      "apps/web/app/(protected)/br/[branchId]/pos/_components/pos-mobile-action-bar.tsx": 1,
      "apps/web/app/components/surface.tsx": 1,
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
  {
    id: "pos-kds-touch-reveal-baseline",
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
]);

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
  ...guardReporting.errors.map((error) => `guard-reporting-closure: ${error}`),
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
    "components.json",
    "shadcn config is retired; use docs/spec/design-system.md and @comtammatu/ui primitives",
  ],
  [
    ".shadcn.json",
    "shadcn config is retired; use docs/spec/design-system.md and @comtammatu/ui primitives",
  ],
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
    if (webPackageJson[dependencyField]?.["radix-ui"]) {
      failures.push(
        `matu-ds-boundary: apps/web/package.json must not depend on radix-ui directly; route primitives through @comtammatu/ui`,
      );
    }
    if (webPackageJson[dependencyField]?.["class-variance-authority"]) {
      failures.push(
        `matu-ds-boundary: apps/web/package.json must not depend on class-variance-authority directly; keep variant helpers in @comtammatu/ui or plain app adapter maps`,
      );
    }
  }
}

for (const file of walkFiles("apps/web", [".ts", ".tsx"])) {
  const relativePath = toPosix(file);
  const content = fs.readFileSync(file, "utf8");
  if (/from\s+["'](?:radix-ui|@radix-ui\/[^"']+)["']/.test(content)) {
    failures.push(
      `matu-ds-boundary: ${relativePath} imports radix-ui directly; route primitives through @comtammatu/ui`,
    );
  }
  if (/from\s+["']class-variance-authority["']/.test(content)) {
    failures.push(
      `matu-ds-boundary: ${relativePath} imports class-variance-authority directly; keep variant helpers in @comtammatu/ui or plain app adapter maps`,
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
      "`docs/worklog/README.md`: policy only",
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
      /(?<!drop-)(?<!hover:)(?<!focus:)(?<!focus-visible:)(?<!active:)(?<!data-\[state=open\]:)\bshadow-(?:sm|md|lg|xl|2xl)\b/g,
    maxCount: 2,
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
    allowlist: {},
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
      "apps/web/app/(protected)/br/[branchId]/runner/page.tsx": 1,
      "apps/web/app/(protected)/branch-settings/_shared/kds/station-form-dialog.tsx": 1,
      "apps/web/app/(protected)/hr/attendance-table.tsx": 1,
      "apps/web/app/(protected)/inventory/_components/blind-counting-grid.tsx": 1,
      "apps/web/app/(protected)/inventory/_components/inventory-branch-filter.tsx": 1,
      "apps/web/app/(protected)/inventory/purchase-orders/[id]/po-detail-client.tsx": 2,
      "apps/web/app/(protected)/inventory/settings/thresholds/page.tsx": 1,
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
    allowlist: {},
  },
  {
    id: "inline-chrome-baseline",
    description:
      "Hand-rolled card/inset chrome (rounded-md|lg + border on a raw element — including border-only, bg-*/N-tinted, and bg-muted|accent|secondary card-clones) is frozen per file; delegate to Card/AppSection/Item/NoteCallout/Alert instead of reimplementing surface chrome inline. Multiline-tolerant (className={cn( then whitespace/newline before the literal).",
    roots: [{ dir: "apps/web/app", extensions: [".tsx"] }],
    pattern:
      /className=\{?(?:cn\()?\s*['"](?=[^'"]*\brounded-(?:md|lg)\b)(?=[^'"]*\bborder\b)[^'"]*['"]/g,
    allowlist: {
      "apps/web/app/_components/notification-list.tsx": 1,
      "apps/web/app/(protected)/admin/settings/(tenant)/payments/payments-form.tsx": 2,
      "apps/web/app/(protected)/admin/settings/printers/templates/templates-client.tsx": 1,
      "apps/web/app/(protected)/br/[branchId]/pos/_components/bill/bill-receipt-sheet.tsx": 1,
      "apps/web/app/(protected)/br/[branchId]/pos/_components/order-detail/discount-sheet.tsx": 1,
      "apps/web/app/(protected)/br/[branchId]/pos/_components/order-detail/service-charge-sheet.tsx": 1,
      "apps/web/app/(protected)/br/[branchId]/pos/pos-desktop-inner.tsx": 2,
      "apps/web/app/(protected)/br/[branchId]/pos/pos-page-skeleton.tsx": 1,
      "apps/web/app/(protected)/finance/components/chart-card.tsx": 1,
      "apps/web/app/(protected)/finance/components/filter-bar.tsx": 1,
      "apps/web/app/(protected)/finance/components/mv-staleness-banner.tsx": 1,
      "apps/web/app/(protected)/finance/components/work-queue-strip.tsx": 1,
      "apps/web/app/(protected)/finance/revenue/[date]/revenue-drill-tabs.tsx": 1,
      "apps/web/app/(protected)/finance/revenue/revenue-client.tsx": 1,
      "apps/web/app/(protected)/hr/attendance-table.tsx": 1,
      "apps/web/app/(protected)/hr/position-tasks-client.tsx": 2,
      "apps/web/app/(protected)/inventory/_components/anti-split-rolling-meter.tsx": 1,
      "apps/web/app/(protected)/inventory/_components/inventory-branch-filter.tsx": 1,
      "apps/web/app/(protected)/inventory/_components/photo-upload-input.tsx": 1,
      "apps/web/app/(protected)/inventory/_components/recipe-lines-editor.tsx": 1,
      "apps/web/app/(protected)/inventory/_components/shift-cap-meter.tsx": 1,
      "apps/web/app/(protected)/inventory/_components/stocktake-draft-saver.tsx": 1,
      "apps/web/app/(protected)/inventory/_components/stocktake-mode-selector.tsx": 1,
      "apps/web/app/(protected)/inventory/_components/zone-lock-indicator.tsx": 1,
      "apps/web/app/(protected)/inventory/count-assignments/count-assignments-client.tsx": 3,
      "apps/web/app/(protected)/inventory/count-slips/count-slips-client.tsx": 2,
      "apps/web/app/(protected)/inventory/grn/new/[supplierId]/grn-create-client.tsx": 2,
      "apps/web/app/(protected)/inventory/ingredients/ingredient-dialog.tsx": 1,
      "apps/web/app/(protected)/inventory/inventory-value-panel.tsx": 1,
      "apps/web/app/(protected)/inventory/issues/[id]/issue-detail-client.tsx": 2,
      "apps/web/app/(protected)/inventory/reports/reports-client.tsx": 1,
      "apps/web/app/(protected)/inventory/supplier-invoices/supplier-invoices-client.tsx": 9,
      "apps/web/app/(protected)/inventory/waste/approvals/waste-approvals-client.tsx": 1,
      "apps/web/app/(protected)/inventory/waste/new/waste-create-client.tsx": 1,
      "apps/web/app/(protected)/menu/menu-image-input.tsx": 1,
      "apps/web/app/(protected)/orders/order-detail-sheet.tsx": 7,
      "apps/web/app/(public)/(auth)/login/page.tsx": 1,
      "apps/web/app/(public)/access-denied/page.tsx": 1,
    },
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
    allowlist: {
      "apps/web/app/_components/notification-item.tsx": 2,
      "apps/web/app/(protected)/br/[branchId]/kds/_components/age-badge.tsx": 3,
      "apps/web/app/(protected)/br/[branchId]/kds/_components/order-grid.tsx": 1,
      "apps/web/app/(protected)/br/[branchId]/kds/_components/unassigned-banner.tsx": 1,
      "apps/web/app/(protected)/br/[branchId]/kds/_hooks/use-kds-row-effects.tsx": 5,
      "apps/web/app/(protected)/br/[branchId]/kds/_lib/item-status-style.ts": 3,
      "apps/web/app/(protected)/br/[branchId]/pos/_components/bill/bill-receipt-sheet.tsx": 1,
      "apps/web/app/(protected)/br/[branchId]/pos/_components/order-detail/discount-sheet.tsx": 1,
      "apps/web/app/(protected)/br/[branchId]/pos/_components/order-detail/order-item-actions-sheet.tsx": 1,
      "apps/web/app/(protected)/br/[branchId]/pos/_components/order-detail/order-item-row.tsx": 7,
      "apps/web/app/(protected)/br/[branchId]/pos/_components/order-detail/service-charge-sheet.tsx": 1,
      "apps/web/app/(protected)/br/[branchId]/pos/_components/pos-line-item-compact.tsx": 2,
      "apps/web/app/(protected)/br/[branchId]/pos/pos-desktop-inner.tsx": 1,
      "apps/web/app/(protected)/br/[branchId]/pos/pos-menu-grid.tsx": 1,
      "apps/web/app/(protected)/br/[branchId]/pos/printer-status-badge.tsx": 3,
      "apps/web/app/(protected)/br/[branchId]/runner/page.tsx": 1,
      "apps/web/app/(protected)/br/[branchId]/runner/runner-order-board-client.tsx": 5,
      "apps/web/app/(protected)/branch-settings/_shared/printers/printers-client.tsx": 2,
      "apps/web/app/(protected)/branches/network-config-dialog.tsx": 4,
      "apps/web/app/(protected)/finance/components/mv-staleness-banner.tsx": 3,
      "apps/web/app/(protected)/finance/components/work-queue-strip.tsx": 4,
      "apps/web/app/(protected)/hr/position-tasks-client.tsx": 1,
      "apps/web/app/(protected)/hr/staff/[id]/permissions/permissions-client.tsx": 2,
      "apps/web/app/(protected)/inventory/_components/stocktake-mode-selector.tsx": 1,
      "apps/web/app/(protected)/inventory/count-slips/count-slips-client.tsx": 1,
      "apps/web/app/(protected)/inventory/issues/[id]/issue-detail-client.tsx": 1,
      "apps/web/app/(protected)/inventory/purchase-orders/[id]/po-detail-client.tsx": 1,
      "apps/web/app/(protected)/inventory/supplier-invoices/supplier-invoices-client.tsx": 1,
      "apps/web/app/(protected)/orders/order-detail-sheet.tsx": 8,
      "apps/web/app/(public)/access-denied/page.tsx": 3,
    },
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
      "apps/web/app/(public)/payment/momo/return/page.tsx": 1,
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

  for (const filePath of walkUiRuntimeFiles([".tsx"])) {
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
for (const filePath of walkUiRuntimeFiles([".tsx"])) {
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
  "/br",
  "/inventory/drafts",
]);
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

// raw-empty-import-route-code: app routes use AppEmptyState/TableEmptyStateRow
// adapters. The raw Empty primitive is reserved for adapter implementations and
// explicitly approved shell layers so route-local markup cannot fork empty-state
// behavior.
const RAW_EMPTY_IMPORT_ALLOWLIST = new Set([
  "apps/web/app/components/surface.tsx",
]);
for (const filePath of walkUiRuntimeFiles([".tsx"])) {
  const normalized = toPosix(filePath);
  if (RAW_EMPTY_IMPORT_ALLOWLIST.has(normalized)) continue;
  const content = fs.readFileSync(filePath, "utf8");
  if (content.includes('"@comtammatu/ui/components/empty"')) {
    failures.push(
      `raw-empty-import-route-code: ${normalized} imports raw Empty primitives. Use AppEmptyState or TableEmptyStateRow; raw Empty* is reserved for approved wrappers (design-system.md Empty / Confirm).`,
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

// Baseline: DOC-WORKFLOW pages that pre-date the DocumentFormFrame mandate
// (docs/spec/page-archetypes.md § DOC-WORKFLOW). Only shrinks as pages migrate.
const DOC_WORKFLOW_FRAME_BASELINE = new Set([
  "apps/web/app/(protected)/inventory/production/new/page.tsx",
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
  if (PAGE_ARCHETYPES[file] !== "DOC-WORKFLOW") continue;
  if (
    !pageOrDirectClientUsesDocumentFormFrame(file) &&
    !branchPageOrDirectClientUsesOperatorWorkflowFrame(file) &&
    !DOC_WORKFLOW_FRAME_BASELINE.has(file)
  ) {
    failures.push(
      `page-archetype: ${file} is a DOC-WORKFLOW page without an approved frame in the page or its direct client owner. Office uses DocumentFormFrame; Branch touch uses BranchOperatorPage + BranchOperatorPanel + AppDetailFooter (docs/spec/page-archetypes.md § DOC-WORKFLOW).`,
    );
  }
}

for (const file of DOC_WORKFLOW_FRAME_BASELINE) {
  if (PAGE_ARCHETYPES[file] !== "DOC-WORKFLOW") {
    failures.push(
      `page-archetype: DOC_WORKFLOW_FRAME_BASELINE has a stale entry for ${file}, which is no longer DOC-WORKFLOW. Remove it from scripts/check-ui-contract.mjs.`,
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
  "apps/web/app/(protected)/inventory/count-slips/page.tsx",
  "apps/web/app/(protected)/inventory/count-assignments/page.tsx",
  "apps/web/app/(protected)/inventory/waste/approvals/page.tsx",
]);
const LIST_WIDTH_TIER_PINNED_PAGES = [
  "apps/web/app/(protected)/inventory/grn/page.tsx",
  "apps/web/app/(protected)/inventory/ingredients/page.tsx",
  "apps/web/app/(protected)/inventory/issues/page.tsx",
  "apps/web/app/(protected)/inventory/purchase-orders/page.tsx",
  "apps/web/app/(protected)/inventory/recipes/page.tsx",
  "apps/web/app/(protected)/inventory/stocktake/page.tsx",
  "apps/web/app/(protected)/inventory/supplier-invoices/page.tsx",
  "apps/web/app/(protected)/inventory/supplier-returns/page.tsx",
  "apps/web/app/(protected)/inventory/transfers/page.tsx",
];

// Read the width tier declared on the non-embedded page shell for a LIST page.
// The shell (AppPage / InventoryPageContent) lives in a client co-located in the
// page's own directory; the `embedded` return path is a bare <div>, so any shell
// opening tag in that directory is the office-plane LIST shell. Returns the set
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
// baseline = 0; form-control trigger buttons route through size="field".
const BUTTON_HEIGHT_BASELINE = {};
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
      `native-interactive-element: ${normalized} has ${count} raw native action(s). Use Button/Link via a Má Tư DS primitive; keep raw anchors only for hash/tel/external links or primitive asChild children.`,
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
  const allowed = BUTTON_HEIGHT_BASELINE[normalized] ?? 0;
  if (count > allowed) {
    failures.push(
      `button-height-on-button: ${normalized} has ${count} action raw height(s), allowed ${allowed}. Use a Button size variant; non-action heights are out of scope (design-system.md § Enforcement Status / D030).`,
    );
  }
}

// operator-embedded-button-density (page-archetypes.md § Operator Embedded
// Presentation Contract R3): office-density `size="sm"`/`size="xs"` on
// `<Button>` inside a client component that is re-mounted embedded under
// Branch runtime chrome (page-archetypes.md § EMBED-WRAPPER). A static gate
// cannot see which JSX branch runs when `embedded` is true (the same
// `content` block is often shared with the office plane), so this ratchets
// the raw per-file count instead of trying to attribute a hit to a specific
// branch — shrink-only, so office-density buttons in these files can only
// decrease as they migrate to `size={embedded ? "touch" : "sm"}`. Scoped to
// the embedded-mounted client files named in D058/D059, not every
// EMBED-WRAPPER target — widen the file list only with a contract reason.
const OPERATOR_EMBEDDED_BUTTON_DENSITY_FILES = [
  "apps/web/app/(protected)/orders/orders-page-body.tsx",
  "apps/web/app/(protected)/inventory/grn/grn-list-client.tsx",
  "apps/web/app/(protected)/inventory/grn/[id]/grn-detail-client.tsx",
  "apps/web/app/(protected)/inventory/grn/new/[supplierId]/grn-create-client.tsx",
  "apps/web/app/(protected)/inventory/issues/issues-client.tsx",
  "apps/web/app/(protected)/inventory/count-assignments/count-assignments-client.tsx",
  "apps/web/app/(protected)/inventory/purchase-orders/purchase-orders-client.tsx",
  "apps/web/app/(protected)/inventory/purchase-orders/new/new-po-client.tsx",
  "apps/web/app/(protected)/inventory/purchase-orders/[id]/po-detail-client.tsx",
  "apps/web/app/(protected)/branch-settings/_shared/printers/printers-client.tsx",
  "apps/web/app/(protected)/inventory/stocktake/[id]/stocktake-detail-client.tsx",
  "apps/web/app/(protected)/inventory/stocktake/[id]/count/count-client.tsx",
];
const OPERATOR_EMBEDDED_BUTTON_DENSITY_BASELINE = {};
const OPERATOR_EMBEDDED_BUTTON_SIZE_TOKEN =
  /\bsize=(?:"(?:sm|xs)"|'(?:sm|xs)'|\{["'](?:sm|xs)["']\})/;
function countOperatorEmbeddedButtonDensity(content) {
  let count = 0;
  for (const tag of extractJsxOpeningTags(content, "Button")) {
    if (OPERATOR_EMBEDDED_BUTTON_SIZE_TOKEN.test(tag)) count += 1;
  }
  return count;
}
for (const relPath of OPERATOR_EMBEDDED_BUTTON_DENSITY_FILES) {
  const filePath = path.join(REPO_ROOT, relPath);
  if (!fs.existsSync(filePath)) {
    failures.push(
      `operator-embedded-button-density: ${relPath} is missing; update OPERATOR_EMBEDDED_BUTTON_DENSITY_FILES.`,
    );
    continue;
  }
  const content = fs.readFileSync(filePath, "utf8");
  const count = countOperatorEmbeddedButtonDensity(content);
  const allowed = OPERATOR_EMBEDDED_BUTTON_DENSITY_BASELINE[relPath] ?? 0;
  if (count > allowed) {
    failures.push(
      `operator-embedded-button-density: ${relPath} has ${count} office-density Button(s) (size="sm"/"xs"), allowed ${allowed}. Operator-plane primary actions use size={embedded ? "touch" : "sm"} (page-archetypes.md § Operator Embedded Presentation Contract R3).`,
    );
  }
}

// operator-embedded-page-header-boundary (page-archetypes.md § Operator
// Embedded Presentation Contract R1): an embedded Branch runtime screen must not
// receive a nested `AppPageHeader` through shared canonical `content`. Office
// headers remain valid when explicitly gated by `embedded ? … : <AppPageHeader>`
// or `!embedded ? <AppPageHeader> : …`.
const OPERATOR_EMBEDDED_PAGE_HEADER_FILES = [
  "apps/web/app/(protected)/inventory/count-assignments/count-assignments-client.tsx",
  "apps/web/app/(protected)/inventory/count-slips/count-slips-client.tsx",
  "apps/web/app/(protected)/inventory/grn/grn-list-client.tsx",
  "apps/web/app/(protected)/inventory/issues/[id]/issue-detail-client.tsx",
  "apps/web/app/(protected)/inventory/issues/issues-client.tsx",
  "apps/web/app/(protected)/inventory/purchase-orders/[id]/po-detail-client.tsx",
  "apps/web/app/(protected)/inventory/purchase-orders/purchase-orders-client.tsx",
  "apps/web/app/(protected)/inventory/reports/reports-client.tsx",
  "apps/web/app/(protected)/inventory/stock/[ingredientId]/page.tsx",
  "apps/web/app/(protected)/inventory/stocktake/[id]/stocktake-detail-client.tsx",
  "apps/web/app/(protected)/inventory/stocktake/stocktake-list-client.tsx",
  "apps/web/app/(protected)/inventory/supplier-returns/[id]/page.tsx",
  "apps/web/app/(protected)/inventory/supplier-returns/supplier-returns-client.tsx",
  "apps/web/app/(protected)/inventory/transfers/[id]/transfer-detail-client.tsx",
  "apps/web/app/(protected)/inventory/transfers/transfers-list-client.tsx",
  "apps/web/app/(protected)/inventory/waste/approvals/waste-approvals-client.tsx",
  "apps/web/app/(protected)/inventory/waste/new/page.tsx",
];
const OPERATOR_EMBEDDED_HEADER_BRANCH_GUARD =
  /(?:!\s*embedded\s*\?|\bembedded\s*\?)/;
function countOperatorEmbeddedPageHeaderLeaks(content) {
  let count = 0;
  for (const expression of extractConstExpressions(content, "content")) {
    let searchFrom = 0;
    while (searchFrom < expression.length) {
      const index = expression.indexOf("<AppPageHeader", searchFrom);
      if (index === -1) break;
      const prefix = expression.slice(0, index);
      const guardWindow = prefix.slice(Math.max(0, prefix.length - 220));
      if (
        !OPERATOR_EMBEDDED_HEADER_BRANCH_GUARD.test(guardWindow) &&
        !/\bembedded\s*\?/.test(prefix)
      ) {
        count += 1;
      }
      searchFrom = index + 1;
    }
  }
  return count;
}
for (const relPath of OPERATOR_EMBEDDED_PAGE_HEADER_FILES) {
  const filePath = path.join(REPO_ROOT, relPath);
  if (!fs.existsSync(filePath)) {
    failures.push(
      `operator-embedded-page-header-boundary: ${relPath} is missing; update OPERATOR_EMBEDDED_PAGE_HEADER_FILES.`,
    );
    continue;
  }
  const content = fs.readFileSync(filePath, "utf8");
  const count = countOperatorEmbeddedPageHeaderLeaks(content);
  if (count > 0) {
    failures.push(
      `operator-embedded-page-header-boundary: ${relPath} has ${count} shared content AppPageHeader leak(s). Gate Office headers on !embedded or split AppPageTabs/content out of AppPageHeader (page-archetypes.md § Operator Embedded Presentation Contract R1).`,
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

function actualMapToRecord(actuals) {
  return Object.fromEntries(actuals.entries());
}

const baselineGuardIds = new Set(Object.keys(UI_CONTRACT_BASELINE_POLICIES));
const baselineDefinitions = [
  ...checks
    .filter(
      (gate) =>
        baselineGuardIds.has(gate.id) &&
        Array.isArray(gate.roots) &&
        gate.pattern instanceof RegExp,
    )
    .map((gate) => ({
      id: gate.id,
      actualByFile: actualMapToRecord(
        computePerFileActuals(gate.roots, gate.pattern),
      ),
      allowed: Object.values(gate.allowlist).reduce(
        (sum, count) => sum + count,
        0,
      ),
      allowedByFile: gate.allowlist,
    })),
  ...countBudgets
    .filter((gate) => baselineGuardIds.has(gate.id))
    .map((gate) => ({
      id: gate.id,
      actualByFile: actualMapToRecord(
        computePerFileActuals(gate.roots, gate.pattern),
      ),
      allowed: gate.maxCount,
    })),
  ...perFileCountBudgets
    .filter((gate) => baselineGuardIds.has(gate.id))
    .map((gate) => ({
      id: gate.id,
      actualByFile: actualMapToRecord(
        computePerFileActuals(gate.roots, gate.pattern),
      ),
      allowed: Object.values(gate.allowlist).reduce(
        (sum, count) => sum + count,
        0,
      ),
      allowedByFile: gate.allowlist,
    })),
  {
    id: "operator-embedded-button-density",
    actualByFile: Object.fromEntries(
      OPERATOR_EMBEDDED_BUTTON_DENSITY_FILES.map((file) => {
        const filePath = path.join(REPO_ROOT, file);
        return [
          file,
          fs.existsSync(filePath)
            ? countOperatorEmbeddedButtonDensity(
                fs.readFileSync(filePath, "utf8"),
              )
            : 0,
        ];
      }).filter(([, count]) => count > 0),
    ),
    allowed: Object.values(OPERATOR_EMBEDDED_BUTTON_DENSITY_BASELINE).reduce(
      (sum, count) => sum + count,
      0,
    ),
    allowedByFile: OPERATOR_EMBEDDED_BUTTON_DENSITY_BASELINE,
  },
];
const baselineReporting = buildUiContractBaselineReporting(baselineDefinitions);
for (const error of baselineReporting.errors) {
  failures.push(`baseline-reporting-closure: ${error}`);
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
  const formatterGuardIds = new Set(
    formatterGuardBaselines.map((gate) => gate.id),
  );
  const allowlistGates = [
    ...checks
      .filter(
        (gate) =>
          Array.isArray(gate.roots) &&
          gate.pattern instanceof RegExp &&
          gate.allowlist != null,
      )
      .map((gate) => ({
        varName: formatterGuardIds.has(gate.id)
          ? "formatterGuardBaselines"
          : "checks",
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

  // OPERATOR_EMBEDDED_BUTTON_DENSITY_BASELINE: bare `{file: count}` const
  // scoped to OPERATOR_EMBEDDED_BUTTON_DENSITY_FILES (fixed list, not
  // walkFiles) — actuals use the same <Button> tag scanner as the check above.
  {
    const actuals = new Map();
    for (const relPath of OPERATOR_EMBEDDED_BUTTON_DENSITY_FILES) {
      const filePath = path.join(REPO_ROOT, relPath);
      if (!fs.existsSync(filePath)) continue;
      const content = fs.readFileSync(filePath, "utf8");
      const count = countOperatorEmbeddedButtonDensity(content);
      if (count > 0) actuals.set(relPath, count);
    }
    const oldTotal = Object.values(
      OPERATOR_EMBEDDED_BUTTON_DENSITY_BASELINE,
    ).reduce((a, b) => a + b, 0);
    const next = ratchetAllowlist(
      OPERATOR_EMBEDDED_BUTTON_DENSITY_BASELINE,
      actuals,
    );
    const newTotal = Object.values(next).reduce((a, b) => a + b, 0);
    const span = locateConstValueSpan(
      source,
      "OPERATOR_EMBEDDED_BUTTON_DENSITY_BASELINE",
    );
    if (!span) {
      console.error(
        "--write: could not locate OPERATOR_EMBEDDED_BUTTON_DENSITY_BASELINE",
      );
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
      id: "operator-embedded-button-density",
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

if (BASELINE_REPORT_MODE) {
  console.log(JSON.stringify(baselineReporting));
} else {
  console.log("UI contract check: baseline không tăng.");
}
