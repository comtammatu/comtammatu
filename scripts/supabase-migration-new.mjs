#!/usr/bin/env node

import { readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const [name] = process.argv.slice(2);
const migrationsDir = "supabase/migrations";

if (!name || !/^[a-z][a-z0-9_]*$/.test(name)) {
  console.error("Usage: node scripts/supabase-migration-new.mjs <lower_snake_case_name>");
  process.exit(1);
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
const timestamp = vietnamTimestamp();
const latest = [...before]
  .map((file) => /^(\d{14})_/.exec(file)?.[1])
  .filter((version) => version !== undefined)
  .sort()
  .at(-1);
if (latest !== undefined && timestamp <= latest) {
  throw new Error(`UTC+7 timestamp ${timestamp} must be later than existing ${latest}`);
}

const target = `${timestamp}_${name}.sql`;
if (before.has(target)) {
  throw new Error(`Migration timestamp collision: ${target}`);
}

const targetPath = join(migrationsDir, target);
await writeFile(targetPath, `-- Migration: ${name}\n\n`, "utf8");
console.log(`Created migration: ${targetPath}`);

