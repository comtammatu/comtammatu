import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createClient,
  type AuthChangeEvent,
  type RealtimeChannel,
  type Session,
  type SupabaseClient,
} from "@supabase/supabase-js";
import {
  BranchOpsRuntime,
  parseBranchOpsEvent,
} from "../app/_hooks/branch-ops-runtime";
import { evictRealtimeChannel } from "../app/_hooks/use-realtime-channel";

type AuthListener = (event: AuthChangeEvent, session: Session | null) => void;
type ChannelStatus = "SUBSCRIBED" | "TIMED_OUT" | "CLOSED" | "CHANNEL_ERROR";

function accessToken(appMetadata: Record<string, unknown>): string {
  const payload = Buffer.from(
    JSON.stringify({ app_metadata: appMetadata }),
  ).toString("base64url");
  return `header.${payload}.signature`;
}

const ownerToken = accessToken({
  branch_id: null,
  position_code: "owner",
  tenant_id: 41,
  user_role: "owner",
});

class FakeChannel {
  readonly topic: string;
  private broadcast: ((payload: unknown) => void) | null = null;
  private status: ((status: ChannelStatus, error?: Error) => void) | null =
    null;

  constructor(name: string) {
    this.topic = `realtime:${name}`;
  }

  on(
    _type: string,
    _filter: Record<string, unknown>,
    callback: (payload: unknown) => void,
  ): this {
    this.broadcast = callback;
    return this;
  }

  subscribe(callback: (status: ChannelStatus, error?: Error) => void): this {
    this.status = callback;
    callback("SUBSCRIBED");
    return this;
  }

  emit(table: string, domain = "inventory"): void {
    this.broadcast?.({ payload: { domain, table } });
  }

  reconnect(): void {
    this.status?.("SUBSCRIBED");
  }
}

class FakeBranchOpsClient {
  authListener: AuthListener | null = null;
  authListenerCount = 0;
  authUnsubscribeCount = 0;
  channelCount = 0;
  channels: FakeChannel[] = [];
  removeCount = 0;
  setAuthCount = 0;

  constructor(private readonly initialToken: string | null = ownerToken) {}

  readonly auth = {
    getSession: async () => ({
      data: {
        session:
          this.initialToken === null
            ? null
            : ({ access_token: this.initialToken } as Session),
      },
      error: null,
    }),
    onAuthStateChange: (listener: AuthListener) => {
      this.authListener = listener;
      this.authListenerCount += 1;
      return {
        data: {
          subscription: {
            unsubscribe: () => {
              this.authUnsubscribeCount += 1;
              this.authListener = null;
            },
          },
        },
      };
    },
  };

  readonly realtime = {
    _remove: (candidate: RealtimeChannel) => {
      this.channels = this.channels.filter(
        (channel) => channel !== (candidate as unknown as FakeChannel),
      );
    },
    getChannels: () => this.channels as unknown as RealtimeChannel[],
    setAuth: async (_token: string) => {
      this.setAuthCount += 1;
    },
  };

  channel(name: string): RealtimeChannel {
    const channel = new FakeChannel(name);
    this.channelCount += 1;
    this.channels.push(channel);
    return channel as unknown as RealtimeChannel;
  }

  async removeChannel(_channel: RealtimeChannel): Promise<"ok"> {
    this.removeCount += 1;
    return "ok";
  }

  asSupabase(): SupabaseClient {
    return this as unknown as SupabaseClient;
  }
}

async function flushAuth(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

test("branch ops runtime shares one channel and filters table invalidations", async () => {
  const client = new FakeBranchOpsClient();
  const runtime = new BranchOpsRuntime(client.asSupabase());
  let inventoryInvalidations = 0;
  let peopleInvalidations = 0;

  const stopInventory = runtime.subscribe({
    branchId: 73,
    filter: { tables: ["stock_levels"] },
    onInvalidate: () => {
      inventoryInvalidations += 1;
    },
  });
  const stopPeople = runtime.subscribe({
    branchId: 73,
    filter: { tables: ["attendance_records"] },
    onInvalidate: () => {
      peopleInvalidations += 1;
    },
  });

  await flushAuth();
  assert.equal(client.authListenerCount, 1);
  assert.equal(client.channelCount, 1);
  assert.equal(client.channels.length, 1);

  client.channels[0]?.emit("stock_levels");
  assert.equal(inventoryInvalidations, 1);
  assert.equal(peopleInvalidations, 0);

  client.channels[0]?.emit("attendance_records");
  assert.equal(inventoryInvalidations, 1);
  assert.equal(peopleInvalidations, 1);
  client.channels[0]?.emit("self_order_requests", "self_order");
  assert.deepEqual(runtime.getMetricsSnapshot(), {
    activeChannelCount: 1,
    activeSubscriberCount: 2,
    authListenerActive: true,
    channelJoinCount: 1,
    ignoredEventCount: 1,
    matchedInvalidationCount: 2,
    receivedEventCount: 3,
    reconnectCount: 0,
    tokenRefreshRejoinCount: 0,
  });

  stopInventory();
  assert.equal(client.channels.length, 1);
  stopPeople();
  assert.equal(client.channels.length, 0);
  assert.equal(client.authUnsubscribeCount, 1);
});

test("branch ops runtime rejoins once on token refresh and catches up on reconnect", async () => {
  const client = new FakeBranchOpsClient();
  const runtime = new BranchOpsRuntime(client.asSupabase());
  let invalidations = 0;
  const stop = runtime.subscribe({
    branchId: 73,
    onInvalidate: () => {
      invalidations += 1;
    },
  });
  await flushAuth();

  const refreshedToken = accessToken({
    branch_id: null,
    position_code: "owner",
    tenant_id: 41,
    user_role: "owner",
    version: 2,
  });
  client.authListener?.("TOKEN_REFRESHED", {
    access_token: refreshedToken,
  } as Session);

  assert.equal(client.channelCount, 2);
  assert.equal(client.channels.length, 1);
  assert.equal(client.setAuthCount, 2);
  assert.equal(invalidations, 0);

  client.channels[0]?.reconnect();
  assert.equal(invalidations, 1);
  assert.equal(runtime.getMetricsSnapshot().reconnectCount, 1);
  assert.equal(runtime.getMetricsSnapshot().tokenRefreshRejoinCount, 1);
  stop();
});

test("branch ops parser rejects malformed envelopes", () => {
  assert.equal(parseBranchOpsEvent(null), null);
  assert.equal(parseBranchOpsEvent({ payload: { domain: "inventory" } }), null);
  assert.deepEqual(
    parseBranchOpsEvent({
      payload: {
        at: "2026-08-30T00:00:00Z",
        domain: "people",
        id: 901,
        op: "UPDATE",
        table: "attendance_records",
      },
    }),
    {
      at: "2026-08-30T00:00:00Z",
      domain: "people",
      id: 901,
      op: "UPDATE",
      table: "attendance_records",
    },
  );
});

test("branch ops runtime fails closed for a foreign branch scope", async () => {
  const branchManagerToken = accessToken({
    branch_id: 73,
    position_code: "branch_manager",
    tenant_id: 41,
    user_role: "branch_manager",
  });
  const client = new FakeBranchOpsClient(branchManagerToken);
  const runtime = new BranchOpsRuntime(client.asSupabase());
  const stop = runtime.subscribe({ branchId: 91, onInvalidate: () => {} });

  await flushAuth();
  assert.equal(client.channelCount, 0);
  assert.equal(runtime.getMetricsSnapshot().activeChannelCount, 0);
  stop();
});

test("branch ops runtime evicts a stale same-topic channel before route rejoin", async () => {
  const client = new FakeBranchOpsClient();
  client.channel("branch:73:ops");
  const runtime = new BranchOpsRuntime(client.asSupabase());
  const stop = runtime.subscribe({ branchId: 73, onInvalidate: () => {} });

  await flushAuth();
  assert.equal(client.channelCount, 2);
  assert.equal(client.channels.length, 1);
  assert.equal(client.removeCount, 1);
  stop();
});

test("evictRealtimeChannel invokes both removeChannel and synchronous _remove on Supabase client", () => {
  let removeChannelCalled = false;
  let removeInternalCalled = false;
  const mockChannel = { topic: "realtime:branch:73:ops" } as unknown as RealtimeChannel;
  const mockClient = {
    removeChannel: (_channel: RealtimeChannel) => {
      removeChannelCalled = true;
      return Promise.resolve("ok" as const);
    },
    realtime: {
      _remove: (_channel: RealtimeChannel) => {
        removeInternalCalled = true;
      },
    },
  };

  evictRealtimeChannel(
    mockClient as unknown as Parameters<typeof evictRealtimeChannel>[0],
    mockChannel,
  );
  assert.equal(removeChannelCalled, true);
  assert.equal(removeInternalCalled, true);
});

test("pinned supabase-js 2.112.4 evictRealtimeChannel purges socket channels synchronously", () => {
  const supabase = createClient(
    "https://example.supabase.co",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.signature",
  );
  const ch1 = supabase.channel("branch:73:ops");
  assert.equal(supabase.getChannels().length, 1);
  assert.equal(supabase.getChannels()[0]?.topic, "realtime:branch:73:ops");

  evictRealtimeChannel(supabase, ch1);
  assert.equal(supabase.getChannels().length, 0);

  // A new channel on the same topic builds fresh
  const ch2 = supabase.channel("branch:73:ops");
  assert.notEqual(ch1, ch2);
  assert.equal(supabase.getChannels().length, 1);
  assert.equal(supabase.getChannels()[0]?.topic, "realtime:branch:73:ops");

  evictRealtimeChannel(supabase, ch2);
  assert.equal(supabase.getChannels().length, 0);
});

