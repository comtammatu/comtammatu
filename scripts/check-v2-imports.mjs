import { execSync } from "node:child_process";

const checks = [
  {
    description: "legacy admin-patterns imports",
    command:
      "rg -n '@comtammatu/ui/components/admin-patterns' apps/web/app --glob '!apps/web/app/admin/components/empty-state-panel.tsx' --glob '!apps/web/app/admin/components/table-empty-state-row.tsx'",
  },
  {
    description: "legacy inventory-patterns imports",
    command:
      "rg -n '@comtammatu/ui/components/inventory-patterns' apps/web/app",
  },
  {
    description: "legacy sidebar imports in shipped routes",
    command:
      "rg -n '@comtammatu/ui/components/sidebar' apps/web/app --glob '!apps/web/app/inventory/_components/inventory-sidebar.tsx' --glob '!apps/web/app/inventory/_components/inventory-header.tsx'",
  },
  {
    description: "legacy inventory helper imports in shipped routes",
    command:
      "rg -n '_components/(section-card|empty-state-panel|action-icon-button)' apps/web/app/inventory --glob '!apps/web/app/inventory/_components/**'",
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
    failures.push(check.description);
  } catch (error) {
    if (typeof error?.status === "number" && error.status === 1) {
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
