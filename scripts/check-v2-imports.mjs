import fs from "node:fs";
import path from "node:path";

function walkFiles(rootDir) {
  const entries = [];
  const stack = [rootDir];

  while (stack.length > 0) {
    const dir = stack.pop();
    if (!dir) continue;

    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;

      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile()) {
        entries.push(fullPath);
      }
    }
  }

  return entries;
}

function toPosix(filePath) {
  return filePath.split(path.sep).join("/");
}

const checks = [
  {
    description: "retired admin-patterns imports",
    rootDir: "apps/web/app",
    exclude: [/empty-state-panel\.tsx$/, /table-empty-state-row\.tsx$/],
    contentPattern: /@comtammatu\/ui\/components\/admin-patterns/,
  },
  {
    description: "retired inventory-patterns imports",
    rootDir: "apps/web/app",
    exclude: [],
    contentPattern: /@comtammatu\/ui\/components\/inventory-patterns/,
  },
  {
    description: "retired inventory helper imports in shipped routes",
    rootDir: "apps/web/app/(protected)/inventory",
    exclude: [/_components\//],
    contentPattern: /_components\/(section-card|empty-state-panel|action-icon-button)/,
  },
];

const failures = [];

for (const check of checks) {
  const files = walkFiles(check.rootDir);
  let found = false;

  for (const filePath of files) {
    const normalized = toPosix(filePath);
    if (check.exclude.some((pattern) => pattern.test(normalized))) continue;

    const content = fs.readFileSync(filePath, "utf8");
    if (check.contentPattern.test(content)) {
      found = true;
      break;
    }
  }

  if (found) {
    failures.push(check.description);
  }
}

if (failures.length > 0) {
  console.error(
    `V2 import check failed: ${failures.join(", ")}. Replace retired visible wrapper imports before shipping.`,
  );
  process.exit(1);
}

console.log("V2 import check: không phát hiện import retired wrapper bị cấm.");
