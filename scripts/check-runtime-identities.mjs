#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const REPO_ROOT = process.cwd();
const RUNTIME_ROOTS = [
  "apps",
  "packages",
  "scripts",
  "tools",
  "docs/runbooks",
  "supabase/migrations",
];
const SOURCE_EXTENSIONS = new Set([
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".ts",
  ".tsx",
  ".kt",
  ".md",
  ".ps1",
  ".sql",
]);
const IGNORED_DIRECTORIES = new Set([
  ".git",
  ".next",
  "coverage",
  "dist",
  "dist-bundle",
  "e2e",
  "fixtures",
  "node_modules",
  "test-results",
  "tests",
  "test",
  "__tests__",
]);

function normalizeIdentifier(value) {
  return value.replace(/[^a-z0-9]/giu, "").toLowerCase();
}

function isOperationalIdentityName(value) {
  const normalized = normalizeIdentifier(value);
  return (
    normalized.endsWith("branchid") ||
    normalized.endsWith("tenantid") ||
    normalized.endsWith("siteid")
  );
}

function isOperationalIdentityMapName(value) {
  const normalized = normalizeIdentifier(value);
  return (
    /(branch|tenant|site)/u.test(normalized) &&
    /(map|lookup|byname|bycode)/u.test(normalized)
  );
}

function propertyNameText(name) {
  if (!name) return null;
  if (
    ts.isIdentifier(name) ||
    ts.isStringLiteralLike(name) ||
    ts.isNumericLiteral(name)
  )
    return name.text;
  return null;
}

function assignedIdentityName(node) {
  if (ts.isIdentifier(node)) return node.text;
  if (ts.isPropertyAccessExpression(node)) return node.name.text;
  if (
    ts.isElementAccessExpression(node) &&
    node.argumentExpression &&
    ts.isStringLiteralLike(node.argumentExpression)
  ) {
    return node.argumentExpression.text;
  }
  return null;
}

function unwrapExpression(node) {
  let current = node;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isNonNullExpression(current) ||
    ts.isSatisfiesExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function hardcodedIdentityLiteral(node) {
  const expression = unwrapExpression(node);
  if (ts.isNumericLiteral(expression)) {
    return Number(expression.text) > 0 ? expression.text : null;
  }
  if (
    ts.isStringLiteralLike(expression) &&
    /^\d+$/u.test(expression.text) &&
    Number(expression.text) > 0
  ) {
    return JSON.stringify(expression.text);
  }
  if (
    ts.isPrefixUnaryExpression(expression) &&
    (expression.operator === ts.SyntaxKind.PlusToken ||
      expression.operator === ts.SyntaxKind.MinusToken) &&
    ts.isNumericLiteral(expression.operand)
  ) {
    return expression.operator === ts.SyntaxKind.PlusToken &&
      Number(expression.operand.text) > 0
      ? expression.getText()
      : null;
  }
  if (
    ts.isBinaryExpression(expression) &&
    (expression.operatorToken.kind === ts.SyntaxKind.BarBarToken ||
      expression.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken)
  ) {
    return hardcodedIdentityLiteral(expression.right);
  }
  if (ts.isConditionalExpression(expression)) {
    return (
      hardcodedIdentityLiteral(expression.whenTrue) ??
      hardcodedIdentityLiteral(expression.whenFalse)
    );
  }
  if (
    ts.isCallExpression(expression) &&
    ts.isPropertyAccessExpression(expression.expression) &&
    expression.expression.name.text === "default" &&
    expression.arguments[0]
  ) {
    return hardcodedIdentityLiteral(expression.arguments[0]);
  }
  return null;
}

function collectIdentityMapLiterals(node, out = []) {
  const expression = unwrapExpression(node);
  if (ts.isObjectLiteralExpression(expression)) {
    for (const property of expression.properties) {
      if (!ts.isPropertyAssignment(property)) continue;
      const key = propertyNameText(property.name);
      if (key && /^\d+$/u.test(key) && Number(key) > 0) {
        out.push({ node: property.name, literal: key });
      }
      const literal = hardcodedIdentityLiteral(property.initializer);
      if (literal !== null) out.push({ node: property, literal });
    }
    return out;
  }
  if (
    ts.isNewExpression(expression) &&
    ts.isIdentifier(expression.expression) &&
    expression.expression.text === "Map" &&
    expression.arguments?.[0] &&
    ts.isArrayLiteralExpression(expression.arguments[0])
  ) {
    for (const entry of expression.arguments[0].elements) {
      if (!ts.isArrayLiteralExpression(entry) || !entry.elements[1]) continue;
      if (entry.elements[0]) {
        const keyLiteral = hardcodedIdentityLiteral(entry.elements[0]);
        if (keyLiteral !== null) out.push({ node: entry, literal: keyLiteral });
      }
      const literal = hardcodedIdentityLiteral(entry.elements[1]);
      if (literal !== null) out.push({ node: entry, literal });
    }
  }
  return out;
}

function scriptKind(filePath) {
  if (filePath.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (filePath.endsWith(".jsx")) return ts.ScriptKind.JSX;
  if (filePath.endsWith(".ts")) return ts.ScriptKind.TS;
  return ts.ScriptKind.JS;
}

function lineNumber(sourceFile, node) {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function addViolation(violations, sourceFile, node, identity, literal, reason) {
  violations.push({
    line: lineNumber(sourceFile, node),
    identity,
    literal,
    reason,
  });
}

export function analyzeRuntimeIdentitySource(source, filePath = "runtime.ts") {
  if (
    filePath.endsWith(".kt") ||
    filePath.endsWith(".md") ||
    filePath.endsWith(".ps1") ||
    filePath.endsWith(".sql") ||
    filePath.endsWith(".env.example")
  ) {
    return analyzeTextRuntimeIdentitySource(source);
  }
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKind(filePath),
  );
  const violations = [];

  function inspect(node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const identity = node.name.text;
      const literal = hardcodedIdentityLiteral(node.initializer);
      if (isOperationalIdentityName(identity) && literal !== null) {
        addViolation(
          violations,
          sourceFile,
          node,
          identity,
          literal,
          "runtime identity must come from trusted context, configuration, or a database lookup",
        );
      }
      if (isOperationalIdentityMapName(identity)) {
        for (const hit of collectIdentityMapLiterals(node.initializer)) {
          addViolation(
            violations,
            sourceFile,
            hit.node,
            identity,
            hit.literal,
            "name/code-to-database-ID maps are forbidden; resolve the row and assert uniqueness",
          );
        }
      }
    }

    if (ts.isParameter(node) && ts.isIdentifier(node.name) && node.initializer) {
      const identity = node.name.text;
      const literal = hardcodedIdentityLiteral(node.initializer);
      if (isOperationalIdentityName(identity) && literal !== null) {
        addViolation(
          violations,
          sourceFile,
          node,
          identity,
          literal,
          "identity-bearing parameters must not have numeric defaults",
        );
      }
    }

    if (ts.isBindingElement(node) && ts.isIdentifier(node.name) && node.initializer) {
      const identity = node.name.text;
      const literal = hardcodedIdentityLiteral(node.initializer);
      if (isOperationalIdentityName(identity) && literal !== null) {
        addViolation(
          violations,
          sourceFile,
          node,
          identity,
          literal,
          "destructured identity values must not have numeric defaults",
        );
      }
    }

    if (ts.isPropertyAssignment(node)) {
      const identity = propertyNameText(node.name);
      const literal = hardcodedIdentityLiteral(node.initializer);
      if (identity && isOperationalIdentityName(identity) && literal !== null) {
        addViolation(
          violations,
          sourceFile,
          node,
          identity,
          literal,
          "identity-bearing object properties must not contain numeric constants",
        );
      }
    }

    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken
    ) {
      const identity = assignedIdentityName(node.left);
      const literal = hardcodedIdentityLiteral(node.right);
      if (identity && isOperationalIdentityName(identity) && literal !== null) {
        addViolation(
          violations,
          sourceFile,
          node,
          identity,
          literal,
          "identity assignments must not contain numeric constants",
        );
      }
    }

    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ["eq", "neq", "match"].includes(node.expression.name.text) &&
      node.arguments.length >= 2
    ) {
      const field = node.arguments[0];
      const value = node.arguments[1];
      if (field && value && ts.isStringLiteralLike(field)) {
        const literal = hardcodedIdentityLiteral(value);
        if (isOperationalIdentityName(field.text) && literal !== null) {
          addViolation(
            violations,
            sourceFile,
            node,
            field.text,
            literal,
            "database identity filters must use a resolved value",
          );
        }
      }
    }

    if (ts.isStringLiteralLike(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      const match = node.text.match(
        /(?:\/br\/|\bbranch_id=|\btenant_id=|\bsite_id=|--(?:branch|tenant|site)-id(?:=|\s+))(\d+)\b/iu,
      );
      if (match?.[1] && Number(match[1]) > 0) {
        addViolation(
          violations,
          sourceFile,
          node,
          "route/query identity",
          match[1],
          "runtime routes and query strings must interpolate a resolved identity",
        );
      }
    }

    ts.forEachChild(node, inspect);
  }

  inspect(sourceFile);

  for (const match of source.matchAll(
    /\.from\(\s*["'](?:branches|tenants|sites)["']\s*\)[\s\S]{0,1000}?\.limit\(\s*1\s*\)/gu,
  )) {
    const position = match.index ?? 0;
    violations.push({
      line: sourceFile.getLineAndCharacterOfPosition(position).line + 1,
      identity: "ordered identity lookup",
      literal: "first row",
      reason:
        "database identities must not be inferred from the first matching row; require explicit evidence or an exactly-one lookup",
    });
  }

  return violations;
}

export function analyzeTextRuntimeIdentitySource(source) {
  const violations = [];
  const seen = new Set();
  const lines = source.split(/\r?\n/u);

  function add(lineIndex, identity, literal, reason) {
    if (Number(literal) <= 0) return;
    const key = `${lineIndex}:${identity}:${literal}`;
    if (seen.has(key)) return;
    seen.add(key);
    violations.push({
      line: lineIndex + 1,
      identity,
      literal,
      reason,
    });
  }

  lines.forEach((line, lineIndex) => {
    for (const match of line.matchAll(
      /\b(?:const\s+val|val|var)\s+([A-Za-z0-9_]*(?:branch|tenant|site)[A-Za-z0-9_]*id[A-Za-z0-9_]*)\b[^=\n]*=[^\n]*?(?:\?:\s*|,\s*|\s+)(\d+)\b/giu,
    )) {
      if (match[1] && match[2]) {
        add(
          lineIndex,
          match[1],
          match[2],
          "runtime identity must not use a numeric default",
        );
      }
    }

    for (const match of line.matchAll(
      /getInt\(\s*["']((?:branch|tenant|site)_id)["']\s*,\s*(\d+)\b/giu,
    )) {
      if (match[1] && match[2]) {
        add(
          lineIndex,
          match[1],
          match[2],
          "persisted identity configuration must fail closed when absent",
        );
      }
    }

    const envMatch = line.match(
      /^\s*#?\s*([A-Z0-9_]*(?:BRANCH|TENANT|SITE)_ID)\s*=\s*(\d+)\s*$/iu,
    );
    if (envMatch?.[1] && envMatch[2]) {
      add(
        lineIndex,
        envMatch[1],
        envMatch[2],
        "example configuration must not capture a real database identity",
      );
    }

    for (const match of line.matchAll(
      /--((?:branch|tenant|site)-id)(?:=|\s+)(\d+)\b/giu,
    )) {
      if (match[1] && match[2]) {
        add(
          lineIndex,
          match[1],
          match[2],
          "operational CLI examples must require an explicitly resolved identity",
        );
      }
    }

    for (const match of line.matchAll(
      /-((?:Branch|Tenant|Site)Id)\s+(\d+)\b/gu,
    )) {
      if (match[1] && match[2]) {
        add(
          lineIndex,
          match[1],
          match[2],
          "operational PowerShell examples must require an explicitly resolved identity",
        );
      }
    }

    for (const match of line.matchAll(
      /(?:\/br\/|\bbranch_id=|\btenant_id=|\bsite_id=)(\d+)\b/giu,
    )) {
      if (match[1]) {
        add(
          lineIndex,
          "route/query identity",
          match[1],
          "operational documentation must not capture a database identity",
        );
      }
    }

    for (const match of line.matchAll(
      /\b((?:branch|tenant|site)_id)\b\s*(?:=|:=)\s*'?([1-9][0-9]*)'?\b/giu,
    )) {
      if (match[1] && match[2]) {
        add(
          lineIndex,
          match[1],
          match[2],
          "database migrations must resolve operational identities instead of embedding row IDs",
        );
      }
    }

    for (const match of line.matchAll(
      /\b((?:branch|tenant|site)_id)\b[^,;\n]*?\bdefault\s*'?([1-9][0-9]*)'?\b/giu,
    )) {
      if (match[1] && match[2]) {
        add(
          lineIndex,
          match[1],
          match[2],
          "database identity columns must not default to a captured row ID",
        );
      }
    }
  });

  return violations;
}

function shouldIgnoreFile(filePath) {
  const normalized = filePath.split(path.sep).join("/");
  const base = path.basename(filePath);
  return (
    /(?:^|\/)samples?\.[cm]?[jt]sx?$/u.test(normalized) ||
    /(?:^|\/)[^/]+\.test\.[cm]?[jt]sx?$/u.test(normalized) ||
    base === "check-runtime-identities.mjs"
  );
}

function walkRuntimeFiles(repoRoot) {
  const files = [];
  for (const root of RUNTIME_ROOTS) {
    const absoluteRoot = path.join(repoRoot, root);
    if (!fs.existsSync(absoluteRoot)) continue;
    const stack = [absoluteRoot];
    while (stack.length > 0) {
      const current = stack.pop();
      if (!current) continue;
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const absolute = path.join(current, entry.name);
        if (entry.isDirectory()) {
          if (!IGNORED_DIRECTORIES.has(entry.name)) stack.push(absolute);
          continue;
        }
        if (
          entry.isFile() &&
          (SOURCE_EXTENSIONS.has(path.extname(entry.name)) ||
            entry.name.endsWith(".env.example")) &&
          !shouldIgnoreFile(absolute)
        ) {
          files.push(absolute);
        }
      }
    }
  }
  return files.sort();
}

export function scanRuntimeIdentities(repoRoot = REPO_ROOT) {
  const violations = [];
  for (const filePath of walkRuntimeFiles(repoRoot)) {
    const source = fs.readFileSync(filePath, "utf8");
    for (const violation of analyzeRuntimeIdentitySource(source, filePath)) {
      violations.push({
        file: path.relative(repoRoot, filePath).split(path.sep).join("/"),
        ...violation,
      });
    }
  }
  return violations;
}

export function formatRuntimeIdentityViolation(violation) {
  return `${violation.file}:${violation.line} ${violation.identity}=${violation.literal} — ${violation.reason}`;
}

function main() {
  const violations = scanRuntimeIdentities();
  if (violations.length > 0) {
    console.error("Runtime identity guard failed:");
    for (const violation of violations) {
      console.error(`- ${formatRuntimeIdentityViolation(violation)}`);
    }
    console.error(
      "Database identifiers are opaque. Resolve them from auth/URL/config/database evidence; never infer or default them from names, ordering, or seed position.",
    );
    process.exit(1);
  }
  console.log("Runtime identity guard: no hardcoded branch, tenant, or site identifiers found.");
}

const entryPoint = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : null;
if (entryPoint === import.meta.url) main();
