import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveControlSurfaceDiscoveryGroups,
  resolveDiscoveredApps,
} from "../app-discovery";
import { resolveControlSurfaceNavGroups } from "../nav-resolution";
import type { ModuleKey } from "../module-acl";

test("office self_service nav advertises Hôm nay and Công việc, not tenant modules", () => {
  const groups = resolveControlSurfaceDiscoveryGroups("self_service");
  const items = groups.flatMap((group) => group.items);
  const keys = items.map((item) => item.moduleKey);
  const hrefs = items.map((item) => item.href);

  assert.deepEqual(keys, ["owner", "work"]);
  assert.deepEqual(hrefs, ["/", "/work"]);

  const home = items.find((item) => item.moduleKey === "owner");
  assert.equal(home?.label, "Hôm nay");

  const work = items.find((item) => item.moduleKey === "work");
  assert.equal(work?.label, "Công việc");

  const hidden = [
    "finance",
    "inventory",
    "hr",
    "settings",
    "menu",
    "orders",
  ] as const satisfies readonly ModuleKey[];
  for (const key of hidden) {
    assert.equal(keys.includes(key), false, `${key} must stay off office nav`);
  }
});

test("office self_service primary tabs match discovery and keep personal /me off the module rail", () => {
  const navKeys = resolveControlSurfaceNavGroups("self_service").flatMap(
    (group) => group.items.map((item) => item.moduleKey),
  );
  assert.deepEqual(navKeys, ["owner", "work"]);

  assert.deepEqual(
    resolveDiscoveredApps("self_service").map((app) => app.moduleKey),
    ["owner", "work", "me"],
  );
});
