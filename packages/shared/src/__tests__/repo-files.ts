import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "../../../..");

export function readRepoFile(path: string): string {
  return readFileSync(resolve(repoRoot, path), "utf8");
}

export function readMigrationFile(pathOrName: string): string {
  const fileName = basename(pathOrName);
  const activeMigrationPath = resolve(repoRoot, "supabase/migrations", fileName);

  if (existsSync(activeMigrationPath)) {
    return readFileSync(activeMigrationPath, "utf8");
  }

  const migrationsDir = resolve(repoRoot, "supabase/migrations");
  const forwardMigrations = readdirSync(migrationsDir)
    .filter((entry) => entry.endsWith(".sql"))
    .sort()
    .map((entry) => readFileSync(resolve(migrationsDir, entry), "utf8"));

  return [
    ...forwardMigrations,
    readFileSync(
      resolve(repoRoot, "supabase/managed-surfaces.install.sql"),
      "utf8",
    ),
  ].join("\n");
}
