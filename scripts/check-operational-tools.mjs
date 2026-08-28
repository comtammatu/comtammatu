#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const REPO_ROOT = process.cwd();
const EXTENSION_ROOTS = [
  "tools/grab-pos-relay-extension",
  "tools/shopeefood-pos-relay-extension",
];
const MATU_AGENT_ROOT = path.join(REPO_ROOT, "tools", "matu-agent");
const GRADLE_WRAPPER_JAR = path.join(
  MATU_AGENT_ROOT,
  "gradle",
  "wrapper",
  "gradle-wrapper.jar",
);

function fail(message) {
  console.error(message);
  process.exit(1);
}

function extensionJavaScriptFiles() {
  const files = [];
  for (const relativeRoot of EXTENSION_ROOTS) {
    const absoluteRoot = path.join(REPO_ROOT, relativeRoot);
    if (!fs.existsSync(absoluteRoot)) {
      fail(`Missing operational extension root: ${relativeRoot}`);
    }
    const stack = [absoluteRoot];
    while (stack.length > 0) {
      const current = stack.pop();
      if (!current) continue;
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const absolute = path.join(current, entry.name);
        if (entry.isDirectory()) {
          stack.push(absolute);
        } else if (entry.isFile() && entry.name.endsWith(".js")) {
          files.push(absolute);
        }
      }
    }
  }
  return files.sort();
}

for (const file of extensionJavaScriptFiles()) {
  const result = spawnSync(process.execPath, ["--check", file], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout);
    fail(`Operational extension syntax check failed: ${path.relative(REPO_ROOT, file)}`);
  }
}

if (!fs.existsSync(GRADLE_WRAPPER_JAR)) {
  fail("Missing Má Tư Agent Gradle wrapper JAR");
}

const gradle = spawnSync(
  "java",
  [
    "-classpath",
    GRADLE_WRAPPER_JAR,
    "org.gradle.wrapper.GradleWrapperMain",
    "test",
    "--no-daemon",
  ],
  {
    cwd: MATU_AGENT_ROOT,
    encoding: "utf8",
    stdio: "inherit",
  },
);

if (gradle.error) {
  fail(`Could not start Má Tư Agent tests: ${gradle.error.message}`);
}
if (gradle.status !== 0) {
  fail(`Má Tư Agent tests failed with exit status ${gradle.status}`);
}

console.log("Operational tools: extension syntax and Má Tư Agent tests passed.");
