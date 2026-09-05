import assert from "node:assert/strict";
import { test } from "node:test";
import {
  type AuthChangeEvent,
  type RealtimeChannel,
  type Session,
  type SupabaseClient,
} from "@supabase/supabase-js";
import {
  NotificationRuntime,
  parseNotificationRealtimeEvent,
} from "../app/_hooks/notification-runtime";

type AuthListener = (event: AuthChangeEvent, session: Session | null) => void;
type ChannelStatus = "SUBSCRIBED" | "TIMED_OUT" | "CLOSED" | "CHANNEL_ERROR";
type ChangeHandler = (payload: unknown) => void;

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
  private readonly handlers = new Map<string, ChangeHandler>();
  private status: ((status: ChannelStatus, error?: Error) => void) | null =
    null;

  constructor(name: string) {
    this.topic = `realtime:${name}`;
  }

  on(
    _type: string,
    filter: { table?: string },
    callback: ChangeHandler,
  ): this {
    if (typeof filter.table === "string") {
      this.handlers.set(filter.table, callback);
    }
    return this;
  }

  subscribe(callback: (status: ChannelStatus, error?: Error) => void): this {
    this.status = callback;
    callback("SUBSCRIBED");
    return this;
  }

  emit(
    table: string,
    eventType: "INSERT" | "UPDATE" | "DELETE",
    targetBranchId: number | null = null,
  ): void {
    this.handlers.get(table)?.({
      eventType,
      table,
      new: { target_branch_id: targetBranchId },
      old: {},
    });
  }

  reconnect(): void {
    this.status?.("SUBSCRIBED");
  }
}

class FakeNotificationClient {
  authListener: AuthListener | null = null;
  authListenerCount = 0;
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

test("notification runtime shares one channel and filters insert-only popups", async () => {
  const client = new FakeNotificationClient();
  const runtime = new NotificationRuntime(client.asSupabase());
  let badgeEvents = 0;
  let popupEvents = 0;

  const stopBadges = runtime.subscribe({
    onEvent: () => {
      badgeEvents += 1;
    },
  });
  const stopPopups = runtime.subscribe({
    filter: { insertOnly: true },
    onEvent: () => {
      popupEvents += 1;
    },
  });

  await flushAuth();
  assert.equal(client.authListenerCount, 1);
  assert.equal(client.channelCount, 1);
  assert.equal(client.channels[0]?.topic, "realtime:notifications-41");

  client.channels[0]?.emit("notifications", "INSERT", 73);
  assert.equal(badgeEvents, 1);
  assert.equal(popupEvents, 1);

  client.channels[0]?.emit("notification_reads", "INSERT");
  assert.equal(badgeEvents, 2);
  assert.equal(popupEvents, 1);

  client.channels[0]?.reconnect();
  assert.equal(badgeEvents, 3);
  assert.equal(popupEvents, 2);

  stopBadges();
  stopPopups();
  assert.equal(runtime.getMetricsSnapshot().activeChannelCount, 0);
});

test("parseNotificationRealtimeEvent reads target branch from new row", () => {
  const event = parseNotificationRealtimeEvent({
    eventType: "INSERT",
    table: "notifications",
    new: { target_branch_id: 73 },
    old: {},
  });
  assert.deepEqual(event, {
    eventType: "INSERT",
    table: "notifications",
    targetBranchId: 73,
  });
});
