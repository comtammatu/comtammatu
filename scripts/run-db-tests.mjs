#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

const REPO = process.cwd();
const TESTS_DIR = join(REPO, "supabase", "tests");
const DB_PORT = process.env["E2E_DB_PORT"] || "55432";
const RELATIVE_INCLUDE = /^\s*\\ir\s+(.+?)\s*$/;

function expandRelativeIncludes(filePath, stack = []) {
  const resolvedFile = resolve(filePath);
  if (stack.includes(resolvedFile)) {
    throw new Error(
      `Circular SQL include: ${[...stack, resolvedFile].join(" -> ")}`,
    );
  }

  const nextStack = [...stack, resolvedFile];
  const expanded = readFileSync(resolvedFile, "utf8")
    .split(/\r?\n/)
    .map((line) => {
      const match = line.match(RELATIVE_INCLUDE);
      if (!match) return line;

      let includeTarget = match[1]?.trim();
      if (!includeTarget) {
        throw new Error(`Empty SQL include in ${resolvedFile}`);
      }

      const quote = includeTarget[0];
      if ((quote === '"' || quote === "'") && includeTarget.at(-1) === quote) {
        includeTarget = includeTarget.slice(1, -1);
      }

      const includePath = resolve(dirname(resolvedFile), includeTarget);
      const repoRelativePath = relative(REPO, includePath);
      if (
        repoRelativePath === ".." ||
        repoRelativePath.startsWith(`..${sep}`) ||
        isAbsolute(repoRelativePath)
      ) {
        throw new Error(`SQL include escapes the repository: ${includeTarget}`);
      }

      return expandRelativeIncludes(includePath, nextStack);
    })
    .join("\n");

  if (/^\s*\\i(?:r)?\b/m.test(expanded)) {
    throw new Error(`Unsupported SQL include directive in ${resolvedFile}`);
  }

  return expanded;
}

function getDatabaseContainer() {
  const result = spawnSync("docker", ["ps", "--format", "{{.Names}} {{.Ports}}"], { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`Failed to run docker ps: ${result.stderr}`);
  }
  const lines = result.stdout.split("\n");
  for (const line of lines) {
    if (line.includes(`:${DB_PORT}->`)) {
      const parts = line.trim().split(/\s+/);
      return parts[0];
    }
  }
  return null;
}

function run() {
  process.stdout.write("Scanning for database SQL tests...\n");

  let files;
  try {
    files = readdirSync(TESTS_DIR).filter(f => f.endsWith(".sql")).sort();
  } catch (err) {
    process.stderr.write(`Failed to read tests directory: ${err.message}\n`);
    process.exit(1);
  }

  if (files.length === 0) {
    process.stdout.write("No SQL tests found.\n");
    process.exit(0);
  }

  const containerName = getDatabaseContainer();
  if (!containerName) {
    process.stderr.write(`Error: Could not find a running database container mapping to port ${DB_PORT}.\n`);
    process.stderr.write("Make sure the local e2e stack is running (node scripts/supabase-e2e-bringup.mjs).\n");
    process.exit(1);
  }

  process.stdout.write(`Found ${files.length} SQL tests. Running tests against container "${containerName}"...\n\n`);

  let failedTests = [];

  for (const file of files) {
    const filePath = join(TESTS_DIR, file);
    process.stdout.write(`--------------------------------------------------\n`);
    process.stdout.write(`Running: ${file}\n`);
    process.stdout.write(`--------------------------------------------------\n`);

    let sqlContent;
    try {
      sqlContent = expandRelativeIncludes(filePath);
    } catch (err) {
      process.stderr.write(`Failed to prepare ${file}: ${err.message}\n`);
      failedTests.push(file);
      continue;
    }

    const result = spawnSync(
      "docker",
      ["exec", "-i", containerName, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"],
      {
        input: sqlContent,
        encoding: "utf8",
        timeout: 300000
      }
    );

    // Print both streams so database failures keep their original context.
    if (result.stdout && result.stdout.trim()) {
      process.stdout.write(`${result.stdout.trim()}\n`);
    }
    if (result.stderr && result.stderr.trim()) {
      process.stderr.write(`${result.stderr.trim()}\n`);
    }

    if (result.status !== 0) {
      process.stdout.write(`\n❌ FAILED: ${file} (exit status ${result.status})\n\n`);
      failedTests.push(file);
    } else {
      process.stdout.write(`\n✅ PASSED: ${file}\n\n`);
    }
  }

  process.stdout.write(`==================================================\n`);
  process.stdout.write(`Summary:\n`);
  process.stdout.write(`==================================================\n`);
  process.stdout.write(`Total tests: ${files.length}\n`);
  process.stdout.write(`Passed:      ${files.length - failedTests.length}\n`);
  process.stdout.write(`Failed:      ${failedTests.length}\n`);

  if (failedTests.length > 0) {
    process.stdout.write(`\nFailed tests list:\n`);
    for (const test of failedTests) {
      process.stdout.write(` - ${test}\n`);
    }
    process.exit(1);
  } else {
    process.stdout.write(`\nAll database tests passed successfully! 🎉\n`);
    process.exit(0);
  }
}

run();
