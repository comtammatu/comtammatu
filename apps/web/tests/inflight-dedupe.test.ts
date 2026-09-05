import assert from "node:assert/strict";
import { test } from "node:test";
import {
  dedupeInflight,
  resetInflightDedupe,
} from "../app/_utils/inflight-dedupe";

test("dedupeInflight shares one promise until it settles", async () => {
  resetInflightDedupe();
  let runs = 0;
  let release!: (value: string) => void;
  const pending = new Promise<string>((resolve) => {
    release = resolve;
  });

  const first = dedupeInflight("menu", async () => {
    runs += 1;
    return pending;
  });
  const second = dedupeInflight("menu", async () => {
    runs += 1;
    return "other";
  });

  release("ok");
  assert.equal(await first, "ok");
  assert.equal(await second, "ok");
  assert.equal(runs, 1);

  const third = await dedupeInflight("menu", async () => {
    runs += 1;
    return "fresh";
  });
  assert.equal(third, "fresh");
  assert.equal(runs, 2);
});

test("dedupeInflight isolates distinct keys", async () => {
  resetInflightDedupe();
  const [left, right] = await Promise.all([
    dedupeInflight("a", async () => "A"),
    dedupeInflight("b", async () => "B"),
  ]);
  assert.equal(left, "A");
  assert.equal(right, "B");
});
