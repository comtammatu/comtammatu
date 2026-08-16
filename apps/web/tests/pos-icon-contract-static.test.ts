import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { normalizeEol, toPosixPath } from "./static-source";

function walkFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      files.push(...walkFiles(full));
    } else if (entry.endsWith(".tsx") || entry.endsWith(".ts")) {
      files.push(full);
    }
  }
  return files;
}

const posDir = join(process.cwd(), "app/(protected)/br/[branchId]/pos");
const posFiles = walkFiles(posDir).map((file) => ({
  file,
  rel: toPosixPath(file.slice(process.cwd().length + 1)),
  source: normalizeEol(readFileSync(file, "utf8")),
}));
const posTsx = posFiles.filter((entry) => entry.rel.endsWith(".tsx"));

const FOREIGN_ICON_LIBRARY_RE =
  /from\s+["'](?:@phosphor-icons\/react|phosphor-react|@tabler\/icons-react|@heroicons\/react(?:\/.*)?|react-icons(?:\/.*)?|@radix-ui\/react-icons)["']/;

const LUCIDE_IMPORT_RE =
  /import\s*\{([^}]+)\}\s*from\s*["']lucide-react["']/g;

function lucideAliasFailures(source: string): string[] {
  const failures: string[] = [];
  for (const match of source.matchAll(LUCIDE_IMPORT_RE)) {
    const body = match[1] ?? "";
    for (const specifier of body.split(",")) {
      const trimmed = specifier.trim();
      if (trimmed === "") continue;
      if (!/^[A-Za-z][\w]*\s+as\s+Icon[A-Za-z][\w]*$/.test(trimmed)) {
        failures.push(trimmed);
      }
    }
  }
  return failures;
}

test("POS icons come only from lucide-react with Icon* aliases", () => {
  const foreign: string[] = [];
  const unaliased: string[] = [];

  for (const { rel, source } of posFiles) {
    if (FOREIGN_ICON_LIBRARY_RE.test(source)) foreign.push(rel);
    const aliasMisses = lucideAliasFailures(source);
    if (aliasMisses.length > 0) {
      unaliased.push(`${rel} (${aliasMisses.join(", ")})`);
    }
  }

  assert.deepEqual(foreign, [], `POS must not import a second icon library: ${foreign.join(", ")}`);
  assert.deepEqual(
    unaliased,
    [],
    `POS lucide imports must use \`Name as IconName\`: ${unaliased.join("; ")}`,
  );
});

test("POS does not override Lucide stroke or invent filled SVG icons", () => {
  const stroke: string[] = [];
  const rawSvg: string[] = [];

  for (const { rel, source } of posTsx) {
    if (/\bstrokeWidth\b|\babsoluteStrokeWidth\b/.test(source)) stroke.push(rel);
    if (/<svg\b/.test(source)) rawSvg.push(rel);
  }

  assert.deepEqual(stroke, [], `POS must use Lucide default stroke: ${stroke.join(", ")}`);
  assert.deepEqual(rawSvg, [], `POS must not ship raw <svg> icons: ${rawSvg.join(", ")}`);
});

test("POS icon sizes stay on the design-system role tier", () => {
  const offTier: string[] = [];
  for (const { rel, source } of posTsx) {
    if (/\bsize-(?:7|9|10|11)\b/.test(source)) offTier.push(rel);
  }
  assert.deepEqual(
    offTier,
    [],
    `POS icons must not use size-7/9/10/11 (design-system.md Icon Size by Role): ${offTier.join(", ")}`,
  );
});

test("POS chrome icon-only buttons use icon-touch, not compact icon sizes", () => {
  const compactIcon: string[] = [];
  const fakeTouchIcon: string[] = [];
  const overflowDots: string[] = [];

  for (const { rel, source } of posTsx) {
    if (/size="icon(?:-sm|-lg)?"/.test(source)) compactIcon.push(rel);
    if (
      /size="touch"(?!-lg)[\s\S]{0,220}(?:\bw-12\b|\bmin-w-12\b)[\s\S]{0,80}px-0/.test(
        source,
      )
    ) {
      fakeTouchIcon.push(rel);
    }
    if (/\bMoreVertical\b/.test(source)) overflowDots.push(rel);
  }

  const iconXsFiles = posTsx
    .filter(({ source }) => /size="icon-xs"/.test(source))
    .map(({ rel }) => rel);

  assert.deepEqual(
    compactIcon,
    [],
    `POS station chrome must not use size="icon" / icon-sm / icon-lg: ${compactIcon.join(", ")}`,
  );
  assert.deepEqual(
    fakeTouchIcon,
    [],
    `POS icon-only controls must use size="icon-touch", not size="touch" + w-12 px-0: ${fakeTouchIcon.join(", ")}`,
  );
  assert.deepEqual(
    overflowDots,
    [],
    `POS overflow affordance must be Lucide Ellipsis (⋯), not MoreVertical: ${overflowDots.join(", ")}`,
  );
  assert.deepEqual(
    iconXsFiles,
    ["app/(protected)/br/[branchId]/pos/pos-menu-grid.tsx"],
    "icon-xs is reserved for the POS menu search InputGroup affix",
  );
});

test("POS session chrome and sheets lock icon-touch plus touch search fields", () => {
  const sessionHeader = readFileSync(
    join(posDir, "pos-session-header.tsx"),
    "utf8",
  );
  const orderListPane = readFileSync(
    join(posDir, "_components/order-list-pane.tsx"),
    "utf8",
  );
  const cartPane = readFileSync(
    join(posDir, "_components/cart-pane.tsx"),
    "utf8",
  );
  const itemCustomizer = readFileSync(
    join(posDir, "item-customizer.tsx"),
    "utf8",
  );
  const menuGrid = readFileSync(join(posDir, "pos-menu-grid.tsx"), "utf8");
  const archived = readFileSync(
    join(posDir, "_components/archived-orders-sheet.tsx"),
    "utf8",
  );
  const orderDetail = readFileSync(
    join(posDir, "order-detail-sheet.tsx"),
    "utf8",
  );
  const stationSheet = readFileSync(
    join(process.cwd(), "app/components/surface/station-sheet.tsx"),
    "utf8",
  );

  assert.match(sessionHeader, /Ellipsis as IconEllipsis/);
  assert.match(sessionHeader, /size="icon-touch"/);
  assert.equal(sessionHeader.match(/size="icon-touch"/g)?.length, 3);
  assert.match(orderListPane, /size="icon-touch"/);
  assert.equal(orderListPane.match(/size="icon-touch"/g)?.length, 1);
  assert.match(cartPane, /Utensils as IconUtensils/);
  assert.equal(cartPane.match(/size="icon-touch"/g)?.length, 2);
  assert.match(itemCustomizer, /Minus as IconMinus/);
  assert.match(itemCustomizer, /Plus as IconPlus/);
  assert.equal(itemCustomizer.match(/size="icon-touch"/g)?.length, 2);
  assert.match(menuGrid, /<InputGroup\s+size="touch"/);
  assert.match(menuGrid, /size="icon-touch"/);
  assert.match(archived, /<InputGroup size="touch">/);
  assert.match(orderDetail, /Ellipsis as IconEllipsis/);
  assert.match(
    orderDetail,
    /size=\{canAppendItems \? "icon-touch" : "touch"\}/,
  );
  assert.match(stationSheet, /closeButtonSize="icon-touch"/);
});
