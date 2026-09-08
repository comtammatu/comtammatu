import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { test } from "node:test";

const source = (name: string) =>
  readFileSync(
    new URL(
      `../../../tools/shopeefood-pos-relay-extension/${name}`,
      import.meta.url,
    ),
    "utf8",
  );
const KEY = "shopeeRelayQueueV2";
const order = (id = "order-91") => ({
  orderId: id,
  displayId: id,
  items: [{ name: "Sườn Cốt Lết", quantity: 2, price: 54000 }],
});
type Row = {
  key: string;
  attempts: number;
  order: ReturnType<typeof order>;
  target: { branchId: number };
  lastError?: string;
};
type Ledger = { pending: Row[]; sent: Array<{ key: string }> };
type Listener = (
  message: { type: string; order: unknown },
  sender: { id: string; url: string },
  respond: (result: { success: boolean; status?: string }) => void,
) => void;
type Reply = { ok: boolean; status: number; json: () => Promise<unknown> };
const ok = (): Reply => ({
  ok: true,
  status: 200,
  json: async () => ({ success: true, order_id: 941, order_number: "GH-91" }),
});

function harness(
  values: Record<string, unknown> = {
    backendUrl: "https://pos.example",
    branchId: 73,
    relaySecret: "fixture-secret",
  },
) {
  let now = Date.now();
  let listener: Listener | undefined;
  let alarm: ((value: { name: string }) => void) | undefined;
  const calls: Array<{
    url: string;
    body: { branch_id: number; platform: string };
    secret: string;
  }> = [];
  let transport: () => Promise<Reply> = async () => ok();
  const context = createContext({
    console,
    URL,
    AbortSignal,
    Date: class extends Date {
      static now() {
        return now;
      }
    },
    fetch: async (
      url: string,
      init: { body: string; headers: Record<string, string>; redirect: string },
    ) => {
      assert.equal(init.redirect, "error");
      calls.push({
        url,
        body: JSON.parse(init.body),
        secret: init.headers["x-shopee-relay-secret"] ?? "",
      });
      return transport();
    },
    chrome: {
      runtime: {
        id: "fixture-extension",
        onMessage: {
          addListener: (value: Listener) => {
            listener = value;
          },
        },
        onInstalled: { addListener() {} },
        onStartup: { addListener() {} },
      },
      alarms: {
        create() {},
        onAlarm: {
          addListener: (value: typeof alarm) => {
            alarm = value;
          },
        },
      },
      tabs: {
        query: async () => [],
        create: async () => {},
        reload: async () => {},
      },
      storage: {
        local: {
          get: async (keys: string | string[]) =>
            structuredClone(
              Object.fromEntries(
                (Array.isArray(keys) ? keys : [keys]).map((key) => [
                  key,
                  values[key],
                ]),
              ),
            ),
          set: async (changes: Record<string, unknown>) => {
            Object.assign(values, structuredClone(changes));
          },
        },
        onChanged: { addListener() {} },
      },
    },
  });
  context.importScripts = (name: string) => runInContext(source(name), context);
  runInContext(source("background.js"), context);
  return {
    calls,
    values,
    ledger: () => values[KEY] as Ledger,
    transport: (value: typeof transport) => {
      transport = value;
    },
    advance() {
      now += 6 * 60 * 1000;
    },
    retry() {
      alarm?.({ name: "shopee-relay-retry" });
    },
    accept(value: unknown = order(), url = "https://partner.shopee.vn/orders") {
      return new Promise<{ success: boolean; status?: string }>((resolve) =>
        listener?.(
          { type: "SHOPEE_RELAY_ORDER", order: value },
          { id: "fixture-extension", url },
          resolve,
        ),
      );
    },
  };
}

async function settle() {
  for (let index = 0; index < 12; index += 1)
    await new Promise<void>((resolve) => setImmediate(resolve));
}

test("Shopee queue persists before POST and keeps a network failure for a later alarm", async () => {
  const h = harness();
  h.transport(async () => {
    assert.equal(h.ledger().pending.length, 1);
    throw new Error("offline");
  });
  assert.equal((await h.accept()).status, "queued");
  await settle();
  assert.equal(h.ledger().pending[0]?.attempts, 1);
  assert.equal(h.ledger().sent.length, 0);
  h.transport(async () => ok());
  h.advance();
  h.retry();
  await settle();
  assert.equal(h.ledger().pending.length, 0);
  assert.equal(h.ledger().sent.length, 1);
  assert.equal(h.calls[1]?.body.branch_id, 73);
  assert.equal(h.calls[1]?.body.platform, "shopee");
});

test("Shopee queue deduplicates concurrent tabs and confirmed captures", async () => {
  const h = harness();
  await Promise.all([h.accept(), h.accept(), h.accept(order("order-92"))]);
  await settle();
  assert.equal(h.calls.length, 2);
  assert.equal(h.ledger().sent.length, 2);
  assert.equal((await h.accept()).status, "sent");
  await settle();
  assert.equal(h.calls.length, 2);
});

test("Shopee queue distinguishes full order identities sharing a short display reference", async () => {
  const h = harness();
  await h.accept({ ...order("full-91"), displayId: "0091" });
  await h.accept({ ...order("full-92"), displayId: "0091" });
  await settle();
  assert.equal(h.calls.length, 2);
  assert.equal(h.ledger().sent.length, 2);
});

test("Shopee queue requires an explicit positive safe branch and a trusted merchant sender", async () => {
  for (const branchId of [undefined, 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    const h = harness({ backendUrl: "https://pos.example", branchId });
    assert.equal((await h.accept()).success, false);
    assert.equal(h.calls.length, 0);
  }
  const h = harness();
  assert.equal(
    (
      await h.accept(
        order(),
        "https://partner.shopee.vn.attacker.example/orders",
      )
    ).success,
    false,
  );
  assert.equal(
    (await h.accept({ orderId: "undefined", items: order().items })).success,
    false,
  );
  assert.equal(h.calls.length, 0);
});

test("Shopee queue resumes after worker restart without moving a pending order to another branch or backend", async () => {
  const h = harness();
  h.transport(async () => {
    throw new Error("offline");
  });
  await h.accept();
  await settle();
  const persisted = structuredClone(h.values);
  persisted.branchId = 89;
  const restarted = harness(persisted);
  restarted.advance();
  restarted.retry();
  await settle();
  assert.equal(restarted.calls.length, 0);
  assert.equal(restarted.ledger().pending[0]?.target.branchId, 73);
  persisted.branchId = 73;
  persisted.backendUrl = "https://other-pos.example";
  restarted.retry();
  await settle();
  assert.equal(restarted.calls.length, 0);
  persisted.backendUrl = "https://pos.example";
  persisted.relaySecret = "rotated-fixture-secret";
  restarted.retry();
  await settle();
  assert.equal(restarted.calls.length, 1);
  assert.equal(restarted.calls[0]?.secret, "rotated-fixture-secret");
  assert.equal(restarted.ledger().pending.length, 0);
});

test("Shopee queue does not acknowledge HTTP 200 errors, malformed bodies, missing order IDs, or auth failures", async () => {
  const replies: Reply[] = [
    { ok: true, status: 200, json: async () => ({ success: false }) },
    { ok: true, status: 200, json: async () => ({ success: true }) },
    {
      ok: true,
      status: 200,
      json: async () => {
        throw new Error("HTML");
      },
    },
    {
      ok: false,
      status: 401,
      json: async () => ({ error: "sensitive server internals" }),
    },
    {
      ok: false,
      status: 422,
      json: async () => ({ error: "sensitive server internals" }),
    },
  ];
  for (const reply of replies) {
    const h = harness();
    h.transport(async () => reply);
    await h.accept();
    await settle();
    assert.equal(h.ledger().pending.length, 1);
    assert.equal(h.ledger().sent.length, 0);
    assert.ok(!h.ledger().pending[0]?.lastError?.includes("sensitive"));
  }
});

test("Shopee queue rejects insecure remote destinations and credential-bearing URLs", async () => {
  for (const backendUrl of [
    "http://pos.example",
    "https://user:password@pos.example",
    "file:///tmp/pos",
    "invalid",
  ]) {
    const h = harness({ backendUrl, branchId: 73 });
    assert.equal((await h.accept()).success, false);
    assert.equal(h.calls.length, 0);
  }
});

test("Shopee queue rejects overflow without evicting pending orders or persisting secrets", async () => {
  const h = harness();
  h.transport(async () => {
    throw new Error("offline");
  });
  for (let index = 0; index < 300; index += 1) {
    assert.equal((await h.accept(order(`order-${index}`))).success, true);
  }
  await settle();
  assert.equal((await h.accept(order("overflow"))).success, false);
  assert.equal(h.ledger().pending.length, 300);
  assert.equal(h.ledger().pending[0]?.order.orderId, "order-0");
  assert.ok(!JSON.stringify(h.ledger()).includes("fixture-secret"));
});
