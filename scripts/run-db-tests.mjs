#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const REPO = process.cwd();
const TESTS_DIR = join(REPO, "supabase", "tests");
const DB_PORT = process.env["E2E_DB_PORT"] || "55432";
const REQUESTED_TESTS = process.argv.slice(2);

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
    const discovered = readdirSync(TESTS_DIR)
      .filter((file) => file.endsWith(".sql"))
      .sort();
    if (REQUESTED_TESTS.length === 0) {
      files = discovered;
    } else {
      const invalid = REQUESTED_TESTS.filter(
        (file) => !/^[a-z0-9_.-]+\.sql$/i.test(file) || !discovered.includes(file),
      );
      if (invalid.length > 0) {
        throw new Error(`Unknown SQL test file(s): ${invalid.join(", ")}`);
      }
      files = [...new Set(REQUESTED_TESTS)];
    }
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

    const sqlContent = readFileSync(filePath, "utf8");
    const result = spawnSync(
      "docker",
      ["exec", "-i", containerName, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"],
      {
        input: sqlContent,
        encoding: "utf8",
        timeout: 300000
      }
    );
    
    // In stderr và stdout
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
