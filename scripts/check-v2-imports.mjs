import { execSync } from "node:child_process";

/**
 * Use grep (universally available in CI) instead of rg.
 * rg is faster locally but not installed on GitHub Actions runners.
 */
const checks = [
  {
    description: "legacy admin-patterns imports",
    command:
      "grep -rn '@comtammatu/ui/components/admin-patterns' apps/web/app --exclude='empty-state-panel.tsx' --exclude='table-empty-state-row.tsx'",
  },
  {
    description: "legacy inventory-patterns imports",
    command:
      "grep -rn '@comtammatu/ui/components/inventory-patterns' apps/web/app",
  },
  // sidebar is now the proper shadcn component — no longer legacy
  // {
  //   description: "legacy sidebar imports in shipped routes",
  //   command:
  //     "grep -rn '@comtammatu/ui/components/sidebar' apps/web/app --exclude='inventory-sidebar.tsx' --exclude='inventory-header.tsx'",
  // },
  {
    description: "legacy inventory helper imports in shipped routes",
    command:
      "grep -rn -E '_components/(section-card|empty-state-panel|action-icon-button)' apps/web/app/inventory --exclude-dir='_components'",
  },
];

const failures = [];

for (const check of checks) {
  try {
    execSync(check.command, {
      stdio: "pipe",
      cwd: process.cwd(),
      encoding: "utf8",
    });
    // grep exit 0 = matches found = legacy import detected = failure
    failures.push(check.description);
  } catch (error) {
    if (typeof error?.status === "number" && error.status === 1) {
      // grep exit 1 = no matches found = OK
      continue;
    }

    throw error;
  }
}

if (failures.length > 0) {
  console.error(
    `V2 import check failed: ${failures.join(", ")}. Replace legacy visible wrapper imports before shipping.`,
  );
  process.exit(1);
}

console.log("V2 import check: không phát hiện import legacy bị cấm.");
