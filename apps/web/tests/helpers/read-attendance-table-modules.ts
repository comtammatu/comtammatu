import { readFileSync } from "node:fs";
import { join } from "node:path";

const ATTENDANCE_DIR = join(
  import.meta.dirname,
  "../../app/(protected)/hr/attendance",
);

const ATTENDANCE_MODULE_FILES = [
  "attendance-types.ts",
  "attendance-table.tsx",
  "attendance-calendar-host.tsx",
  "attendance-detail-view.tsx",
  "attendance-list-chrome.tsx",
] as const;

/** Concatenated attendance table modules for static contract tests. */
export function readAttendanceTableModules(cwd = process.cwd()): string {
  const base = cwd.endsWith("apps/web")
    ? join(cwd, "app/(protected)/hr/attendance")
    : ATTENDANCE_DIR;
  return ATTENDANCE_MODULE_FILES.map((file) =>
    readFileSync(join(base, file), "utf8"),
  ).join("\n");
}

export const ATTENDANCE_TABLE_SHELL_PATH =
  "apps/web/app/(protected)/hr/attendance/attendance-table.tsx";

export const ATTENDANCE_MODULE_PATHS = ATTENDANCE_MODULE_FILES.map(
  (file) => `apps/web/app/(protected)/hr/attendance/${file}`,
);
