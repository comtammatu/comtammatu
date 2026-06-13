#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function run(command, args) {
  return execFileSync(command, args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function listFiles(command, args) {
  const output = run(command, args);
  return output ? output.split("\n").filter(Boolean) : [];
}

function countDatabaseSection(text, sectionName) {
  const publicSchema = text.indexOf("  public: {");
  const searchFrom = publicSchema === -1 ? 0 : publicSchema;
  const start = text.indexOf(`    ${sectionName}: {`, searchFrom);
  if (start === -1) return 0;
  const sectionNames = ["Tables", "Views", "Functions", "Enums", "CompositeTypes"];
  const nextStarts = sectionNames
    .map((name) => text.indexOf(`    ${name}: {`, start + 1))
    .filter((idx) => idx !== -1);
  const end = Math.min(...nextStarts, text.length);
  const section = text.slice(start, end);
  return [...section.matchAll(/^      [A-Za-z0-9_]+: \{/gm)].length;
}

const databaseTypesPath = join(
  root,
  "packages/database/src/types/database.types.ts",
);
const databaseTypes = existsSync(databaseTypesPath)
  ? readFileSync(databaseTypesPath, "utf8")
  : "";

const routes = listFiles("find", [
  "apps/web/app",
  "-type",
  "f",
  "(",
  "-name",
  "page.tsx",
  "-o",
  "-name",
  "route.ts",
  ")",
]);

const pageRoutes = routes.filter((path) => path.endsWith("/page.tsx"));
const apiRoutes = routes.filter((path) => path.includes("/api/") && path.endsWith("/route.ts"));
const testFiles = listFiles("find", [
  "apps/web/e2e",
  "packages/shared/src",
  "-type",
  "f",
  "(",
  "-name",
  "*.test.ts",
  "-o",
  "-name",
  "*.spec.ts",
  ")",
]);
const migrations = listFiles("find", [
  "supabase/migrations",
  "-maxdepth",
  "1",
  "-type",
  "f",
  "-name",
  "*.sql",
]);

const snapshot = {
  generatedAt: new Date().toISOString(),
  worktree: {
    statusEntries: listFiles("git", ["status", "--porcelain=v1", "-uall"]).length,
  },
  web: {
    pageRoutes: pageRoutes.length,
    apiRoutes: apiRoutes.length,
    routeHandlers: routes.filter((path) => path.endsWith("/route.ts")).length,
  },
  database: {
    tables: countDatabaseSection(databaseTypes, "Tables"),
    views: countDatabaseSection(databaseTypes, "Views"),
    functions: countDatabaseSection(databaseTypes, "Functions"),
    enums: countDatabaseSection(databaseTypes, "Enums"),
    migrationFiles: migrations.length,
  },
  tests: {
    testAndSpecFiles: testFiles.length,
    playwrightSpecs: testFiles.filter((path) => path.startsWith("apps/web/e2e/"))
      .length,
    sharedUnitTests: testFiles.filter((path) =>
      path.startsWith("packages/shared/src/"),
    ).length,
  },
};

console.log(JSON.stringify(snapshot, null, 2));
