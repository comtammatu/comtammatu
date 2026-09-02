import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative } from "node:path";

const ROOT = process.cwd();

const PNPM_SPAWN = {
  encoding: "utf8",
  stdio: "pipe",
  shell: process.platform === "win32",
};

function runPnpm(args, { cwd = ROOT } = {}) {
  return spawnSync("corepack", ["pnpm", ...args], {
    ...PNPM_SPAWN,
    cwd,
  });
}

const SKIP_DIRS = new Set([
  ".git",
  ".next",
  ".turbo",
  ".vercel",
  "coverage",
  "dist",
  "node_modules",
  "public",
]);

const SCAN_EXTENSIONS = new Set([
  ".cjs",
  ".css",
  ".cts",
  ".js",
  ".json",
  ".jsx",
  ".mjs",
  ".mts",
  ".ts",
  ".tsx",
]);

const ROOT_SCAN_FILES = [
  "eslint.config.mjs",
  "pnpm-workspace.yaml",
  "tsconfig.base.json",
];

const ROOT_SCAN_DIRS = ["scripts"];

const SHELL_BOUNDARY = String.raw`(?:^|[\s;&|()"'` + "`" + String.raw`])`;
const SHELL_END = String.raw`(?=$|[\s;&|()"'` + "`" + String.raw`])`;

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getExtension(filePath) {
  const name = basename(filePath);
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot);
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function collectPackageJsonFiles() {
  const files = [join(ROOT, "package.json")];

  for (const dir of ["apps", "packages"]) {
    const absDir = join(ROOT, dir);
    if (!existsSync(absDir)) continue;

    for (const entry of await readdir(absDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const packageJson = join(absDir, entry.name, "package.json");
      if (existsSync(packageJson)) files.push(packageJson);
    }
  }

  return files;
}

async function collectFiles(dir, files = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;

    const absPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      await collectFiles(absPath, files);
      continue;
    }

    if (!entry.isFile()) continue;
    if (basename(absPath) === "package.json") continue;
    if (!SCAN_EXTENSIONS.has(getExtension(absPath))) continue;
    if (absPath.endsWith(".tsbuildinfo")) continue;

    files.push(absPath);
  }

  return files;
}

async function collectScanFiles(packageDir) {
  if (packageDir !== ROOT) {
    return collectFiles(packageDir);
  }

  const files = [];

  for (const relPath of ROOT_SCAN_FILES) {
    const absPath = join(ROOT, relPath);
    if (existsSync(absPath)) files.push(absPath);
  }

  for (const relDir of ROOT_SCAN_DIRS) {
    const absDir = join(ROOT, relDir);
    if (existsSync(absDir) && (await stat(absDir)).isDirectory()) {
      await collectFiles(absDir, files);
    }
  }

  return files;
}

function directDeps(manifest) {
  return {
    ...manifest.dependencies,
    ...manifest.devDependencies,
    ...manifest.optionalDependencies,
  };
}

async function auditRuntimeContract() {
  const failures = [];
  const nodeMajor = readFileSync(join(ROOT, ".nvmrc"), "utf8").trim();
  if (!/^\d+$/.test(nodeMajor)) {
    return [`.nvmrc must contain one Node.js major, found ${JSON.stringify(nodeMajor)}`];
  }

  const rootManifest = await readJson(join(ROOT, "package.json"));
  if (rootManifest.pnpm != null) {
    failures.push(
      "package.json must not define pnpm settings; keep project configuration in pnpm-workspace.yaml",
    );
  }
  const expectedEngine = `${nodeMajor}.x`;
  if (rootManifest.engines?.node !== expectedEngine) {
    failures.push(
      `package.json engines.node must match .nvmrc (${expectedEngine}), found ${rootManifest.engines?.node ?? "missing"}`,
    );
  }

  const runningMajor = process.versions.node.split(".")[0];
  if (runningMajor !== nodeMajor) {
    failures.push(`deps:audit must run on Node.js ${nodeMajor}.x, found ${process.version}`);
  }

  const ci = readFileSync(join(ROOT, ".github", "workflows", "ci.yml"), "utf8");
  const setupNodeCount = ci.match(/uses:\s*actions\/setup-node@/g)?.length ?? 0;
  const versionFileCount = ci.match(/node-version-file:\s*\.nvmrc/g)?.length ?? 0;
  if (setupNodeCount === 0 || versionFileCount !== setupNodeCount) {
    failures.push(
      `every CI setup-node step must read .nvmrc (${versionFileCount}/${setupNodeCount})`,
    );
  }
  if (/^\s*node-version:\s*/m.test(ci)) {
    failures.push("CI must not hardcode node-version; use node-version-file: .nvmrc");
  }

  for (const packageJsonPath of await collectPackageJsonFiles()) {
    const manifest = await readJson(packageJsonPath);
    const nodeTypes = directDeps(manifest)["@types/node"];
    if (
      typeof nodeTypes === "string" &&
      !new RegExp(`^[~^]?${escapeRegExp(nodeMajor)}\\.`).test(nodeTypes)
    ) {
      failures.push(
        `${relative(ROOT, packageJsonPath)}: @types/node must stay on major ${nodeMajor}, found ${nodeTypes}`,
      );
    }
  }

  const printAgent = await readJson(join(ROOT, "apps", "print-agent", "package.json"));
  if (!printAgent.scripts?.build?.includes(`--target=node${nodeMajor}`)) {
    failures.push(`apps/print-agent build must target node${nodeMajor}`);
  }

  return failures;
}

function hasTsSurface(packageDir, files) {
  if (existsSync(join(packageDir, "tsconfig.json"))) return true;
  return files.some((file) => file.endsWith(".ts") || file.endsWith(".tsx"));
}

function dependencyPattern(depName) {
  const escaped = escapeRegExp(depName);
  return new RegExp(String.raw`["']${escaped}(?:/[^"']*)?["']`);
}

function rawDependencyPattern(depName) {
  return new RegExp(String.raw`(?<![\w@./-])${escapeRegExp(depName)}(?:/[\w@./-]+)?(?![\w@/-])`);
}

function commandPattern(command) {
  return new RegExp(`${SHELL_BOUNDARY}${escapeRegExp(command)}${SHELL_END}`);
}

async function fileContainsDependency(file, depName) {
  const content = await readFile(file, "utf8");
  return dependencyPattern(depName).test(content) || rawDependencyPattern(depName).test(content);
}

function scriptsUseCommand(scripts, command) {
  if (!scripts) return false;
  const pattern = commandPattern(command);
  return Object.values(scripts).some((script) => pattern.test(script));
}

function copyDedupeCheckWorkspace(tempRoot) {
  for (const file of ["package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml"]) {
    const absFile = join(ROOT, file);
    if (existsSync(absFile)) cpSync(absFile, join(tempRoot, file));
  }
  const patchesDir = join(ROOT, "patches");
  if (existsSync(patchesDir)) {
    cpSync(patchesDir, join(tempRoot, "patches"), { recursive: true });
  }

  for (const dir of ["apps", "packages"]) {
    const absDir = join(ROOT, dir);
    if (!existsSync(absDir)) continue;

    for (const entry of readdirSync(absDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;

      const packageJson = join(absDir, entry.name, "package.json");
      if (!existsSync(packageJson)) continue;

      const tempPackageDir = join(tempRoot, dir, entry.name);
      mkdirSync(tempPackageDir, { recursive: true });
      cpSync(packageJson, join(tempPackageDir, "package.json"));
    }
  }
}

function candidateCommandNames(packageDir, depName) {
  const names = new Set();
  names.add(depName);
  names.add(depName.split("/").at(-1));

  const packageJson = join(packageDir, "node_modules", ...depName.split("/"), "package.json");
  if (!existsSync(packageJson)) return names;

  try {
    const manifest = JSON.parse(
      readFileSync(packageJson, "utf8"),
    );
    if (typeof manifest.bin === "string") {
      names.add(manifest.name?.split("/").at(-1) ?? depName.split("/").at(-1));
    } else if (manifest.bin && typeof manifest.bin === "object") {
      for (const binName of Object.keys(manifest.bin)) names.add(binName);
    }
  } catch {
    // Missing or non-JSON package metadata should not make the audit noisy.
  }

  return names;
}

function readInstalledManifest(packageDir, depName) {
  const packageJson = join(packageDir, "node_modules", ...depName.split("/"), "package.json");
  if (!existsSync(packageJson)) return null;

  try {
    return JSON.parse(readFileSync(packageJson, "utf8"));
  } catch {
    return null;
  }
}

function satisfiesDirectPeerDependency({ depName, allDirectDepNames, packageDir }) {
  for (const consumerName of allDirectDepNames) {
    if (consumerName === depName) continue;

    const consumerManifest = readInstalledManifest(packageDir, consumerName);
    if (consumerManifest?.peerDependencies?.[depName]) return true;
  }

  return false;
}

async function dependencyIsUsed({ depName, allDirectDepNames, files, manifest, packageDir }) {
  if (depName.startsWith("@types/")) {
    return hasTsSurface(packageDir, files);
  }

  if (satisfiesDirectPeerDependency({ depName, allDirectDepNames, packageDir })) {
    return true;
  }

  for (const command of candidateCommandNames(packageDir, depName)) {
    if (command && scriptsUseCommand(manifest.scripts, command)) return true;
  }

  for (const file of files) {
    if (await fileContainsDependency(file, depName)) return true;
  }

  return false;
}

function runDedupeCheck() {
  const tempRoot = mkdtempSync(join(tmpdir(), "comtammatu-deps-audit-"));
  let result;
  try {
    copyDedupeCheckWorkspace(tempRoot);
    result = runPnpm([
      "dedupe",
      "--check",
      "--config.confirmModulesPurge=false",
    ], {
      cwd: tempRoot,
    });
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }

  if (result.status === 0) {
    process.stdout.write(result.stdout);
    return [];
  }

  return [
    "pnpm dedupe --check failed. Run `pnpm dedupe` and commit the lockfile changes.",
    result.stdout?.trim(),
    result.stderr?.trim(),
  ].filter(Boolean);
}

function auditLicenses() {
  const result = runPnpm(["licenses", "list", "--json"]);

  if (result.status !== 0) {
    return [
      "pnpm licenses list failed.",
      result.stdout?.trim(),
      result.stderr?.trim(),
    ].filter(Boolean);
  }

  try {
    const licenses = JSON.parse(result.stdout);
    const unresolved = Object.keys(licenses).filter((license) =>
      /^(unknown|unlicensed)$/i.test(license),
    );
    return unresolved.map(
      (license) =>
        `unresolved dependency license group ${license}: ${licenses[license]
          .map((entry) => `${entry.name}@${entry.versions.join(",")}`)
          .join(", ")}`,
    );
  } catch (error) {
    return [`Unable to parse dependency license report: ${error.message}`];
  }
}

async function auditDirectDependencies() {
  const packageJsonFiles = await collectPackageJsonFiles();
  const failures = [];

  for (const packageJsonPath of packageJsonFiles) {
    const packageDir = dirname(packageJsonPath);
    const manifest = await readJson(packageJsonPath);
    const deps = directDeps(manifest);
    const allDirectDepNames = Object.keys(deps);
    const files = await collectScanFiles(packageDir);

    for (const depName of Object.keys(deps).sort()) {
      const specifier = deps[depName];
      if (typeof specifier === "string" && specifier.startsWith("workspace:")) {
        // Workspace deps are checked by TypeScript path/import boundaries.
        continue;
      }

      const used = await dependencyIsUsed({
        depName,
        allDirectDepNames,
        files,
        manifest,
        packageDir,
      });
      if (!used) {
        failures.push(`${relative(ROOT, packageJsonPath)}: ${depName}`);
      }
    }
  }

  return failures;
}

async function main() {
  const failures = [
    ...(await auditRuntimeContract()),
    ...runDedupeCheck(),
    ...auditLicenses(),
    ...(await auditDirectDependencies()),
  ];

  if (failures.length > 0) {
    console.error("Dependency audit failed:\n");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exitCode = 1;
    return;
  }

  console.log(
    "Dependency audit: runtime contract aligned; no unused direct dependency, lockfile dedupe drift, or unresolved license.",
  );
}

await main();
