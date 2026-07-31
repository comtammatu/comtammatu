#!/usr/bin/env node

import { readdir, rename } from "node:fs/promises";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const [name] = process.argv.slice(2);
const migrationsDir = "supabase/migrations";

if (!name || !/^[a-z][a-z0-9_]*$/.test(name)) {
  throw new Error("Usage: node scripts/supabase-migration-new.mjs <lower_snake_case_name>");
}

function vietnamTimestamp() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts();
  const value = Object.fromEntries(parts.map(({ type, value: part }) => [type, part]));
  return `${value.year}${value.month}${value.day}${value.hour}${value.minute}${value.second}`;
}

const before = new Set(await readdir(migrationsDir));
const result = spawnSync("corepack", ["pnpm", "exec", "supabase", "migration", "new", name], {
  cwd: process.cwd(),
  stdio: "inherit",
});
if (result.status !== 0) process.exit(result.status ?? 1);

const created = (await readdir(migrationsDir)).filter((file) => !before.has(file));
if (created.length !== 1 || !/^\d{14}_[a-z0-9_]+\.sql$/.test(created[0] ?? "")) {
  throw new Error("Supabase CLI did not create exactly one migration file");
}

const timestamp = vietnamTimestamp();
const latest = [...before]
  .map((file) => /^(\d{14})_/.exec(file)?.[1])
  .filter((version) => version !== undefined)
  .sort()
  .at(-1);
if (latest !== undefined && timestamp <= latest) {
  throw new Error(`UTC+7 timestamp ${timestamp} must be later than existing ${latest}`);
}

const source = created[0];
if (source === undefined) throw new Error("Migration file was not created");
const target = `${timestamp}_${name}.sql`;
if (before.has(target)) throw new Error(`Migration timestamp collision: ${target}`);
await rename(join(migrationsDir, source), join(migrationsDir, target));
console.log(`Migration timestamp normalized to UTC+7: ${join(migrationsDir, target)}`);
