#!/usr/bin/env node
// Clear Next.js + turbo cache for apps/web. Workaround for Next.js 16.2
// webpack + serwist intermittent post-compile manifest desync (lesson #12
// in `tasks/lessons.md`). Use after `pnpm db:types` mid-session if a
// `pnpm build` fails with `TypeError: Cannot read properties of undefined
// (reading 'length') at ignore-listed frames`.

import { rmSync } from "node:fs";

const targets = ["apps/web/.next", "apps/web/.turbo"];

for (const path of targets) {
  rmSync(path, { recursive: true, force: true });
  process.stdout.write(`✓ removed ${path}\n`);
}
