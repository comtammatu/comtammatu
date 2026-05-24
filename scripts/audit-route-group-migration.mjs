#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";

function run(args) {
  return execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function runOptional(args) {
  try {
    return run(args);
  } catch {
    return "";
  }
}

function statusEntries() {
  const output = run(["status", "--porcelain=v1", "-uall"]);
  return output ? output.split("\n").filter(Boolean) : [];
}

function oldBlob(path) {
  try {
    return execFileSync("git", ["show", `HEAD:${path}`], {
      encoding: null,
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return null;
  }
}

function sha(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function counterpartCandidates(oldPath) {
  const prefix = "apps/web/app/";
  if (!oldPath.startsWith(prefix)) return [];

  const rest = oldPath.slice(prefix.length);
  const candidates = [];
  if (rest.startsWith("(auth)/")) {
    candidates.push(`${prefix}(public)/${rest}`);
  }
  candidates.push(`${prefix}(protected)/${rest}`);
  candidates.push(`${prefix}(public)/${rest}`);
  return candidates;
}

function nameStatusEntries(args) {
  const output = runOptional(args);
  return output ? output.split("\n").filter(Boolean) : [];
}

function stagedRouteMoves() {
  return nameStatusEntries(["diff", "--cached", "--name-status", "-M"]).filter(
    (line) => {
      const [status, from, to] = line.split("\t");
      return (
        status?.startsWith("R") &&
        from?.startsWith("apps/web/app/") &&
        to?.startsWith("apps/web/app/")
      );
    },
  );
}

function routeFamily(path) {
  if (path.startsWith("apps/web/app/(protected)/admin/")) return "admin";
  if (path.startsWith("apps/web/app/(protected)/br/")) return "branch";
  if (path.startsWith("apps/web/app/(protected)/employee/")) return "employee";
  if (path.startsWith("apps/web/app/(protected)/finance/")) return "finance";
  if (path.startsWith("apps/web/app/(protected)/hr/")) return "hr";
  if (path.startsWith("apps/web/app/(protected)/inventory/")) return "inventory";
  if (path.startsWith("apps/web/app/(protected)/menu/")) return "menu";
  if (path.startsWith("apps/web/app/(protected)/orders/")) return "orders";
  if (path.startsWith("apps/web/app/(public)/")) return "public";
  if (path.startsWith("apps/web/app/components/")) return "components";
  return "other";
}

const entries = statusEntries();
const stagedMoves = stagedRouteMoves();
const stagedByteIdenticalMoves = stagedMoves.filter((line) =>
  line.startsWith("R100\t"),
);
const deleted = entries.filter((line) => line.startsWith(" D ")).map((line) => line.slice(3));
const untracked = entries.filter((line) => line.startsWith("?? ")).map((line) => line.slice(3));
const untrackedRouteFiles = untracked.filter((path) =>
  path.startsWith("apps/web/app/"),
);

const buckets = {
  deleted: deleted.length,
  untracked: untracked.length,
  routeCounterparts: 0,
  byteIdenticalCounterparts: [],
  changedCounterparts: [],
  noCounterpartDeletes: [],
};

for (const deletedPath of deleted) {
  const candidates = counterpartCandidates(deletedPath).filter((path) => existsSync(path));
  if (candidates.length === 0) {
    buckets.noCounterpartDeletes.push(deletedPath);
    continue;
  }

  buckets.routeCounterparts += 1;
  const old = oldBlob(deletedPath);
  const match = old
    ? candidates.find((candidate) => sha(old) === sha(readFileSync(candidate)))
    : null;

  if (match) {
    buckets.byteIdenticalCounterparts.push({ from: deletedPath, to: match });
  } else {
    buckets.changedCounterparts.push({
      from: deletedPath,
      to: candidates[0],
      routeFamily: routeFamily(candidates[0]),
    });
  }
}

const changedByRouteFamily = buckets.changedCounterparts.reduce((acc, entry) => {
  acc[entry.routeFamily] = (acc[entry.routeFamily] ?? 0) + 1;
  return acc;
}, {});

console.log(
  JSON.stringify(
    {
      summary: {
        stagedRouteMoves: stagedMoves.length,
        stagedByteIdenticalRouteMoves: stagedByteIdenticalMoves.length,
        stagedChangedRouteMoves:
          stagedMoves.length - stagedByteIdenticalMoves.length,
        deleted: buckets.deleted,
        untracked: buckets.untracked,
        untrackedRouteFiles: untrackedRouteFiles.length,
        routeCounterparts: buckets.routeCounterparts,
        byteIdenticalCounterparts: buckets.byteIdenticalCounterparts.length,
        changedCounterparts: buckets.changedCounterparts.length,
        noCounterpartDeletes: buckets.noCounterpartDeletes.length,
      },
      changedByRouteFamily,
      noCounterpartDeletes: buckets.noCounterpartDeletes,
      byteIdenticalCounterparts: buckets.byteIdenticalCounterparts,
      changedCounterparts: buckets.changedCounterparts,
    },
    null,
    2,
  ),
);
