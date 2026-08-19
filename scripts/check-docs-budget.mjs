#!/usr/bin/env node
/**
 * Default (`lint` / `verify`): fail `docs/worklog/**`, ADR >150 lines,
 * and `docs/agent/rules/*` >400 lines. `--strict` also fails LINE_BUDGETS
 * (optional local check; not wired into `lint`). Policy: `engineering.md`.
 */
import assert from "node:assert/strict";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REPO_ROOT = process.cwd();

const LINE_BUDGETS = [
  { path: "docs/spec/design-system.md", maxLines: 1200 },
  { path: "docs/ref/glossary.md", maxLines: 600 },
  { path: "docs/modules/ui.md", maxLines: 400 },
  { path: "docs/plan/decisions.md", maxLines: 160 },
  { path: "docs/ref/finance-assets-vat-fnb.md", maxLines: 350 },
  { path: "docs/spec/toast-notification-system.md", maxLines: 360 },
  { path: "docs/spec/page-archetypes.md", maxLines: 700 },
  { path: "docs/ref/inventory.md", maxLines: 400 },
  { path: "docs/ref/screen-context-map.md", maxLines: 540 },
  { path: "docs/ref/payroll-pit.md", maxLines: 300 },
  { path: "docs/modules/finance.md", maxLines: 280 },
  { path: "docs/modules/auth.md", maxLines: 260 },
  { path: "docs/ref/accounting-books-tt133-tt99.md", maxLines: 200 },
  { path: "docs/ref/labor-contracts.md", maxLines: 200 },
  { path: "docs/spec/self-order-guest-ui.md", maxLines: 250 },
  { path: "docs/spec/architecture.md", maxLines: 220 },
  { path: "docs/ref/operational-data-contract.md", maxLines: 200 },
  { path: "docs/modules/database.md", maxLines: 150 },
  { path: "docs/modules/web-app.md", maxLines: 150 },
  { path: "docs/ref/third-party-integrations.md", maxLines: 120 },
  { path: "docs/spec/operational-audio-alerts.md", maxLines: 120 },
  { path: "docs/spec/pwa.md", maxLines: 200 },
  { path: "docs/ref/branch-route-inventory.md", maxLines: 150 },
  { path: "docs/ref/einvoice-tax.md", maxLines: 120 },
];

const AGENT_RULE_MAX_LINES = 400;
const ADR_MAX_LINES = 150;

function countLines(filePath) {
  const text = readFileSync(filePath, "utf8");
  if (text.length === 0) return 0;
  return text.endsWith("\n")
    ? text.slice(0, -1).split("\n").length
    : text.split("\n").length;
}

export function collectDocsBudgetErrors(repoRoot = REPO_ROOT) {
  const errors = [];
  const worklogRoot = join(repoRoot, "docs/worklog");

  if (existsSync(worklogRoot)) {
    errors.push(
      "docs/worklog/** is retired; delete the directory (git is the archive)",
    );
  }

  for (const { path, maxLines } of LINE_BUDGETS) {
    const full = join(repoRoot, path);
    if (!existsSync(full)) continue;
    const lines = countLines(full);
    if (lines > maxLines) {
      errors.push(`${path}: ${lines} lines exceeds budget ${maxLines}`);
    }
  }

  const rulesDir = join(repoRoot, "docs/agent/rules");
  if (existsSync(rulesDir)) {
    for (const entry of readdirSync(rulesDir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
      const rel = `docs/agent/rules/${entry.name}`;
      const lines = countLines(join(rulesDir, entry.name));
      if (lines > AGENT_RULE_MAX_LINES) {
        errors.push(
          `${rel}: ${lines} lines exceeds budget ${AGENT_RULE_MAX_LINES}`,
        );
      }
    }
  }

  const adrDir = join(repoRoot, "docs/plan/adr");
  if (existsSync(adrDir)) {
    for (const entry of readdirSync(adrDir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
      const rel = `docs/plan/adr/${entry.name}`;
      const lines = countLines(join(adrDir, entry.name));
      if (lines > ADR_MAX_LINES) {
        errors.push(
          `${rel}: ${lines} lines exceeds budget ${ADR_MAX_LINES}`,
        );
      }
    }
  }

  return errors;
}

export function isDocsBudgetLintGate(error) {
  return (
    error.includes("docs/worklog") ||
    error.startsWith("docs/agent/rules/") ||
    error.startsWith("docs/plan/adr/")
  );
}

export function selectDocsBudgetErrors(allErrors, { strict }) {
  if (strict) return { errors: allErrors, advisories: [] };
  return {
    errors: allErrors.filter(isDocsBudgetLintGate),
    advisories: allErrors.filter((error) => !isDocsBudgetLintGate(error)),
  };
}

function writeLines(filePath, lineCount) {
  mkdirSync(join(filePath, ".."), { recursive: true });
  writeFileSync(filePath, `${"x\n".repeat(lineCount)}`);
}

function runSelfTest() {
  const fixture = mkdtempSync(join(tmpdir(), "comtammatu-docs-budget-"));
  try {
    // Join segments so this source file never embeds a contiguous
    // docs/worklog/*.md path (dead-doc-reference scans scripts/).
    mkdirSync(join(fixture, "docs", "worklog"), { recursive: true });
    writeFileSync(join(fixture, "docs", "worklog", "README.md"), "# worklog\n");
    // Segment paths so this source never embeds contiguous docs/*/*.md
    // fixture names (dead-doc-reference scans scripts/).
    writeLines(join(fixture, "docs", "spec", "design-system.md"), 1201);
    writeLines(join(fixture, "docs", "plan", "adr", "9999-over.md"), 151);
    writeLines(join(fixture, "docs", "agent", "rules", "over.md"), 401);

    const all = collectDocsBudgetErrors(fixture);
    assert.match(all.join("\n"), /docs\/worklog/);
    assert.match(all.join("\n"), /docs\/plan\/adr\/9999-over\.md/);
    assert.match(all.join("\n"), /docs\/agent\/rules\/over\.md/);
    assert.match(all.join("\n"), /docs\/spec\/design-system\.md/);

    const { errors, advisories } = selectDocsBudgetErrors(all, {
      strict: false,
    });
    assert.match(errors.join("\n"), /docs\/worklog/);
    assert.match(errors.join("\n"), /docs\/plan\/adr\/9999-over\.md/);
    assert.match(errors.join("\n"), /docs\/agent\/rules\/over\.md/);
    assert.doesNotMatch(errors.join("\n"), /design-system/);
    assert.match(advisories.join("\n"), /design-system/);

    const strict = selectDocsBudgetErrors(all, { strict: true });
    assert.match(strict.errors.join("\n"), /design-system/);
    assert.equal(strict.advisories.length, 0);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
  console.log("[docs-budget] self-test passed");
}

function main() {
  if (process.argv.includes("--self-test")) {
    runSelfTest();
    return;
  }

  const strict = process.argv.includes("--strict");
  const { errors, advisories } = selectDocsBudgetErrors(
    collectDocsBudgetErrors(REPO_ROOT),
    { strict },
  );

  for (const advisory of advisories) {
    console.warn(`[docs-budget] advisory (not a lint fail): ${advisory}`);
  }

  if (errors.length > 0) {
    for (const error of errors) console.error(`[docs-budget] ${error}`);
    process.exit(1);
  }

  console.log(
    strict
      ? "[docs-budget] worklog ban, ADR/agent-rule caps, and spec line budgets ok"
      : "[docs-budget] worklog ban, ADR cap (150), and agent-rule cap (400) ok",
  );
}

main();
