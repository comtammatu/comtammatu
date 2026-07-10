import fs from "node:fs";
import path from "node:path";

const REPO_ROOT = process.cwd();

// Code-level enforcement for deterministic rules in tasks/regressions.md. Each
// guard turns a rule from "the agent must remember it" into "CI blocks the
// regression" — an enforced rule costs zero context, a prose rule is re-read
// every session. Add a row when a rule's detection is a deterministic code
// pattern. Comments are stripped before matching, so the naive `Detect:` greps
// quoted in the rules (which false-positive on doc comments) are hardened here.
const GUARDS = [
  {
    rule: "PROXY-NEVER-CALL-GETUSER",
    expect: "absent",
    pattern: /\.getUser\(\)/,
    paths: [
      "apps/web/proxy.ts",
      "packages/database/src/supabase/middleware.ts",
    ],
    reason:
      "proxy/middleware route on getSession() (cookie decode + auto-refresh), never getUser() (HTTP roundtrip per nav)",
  },
  {
    rule: "PROXY-NEVER-CALL-GETUSER",
    expect: "present",
    pattern: /\.getUser\(\)/,
    paths: ["apps/web/app/_lib/auth.ts"],
    reason:
      "Server Action auth context MUST keep getUser() HTTP validation (banned-user defense-in-depth)",
  },
  {
    rule: "MULTI-KEY-PERMISSION-PARALLEL",
    expect: "absent",
    pattern:
      /for\s*\(\s*const\s+\w+\s+of\s+\w+\s*\)\s*\{[^}]*await\s+(?:currentUserHasPermissionAny|hasPermissionGrant)/,
    paths: ["apps/web/app/_lib"],
    reason:
      "multi-key permission probes fan out via Promise.all, never sequential for-await (N×RTT)",
  },
  {
    rule: "PAYROLL-CALCULATE-MUST-BE-ATOMIC-RPC",
    expect: "present",
    pattern: /\.rpc\(\s*["']upsert_payroll_calculation["']/,
    paths: ["apps/web/app/(protected)/hr/payroll-actions.ts"],
    reason:
      "calculatePayroll persists entries + period status via one atomic RPC, never two separate PostgREST writes",
  },
  {
    rule: "PAYROLL-CALCULATE-MUST-BE-ATOMIC-RPC",
    expect: "absent",
    pattern: /\.update\(\s*\{\s*status:\s*["']calculated["']/,
    paths: ["apps/web/app/(protected)/hr/payroll-actions.ts"],
    reason:
      "the calculated-status flip is folded into upsert_payroll_calculation; a separate status='calculated' update reintroduces the entries/status divergence (approve/pay use 'approved'/'paid', not matched)",
  },
  {
    rule: "PAYROLL-PRORATION-CAP-AT-STANDARD",
    expect: "present",
    pattern:
      /calculatePayableDays\(\{\s*workingDays,\s*paidLeaveDays,\s*standardDays,\s*\}\)/,
    paths: ["apps/web/app/(protected)/hr/payroll-actions.ts"],
    reason:
      "proration uses payable days, where completed workdays plus paid annual leave are capped at standard_days before base salary is prorated",
  },
  {
    rule: "PAYROLL-PRORATION-CAP-AT-STANDARD",
    expect: "present",
    pattern:
      /return\s+Math\.min\(\s*Math\.max\(0,\s*input\.workingDays\)\s*\+\s*Math\.max\(0,\s*input\.paidLeaveDays\)\s*,\s*Math\.max\(0,\s*input\.standardDays\)\s*,?\s*\)/,
    paths: ["apps/web/lib/hr/payroll-day-math.ts"],
    reason:
      "calculatePayableDays caps completed workdays + paid annual leave at standard_days, preventing overpay when attendance exceeds the standard period",
  },
];

const CODE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs"];

function resolveFiles(relPath) {
  const abs = path.join(REPO_ROOT, relPath);
  if (!fs.existsSync(abs)) return [];
  if (!fs.statSync(abs).isDirectory()) return [abs];

  const out = [];
  const stack = [abs];
  while (stack.length > 0) {
    const dir = stack.pop();
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === ".next") continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (CODE_EXTENSIONS.some((ext) => entry.name.endsWith(ext)))
        out.push(full);
    }
  }
  return out;
}

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

function countMatches(relPath, pattern) {
  const flags = pattern.flags.includes("g")
    ? pattern.flags
    : pattern.flags + "g";
  const global = new RegExp(pattern.source, flags);
  let total = 0;
  for (const file of resolveFiles(relPath)) {
    const code = stripComments(fs.readFileSync(file, "utf8"));
    total += [...code.matchAll(global)].length;
  }
  return total;
}

const failures = [];
for (const guard of GUARDS) {
  const count = guard.paths.reduce(
    (sum, relPath) => sum + countMatches(relPath, guard.pattern),
    0,
  );
  if (guard.expect === "absent" && count > 0) {
    failures.push(
      `[${guard.rule}] ${count} forbidden match(es) in ${guard.paths.join(", ")} — ${guard.reason}`,
    );
  }
  if (guard.expect === "present" && count === 0) {
    failures.push(
      `[${guard.rule}] required pattern missing from ${guard.paths.join(", ")} — ${guard.reason}`,
    );
  }
}

if (failures.length > 0) {
  console.error("Regression guard check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  console.error(
    "These enforce named rules in tasks/regressions.md. Fix the code, or update the rule + guard together.",
  );
  process.exit(1);
}

const ruleCount = new Set(GUARDS.map((guard) => guard.rule)).size;
console.log(
  `Regression guards: ${GUARDS.length} guards over ${ruleCount} rules in sync.`,
);
