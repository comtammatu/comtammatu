#!/usr/bin/env node
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
  { path: "docs/ref/screen-context-map.md", maxLines: 500 },
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
        errors.push(`${rel}: ${lines} lines exceeds budget ${ADR_MAX_LINES}`);
      }
    }
  }

  return errors;
}

function runSelfTest() {
  const fixture = mkdtempSync(join(tmpdir(), "comtammatu-docs-budget-"));
  try {
    // Join segments so this source file never embeds a contiguous
    // docs/worklog/*.md path (dead-doc-reference scans scripts/).
    mkdirSync(join(fixture, "docs", "worklog"), { recursive: true });
    writeFileSync(join(fixture, "docs", "worklog", "README.md"), "# worklog\n");

    const errors = collectDocsBudgetErrors(fixture);
    assert.match(errors.join("\n"), /docs\/worklog/);
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

  // Default mode enforces structural bans. --strict also enforces line budgets.
  const strict = process.argv.includes("--strict");
  const errors = collectDocsBudgetErrors(REPO_ROOT).filter((error) => {
    if (strict) return true;
    return error.includes("docs/worklog");
  });

  if (errors.length > 0) {
    for (const error of errors) console.error(`[docs-budget] ${error}`);
    process.exit(1);
  }

  console.log(
    strict
      ? "[docs-budget] structural bans and line budgets ok"
      : "[docs-budget] worklog ban ok",
  );
}

main();
