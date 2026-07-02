import fs from "node:fs";
import path from "node:path";

const REPO_ROOT = process.cwd();
const STORAGE_PATTERN =
  /\b(?:window\.)?(?:localStorage|sessionStorage)\.(?:getItem|setItem|removeItem|clear)\b/g;

const ALLOWLIST = {
  "apps/web/app/components/pwa-toolbar.tsx": {
    count: 2,
    reason: "operational PWA install hint dismissal only",
  },
  "apps/web/lib/device-prefs.ts": {
    count: 2,
    reason: "device-local operational preferences (POS/KDS sound) only",
  },
};

function walkFiles(rootDir, extensions) {
  const absoluteRoot = path.join(REPO_ROOT, rootDir);
  if (!fs.existsSync(absoluteRoot)) return [];

  const files = [];
  const stack = [absoluteRoot];

  while (stack.length > 0) {
    const dir = stack.pop();
    if (!dir) continue;

    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (
        entry.name === "node_modules" ||
        entry.name === ".next" ||
        entry.name === "dist" ||
        entry.name === "dist-bundle"
      )
        continue;

      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (
        entry.isFile() &&
        extensions.some((extension) => entry.name.endsWith(extension))
      ) {
        files.push(fullPath);
      }
    }
  }

  return files;
}

function toPosix(filePath) {
  return path.relative(REPO_ROOT, filePath).split(path.sep).join("/");
}

function countMatches(content, pattern) {
  return [...content.matchAll(pattern)].length;
}

const roots = [
  { dir: "apps", extensions: [".ts", ".tsx", ".js", ".jsx", ".mjs"] },
  { dir: "packages", extensions: [".ts", ".tsx", ".js", ".jsx", ".mjs"] },
];

const seen = new Map();
for (const root of roots) {
  for (const filePath of walkFiles(root.dir, root.extensions)) {
    const normalized = toPosix(filePath);
    const content = fs.readFileSync(filePath, "utf8");
    const count = countMatches(content, STORAGE_PATTERN);
    if (count > 0) seen.set(normalized, count);
  }
}

const failures = [];

for (const [filePath, count] of seen) {
  const allowed = ALLOWLIST[filePath]?.count ?? 0;
  if (count !== allowed) {
    failures.push(
      `${filePath} has ${count} browser-storage access(es), allowed ${allowed}`,
    );
  }
}

for (const [filePath, config] of Object.entries(ALLOWLIST)) {
  if (!seen.has(filePath)) {
    failures.push(
      `${filePath} has 0 browser-storage accesses, allowlist expects ${config.count}`,
    );
  }
}

if (failures.length > 0) {
  console.error("Client storage check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  console.error(
    "Scope and workflow state must stay in URL/server state. Only documented preference/dismissal storage is allowlisted.",
  );
  process.exit(1);
}

const allowedSummary = Object.entries(ALLOWLIST)
  .map(([filePath, config]) => `${filePath} (${config.reason})`)
  .join(", ");

console.log(`Client storage check: allowlist matched ${allowedSummary}.`);
