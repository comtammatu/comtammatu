import fs from "node:fs";
import path from "node:path";

const REPO_ROOT = process.cwd();

const SCAN_ROOTS = ["apps", "packages", "scripts"];
const EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json"];

const MARKERS = [
  { id: "position-role-bridge-column", pattern: /\blegacy_role_code\b/ },
  { id: "legacy", pattern: /\blegacy\b/i },
  { id: "deprecated", pattern: /@deprecated|\bdeprecated\b/i },
  { id: "dead-code", pattern: /\bdead[- ]code\b/i },
  {
    id: "back-compat",
    pattern: /\bback[- ]compat\b|\bbackward compatibility\b/i,
  },
  { id: "shim", pattern: /\bshim\b/i },
];

const EXCLUDED_FILES = new Set([
  "packages/database/src/types/database.types.ts",
  "scripts/check-baseline-hygiene.mjs",
]);

const CLASSIFIED_FILES = new Map([
  [
    "scripts/check-ui-contract.mjs",
    "UI freeze guard vocabulary; not runtime implementation.",
  ],
  [
    "scripts/page-archetypes.mjs",
    "PAGE_ARCHETYPES census data for the UI freeze guard; REDIRECT-SHIM is an archetype id, not runtime implementation.",
  ],
  [
    "scripts/update-i18n-baseline.mjs",
    "i18n baseline tooling vocabulary; describes the inline-Vietnamese baseline mechanism.",
  ],
  [
    "packages/shared/src/auth/types.ts",
    "JwtClaims.user_role doc comment; user_role is the compatibility claim derived from positions.code via the role-bridge mapper.",
  ],
  [
    "packages/shared/src/payroll/calculate.ts",
    "brackets @param documents the LATEST_VERSION default for backward compatibility; a live API default, not cruft.",
  ],
  [
    "packages/shared/src/auth/__tests__/employee-daily-work-static.test.ts",
    "Asserts the exact SQL comment string shipped in the checklist-template migration; the marker word lives in asserted migration content, not dead code.",
  ],
  [
    "scripts/inventory-legacy-kitchen-backfill.mjs",
    "Active read-only audit for the historical Kho CN -> Bep CN transfer data; 'legacy' names that transfer domain, not retired code.",
  ],
  [
    "apps/web/tests/inventory-rebuild-static.test.ts",
    "Test vocabulary for the Kho CN -> Bep CN legacy-transfer domain (intra-branch RPC guard, branch-kitchen exclusion, backfill audit); references the live audit script, not dead code.",
  ],
  [
    "apps/web/e2e/inventory/transfer-direction.spec.ts",
    "E2E asserts the live redirect from the old transfer-create URL (create=cap-bep) to the consumption surface; URL canonicalization for the legacy kitchen-transfer flow, not cruft.",
  ],
]);

function walkFiles(rootDir) {
  const absoluteRoot = path.join(REPO_ROOT, rootDir);
  if (!fs.existsSync(absoluteRoot)) return [];

  const files = [];
  const stack = [absoluteRoot];

  while (stack.length > 0) {
    const dir = stack.pop();
    if (!dir) continue;

    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (
        entry.name === "node_modules" ||
        entry.name === ".next" ||
        entry.name === "dist" ||
        entry.name === "build"
      ) {
        continue;
      }

      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (
        entry.isFile() &&
        EXTENSIONS.some((extension) => entry.name.endsWith(extension))
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

const failures = [];
const classifiedHits = new Map();

for (const root of SCAN_ROOTS) {
  for (const filePath of walkFiles(root)) {
    const normalized = toPosix(filePath);
    if (EXCLUDED_FILES.has(normalized)) continue;

    const content = fs.readFileSync(filePath, "utf8");
    const lines = content.split(/\r?\n/);

    for (const [index, line] of lines.entries()) {
      for (const marker of MARKERS) {
        if (!marker.pattern.test(line)) continue;

        const reason = CLASSIFIED_FILES.get(normalized);
        if (reason) {
          classifiedHits.set(normalized, reason);
          continue;
        }

        failures.push({
          file: normalized,
          line: index + 1,
          marker: marker.id,
          text: line.trim(),
        });
      }
    }
  }
}

if (failures.length > 0) {
  console.error("Baseline hygiene check failed:");
  for (const failure of failures) {
    console.error(
      `- ${failure.file}:${failure.line} [${failure.marker}] ${failure.text}`,
    );
  }
  console.error(
    "Remove retired/deprecated/dead-code markers from active source, or promote current decisions to the right canonical doc with an explicit owner-approved reason.",
  );
  process.exit(1);
}

const classifiedSummary =
  classifiedHits.size > 0
    ? [...classifiedHits.entries()]
        .map(([file, reason]) => `${file} (${reason})`)
        .join(", ")
    : "none";

console.log(
  `Baseline hygiene check: no unclassified legacy/deprecated/dead-code markers. Classified files: ${classifiedSummary}.`,
);
