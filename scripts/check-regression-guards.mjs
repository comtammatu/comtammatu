import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const REPO_ROOT = process.cwd();

// Code-level enforcement for deterministic rules in tasks/regressions.md. Each
// guard turns a rule from "the agent must remember it" into "CI blocks the
// regression" — an enforced rule costs zero context, a prose rule is re-read
// every session. Add a row when a rule's detection is a deterministic code
// pattern. Comments are stripped before matching, so the naive `Detect:` greps
// quoted in the rules (which false-positive on doc comments) are hardened here.
const GUARDS = [
  {
    rule: "VERIFY-RUNTIME-IDENTITY-GATE",
    expect: "present",
    pattern: /lint:runtime-identities/,
    paths: ["package.json"],
    reason:
      "the root lint/verify chain must reject hardcoded branch, tenant, and site database identifiers",
  },
  {
    rule: "VERIFY-OPERATIONAL-TOOLS",
    expect: "present",
    pattern: /test:operational-tools/,
    paths: ["package.json"],
    reason:
      "the root test/verify chain must include browser extension syntax and Má Tư Agent tests",
  },
  {
    rule: "VERIFY-OPERATIONAL-TOOLS",
    expect: "present",
    pattern: /GradleWrapperMain/,
    paths: ["scripts/check-operational-tools.mjs"],
    reason:
      "operational tool verification must compile and test the Android relay agent",
  },
  {
    rule: "VERIFY-RUNTIME-IDENTITY-GATE",
    expect: "present",
    pattern: /scanRuntimeIdentities/,
    paths: ["scripts/check-runtime-identities.mjs"],
    reason:
      "the runtime identity gate must keep repository-wide active-source coverage",
  },
  {
    rule: "PROXY-NEVER-CALL-GETUSER",
    expect: "absent",
    pattern: /\.getUser\(\)/,
    paths: [
      "apps/web/proxy.ts",
      "packages/database/src/supabase/middleware.ts",
      "apps/web/app/_lib/auth.ts",
    ],
    reason:
      "proxy/middleware/getAuthContext route on getSession(); never getUser() (nav latency / GRN false-null). Protected RSC Auth liveness is loadAuthState → auth-session-liveness, not auth.ts getAuthContext",
  },
  {
    rule: "ZOMBIE-JWT-AFTER-GLOBAL-SIGNOUT",
    expect: "present",
    pattern: /ensureLiveAuthSession|auth\.getUser|SESSION_EXPIRED_CODE/,
    paths: ["apps/web/app/_lib/with-action.ts"],
    reason:
      "mutation wrappers probe Auth via getUser and map revoked sessions to session_expired, not forbidden",
  },
  {
    rule: "ZOMBIE-JWT-AFTER-GLOBAL-SIGNOUT",
    expect: "present",
    pattern: /probeAuthSessionLiveness|auth\?\.getUser|AUTH_SESSION_CLEAR_PATH/,
    paths: ["apps/web/app/_lib/auth-session-liveness.ts"],
    reason:
      "protected RSC navigations probe Auth liveness and redirect revoked sessions to cookie-clear signout",
  },
  {
    rule: "ZOMBIE-JWT-AFTER-GLOBAL-SIGNOUT",
    expect: "present",
    pattern: /probeAuthSessionLiveness/,
    paths: ["apps/web/app/_lib/auth.ts"],
    reason:
      "loadAuthState calls probeAuthSessionLiveness for far-from-expiry zombie JWT on protected navigation",
  },
  {
    rule: "ZOMBIE-JWT-AFTER-GLOBAL-SIGNOUT",
    expect: "present",
    pattern: /export async function GET\(/,
    paths: ["apps/web/app/api/auth/signout/route.ts"],
    reason:
      "signout Route Handler accepts GET so RSC redirect can Set-Cookie-clear a revoked zombie session",
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
    pattern: /\.rpc\(\s*["']snapshot_payroll_calculation["']/,
    paths: ["apps/web/app/(protected)/hr/payroll-actions.ts"],
    reason:
      "payroll snapshot persists entries + period status through one atomic RPC",
  },
  {
    rule: "PAYROLL-CALCULATE-MUST-BE-ATOMIC-RPC",
    expect: "absent",
    pattern:
      /\.from\(\s*["']payroll_(?:entries|periods)["']\s*\)\s*\.(?:insert|update|delete)\s*\(/,
    paths: ["apps/web/app/(protected)/hr/payroll-actions.ts"],
    reason:
      "direct payroll entry or period writes from the action would split the snapshot transaction",
  },
  {
    rule: "PAYROLL-PRORATION-CAP-AT-STANDARD",
    expect: "present",
    pattern: /calculatePayableDays\(\s*\{/,
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
  {
    rule: "INVENTORY-LEDGER-RPC-ONLY",
    expect: "absent",
    pattern:
      /\.from\(\s*["']stock_movements["']\s*\)\s*\.(?:insert|upsert|update|delete)\s*\(/,
    paths: ["apps/web/app", "apps/web/lib"],
    reason:
      "runtime stock movement writes must use an atomic inventory ledger RPC",
  },
];

/** Balanced-brace scan: forbid await confirm( inside startTransition(…). */
function findConfirmInsideStartTransition(relRoots) {
  const hits = [];
  for (const relRoot of relRoots) {
    for (const file of resolveFiles(relRoot)) {
      const code = stripComments(fs.readFileSync(file, "utf8"));
      let searchFrom = 0;
      while (true) {
        const start = code.indexOf("startTransition(", searchFrom);
        if (start < 0) break;
        const openParen = start + "startTransition".length;
        if (code[openParen] !== "(") {
          searchFrom = start + 1;
          continue;
        }
        let depth = 0;
        let end = -1;
        for (let i = openParen; i < code.length; i++) {
          const ch = code[i];
          if (ch === "(") depth++;
          else if (ch === ")") {
            depth--;
            if (depth === 0) {
              end = i;
              break;
            }
          }
        }
        if (end < 0) break;
        const body = code.slice(openParen, end + 1);
        if (/await\s+confirm\s*\(/.test(body)) {
          const rel = path.relative(REPO_ROOT, file);
          const line = code.slice(0, start).split("\n").length;
          hits.push(`${rel}:${line}`);
        }
        searchFrom = end + 1;
      }
    }
  }
  return hits;
}

const CODE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".json"];

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

function hasModifier(node, kind) {
  return node.modifiers?.some((modifier) => modifier.kind === kind) ?? false;
}

function findInvalidUseServerExports(relRoots) {
  const configPath = path.join(REPO_ROOT, "apps/web/tsconfig.json");
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  if (config.error) {
    throw new Error(
      ts.flattenDiagnosticMessageText(config.error.messageText, "\n"),
    );
  }
  const parsedConfig = ts.parseJsonConfigFileContent(
    config.config,
    ts.sys,
    path.dirname(configPath),
  );
  const program = ts.createProgram({
    rootNames: parsedConfig.fileNames,
    options: parsedConfig.options,
  });
  const checker = program.getTypeChecker();
  const isFunctionReturningPromise = (node) => {
    const signatures = checker.getTypeAtLocation(node).getCallSignatures();
    return (
      signatures.length > 0 &&
      signatures.every(
        (signature) =>
          checker.getPromisedTypeOfPromise(
            checker.getReturnTypeOfSignature(signature),
          ) !== undefined,
      )
    );
  };
  const hits = [];
  for (const relRoot of relRoots) {
    for (const file of resolveFiles(relRoot)) {
      if (!/\.[cm]?[jt]sx?$/.test(file)) continue;
      const source = program.getSourceFile(file);
      if (!source) continue;
      const directive = source.statements[0];
      if (
        !directive ||
        !ts.isExpressionStatement(directive) ||
        !ts.isStringLiteral(directive.expression) ||
        directive.expression.text !== "use server"
      ) {
        continue;
      }

      for (const statement of source.statements.slice(1)) {
        if (ts.isExportAssignment(statement)) {
          if (!isFunctionReturningPromise(statement.expression)) {
            hits.push({ file, node: statement, label: "default export" });
          }
          continue;
        }
        if (ts.isExportDeclaration(statement)) {
          if (statement.isTypeOnly) continue;
          if (!statement.exportClause) {
            hits.push({ file, node: statement, label: "re-export" });
            continue;
          }
          if (ts.isNamedExports(statement.exportClause)) {
            for (const element of statement.exportClause.elements) {
              if (!element.isTypeOnly && !isFunctionReturningPromise(element)) {
                hits.push({
                  file,
                  node: element,
                  label: element.name.text,
                });
              }
            }
          }
          continue;
        }
        if (!hasModifier(statement, ts.SyntaxKind.ExportKeyword)) continue;
        if (hasModifier(statement, ts.SyntaxKind.DeclareKeyword)) continue;
        if (ts.isFunctionDeclaration(statement)) {
          if (!isFunctionReturningPromise(statement)) {
            hits.push({
              file,
              node: statement,
              label: statement.name?.text ?? "default function",
            });
          }
          continue;
        }
        if (ts.isVariableStatement(statement)) {
          for (const declaration of statement.declarationList.declarations) {
            if (
              !declaration.initializer ||
              !isFunctionReturningPromise(declaration.initializer)
            ) {
              hits.push({
                file,
                node: declaration,
                label: declaration.name.getText(source),
              });
            }
          }
          continue;
        }
        if (
          ts.isClassDeclaration(statement) ||
          ts.isEnumDeclaration(statement) ||
          ts.isModuleDeclaration(statement)
        ) {
          hits.push({
            file,
            node: statement,
            label: statement.name?.getText(source) ?? "runtime export",
          });
        }
      }
    }
  }

  return hits.map(({ file, node, label }) => {
    const source = node.getSourceFile();
    const { line } = source.getLineAndCharacterOfPosition(
      node.getStart(source),
    );
    return `${path.relative(REPO_ROOT, file)}:${line + 1} (${label})`;
  });
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

const confirmInTransitionHits = findConfirmInsideStartTransition([
  "apps/web/app",
  "apps/web/lib",
]);
if (confirmInTransitionHits.length > 0) {
  failures.push(
    `[CONFIRM-OUTSIDE-STARTTRANSITION] await confirm( inside startTransition( at ${confirmInTransitionHits.join(", ")} — confirm() must run before startTransition so AlertDialog can open after menu/sheet teardown`,
  );
}

const invalidUseServerExports = findInvalidUseServerExports([
  "apps/web/app",
  "apps/web/lib",
]);
if (invalidUseServerExports.length > 0) {
  failures.push(
    `[USE-SERVER-ASYNC-EXPORTS-ONLY] non-async runtime export(s) at ${invalidUseServerExports.join(", ")} — a module-level \"use server\" file may export only async functions`,
  );
}

if (failures.length > 0) {
  console.error("Regression guard check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  console.error(
    "These enforce named rules in tasks/regressions.md. Fix the code, or update the rule + guard together.",
  );
  process.exit(1);
}

const ruleCount = new Set([
  ...GUARDS.map((guard) => guard.rule),
  "CONFIRM-OUTSIDE-STARTTRANSITION",
  "USE-SERVER-ASYNC-EXPORTS-ONLY",
]).size;
console.log(
  `Regression guards: ${GUARDS.length} pattern guards + 2 structural guards over ${ruleCount} rules; checks passed.`,
);
