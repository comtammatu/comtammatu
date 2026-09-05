"use client";

import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { extractClaimsFromAccessToken } from "@comtammatu/shared/auth";
import { createClient } from "@comtammatu/database/supabase/client";
import {
  evictRealtimeChannel,
  stopRealtimeAuthorizationRejoin,
} from "./use-realtime-channel";

export type NotificationRealtimeTable = "notifications" | "notification_reads";
export type NotificationRealtimeEventType = "INSERT" | "UPDATE" | "DELETE";

export interface NotificationRealtimeEvent {
  eventType: NotificationRealtimeEventType;
  table: NotificationRealtimeTable;
  targetBranchId: number | null;
}

export interface NotificationEventFilter {
  insertOnly?: boolean;
  tables?: readonly NotificationRealtimeTable[];
}

export interface NotificationMetricsSnapshot {
  activeChannelCount: number;
  activeSubscriberCount: number;
  authListenerActive: boolean;
  channelJoinCount: number;
  ignoredEventCount: number;
  matchedInvalidationCount: number;
  receivedEventCount: number;
  reconnectCount: number;
  tokenRefreshRejoinCount: number;
}

interface NotificationSubscriber {
  filter: NotificationEventFilter;
  onEvent: (event: NotificationRealtimeEvent | null) => void;
}

type NotificationClient = SupabaseClient;

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function notificationTable(
  value: unknown,
): NotificationRealtimeTable | null {
  if (value === "notifications" || value === "notification_reads") return value;
  return null;
}

function notificationEventType(
  value: unknown,
): NotificationRealtimeEventType | null {
  if (value === "INSERT" || value === "UPDATE" || value === "DELETE") {
    return value;
  }
  return null;
}

export function parseNotificationRealtimeEvent(
  payload: unknown,
): NotificationRealtimeEvent | null {
  const row = record(payload);
  if (!row) return null;
  const table = notificationTable(row.table);
  const eventType = notificationEventType(row.eventType);
  if (table === null || eventType === null) return null;

  const next = record(row.new);
  const prev = record(row.old);
  const source = next ?? prev;
  const target = source?.target_branch_id;

  return {
    eventType,
    table,
    targetBranchId: typeof target === "number" ? target : null,
  };
}

export function matchesNotificationFilter(
  event: NotificationRealtimeEvent,
  filter: NotificationEventFilter,
): boolean {
  if (
    filter.tables &&
    filter.tables.length > 0 &&
    !filter.tables.includes(event.table)
  ) {
    return false;
  }
  if (
    filter.insertOnly === true &&
    (event.table !== "notifications" || event.eventType !== "INSERT")
  ) {
    return false;
  }
  return true;
}

export function createNotificationChannel(
  supabase: NotificationClient,
  tenantId: number,
  onEvent: (event: NotificationRealtimeEvent | null) => void,
  token: string | null,
): RealtimeChannel | null {
  const claims = extractClaimsFromAccessToken(token);
  if (!claims || claims.tenant_id !== tenantId) return null;

  const topic = `realtime:notifications-${String(tenantId)}`;
  for (const existing of supabase.realtime.getChannels()) {
    if (existing.topic === topic) {
      evictRealtimeChannel(supabase, existing);
    }
  }

  const dispatchPayload = (payload: unknown) => {
    const event = parseNotificationRealtimeEvent(payload);
    if (event !== null) onEvent(event);
  };

  let initialSubscribe = true;
  const channel = supabase.channel(`notifications-${String(tenantId)}`);
  channel.on(
    "postgres_changes",
    {
      event: "*",
      schema: "public",
      table: "notifications",
      filter: `tenant_id=eq.${String(tenantId)}`,
    },
    dispatchPayload,
  );
  channel.on(
    "postgres_changes",
    {
      event: "*",
      schema: "public",
      table: "notification_reads",
    },
    dispatchPayload,
  );
  channel.subscribe((status, error) => {
    if (status === "CHANNEL_ERROR") {
      stopRealtimeAuthorizationRejoin(supabase, channel, error);
      return;
    }
    if (status !== "SUBSCRIBED") return;
    if (initialSubscribe) {
      initialSubscribe = false;
      return;
    }
    onEvent(null);
  });
  return channel;
}

export class NotificationRuntime {
  private authGeneration = 0;
  private authUnsubscribe: (() => void) | null = null;
  private currentToken: string | null = null;
  private channel: RealtimeChannel | null = null;
  private activeToken: string | null = null;
  private readonly subscribers = new Map<symbol, NotificationSubscriber>();
  private channelJoinCount = 0;
  private ignoredEventCount = 0;
  private matchedInvalidationCount = 0;
  private receivedEventCount = 0;
  private reconnectCount = 0;
  private tokenRefreshRejoinCount = 0;

  constructor(private readonly supabase: NotificationClient) {}

  getMetricsSnapshot(): NotificationMetricsSnapshot {
    return {
      activeChannelCount: this.channel === null ? 0 : 1,
      activeSubscriberCount: this.subscribers.size,
      authListenerActive: this.authUnsubscribe !== null,
      channelJoinCount: this.channelJoinCount,
      ignoredEventCount: this.ignoredEventCount,
      matchedInvalidationCount: this.matchedInvalidationCount,
      receivedEventCount: this.receivedEventCount,
      reconnectCount: this.reconnectCount,
      tokenRefreshRejoinCount: this.tokenRefreshRejoinCount,
    };
  }

  subscribe(args: {
    filter?: NotificationEventFilter;
    onEvent: (event: NotificationRealtimeEvent | null) => void;
  }): () => void {
    const subscriberId = Symbol("notification-subscriber");
    this.subscribers.set(subscriberId, {
      filter: args.filter ?? {},
      onEvent: args.onEvent,
    });

    this.startAuthLifecycle();
    this.ensureChannel();

    let active = true;
    return () => {
      if (!active) return;
      active = false;
      this.subscribers.delete(subscriberId);
      if (this.subscribers.size > 0) return;
      this.teardownChannel();
      this.stopAuthLifecycle();
    };
  }

  private dispatch(event: NotificationRealtimeEvent | null): void {
    if (event === null) this.reconnectCount += 1;
    else this.receivedEventCount += 1;
    let matched = 0;
    for (const subscriber of this.subscribers.values()) {
      if (event === null || matchesNotificationFilter(event, subscriber.filter)) {
        matched += 1;
        subscriber.onEvent(event);
      }
    }
    this.matchedInvalidationCount += matched;
    if (event !== null && matched === 0) this.ignoredEventCount += 1;
  }

  private ensureChannel(): void {
    const token = this.currentToken;
    if (token === null || this.activeToken === token) return;
    this.teardownChannel();
    const claims = extractClaimsFromAccessToken(token);
    if (!claims) return;
    this.activeToken = token;
    this.channel = createNotificationChannel(
      this.supabase,
      claims.tenant_id,
      (event) => this.dispatch(event),
      token,
    );
    if (this.channel !== null) this.channelJoinCount += 1;
  }

  private setToken(token: string | null): void {
    if (token === this.currentToken) {
      this.ensureChannel();
      return;
    }

    const previousToken = this.currentToken;
    this.currentToken = token;
    if (previousToken !== null && token !== null) {
      this.tokenRefreshRejoinCount += 1;
    }
    if (token !== null) void this.supabase.realtime.setAuth(token);
    this.teardownChannel();
    this.ensureChannel();
  }

  private startAuthLifecycle(): void {
    if (this.authUnsubscribe !== null) return;
    const generation = ++this.authGeneration;
    const { data } = this.supabase.auth.onAuthStateChange((event, session) => {
      if (generation !== this.authGeneration) return;
      if (event === "TOKEN_REFRESHED" || event === "SIGNED_IN") {
        this.setToken(session?.access_token ?? null);
      } else if (event === "SIGNED_OUT") {
        this.setToken(null);
      }
    });
    this.authUnsubscribe = () => data.subscription.unsubscribe();

    void this.supabase.auth.getSession().then(({ data: sessionData }) => {
      if (generation !== this.authGeneration) return;
      this.setToken(sessionData.session?.access_token ?? null);
    });
  }

  private stopAuthLifecycle(): void {
    this.authGeneration += 1;
    this.authUnsubscribe?.();
    this.authUnsubscribe = null;
    this.currentToken = null;
  }

  private teardownChannel(): void {
    this.activeToken = null;
    if (this.channel === null) return;
    const channel = this.channel;
    this.channel = null;
    evictRealtimeChannel(this.supabase, channel);
  }
}

let sharedNotificationRuntime: NotificationRuntime | null = null;

type NotificationMetricsGlobal = typeof globalThis & {
  __COMTAMMATU_NOTIFICATION_METRICS__?: {
    snapshot: () => NotificationMetricsSnapshot;
  };
};

const emptyNotificationMetrics = (): NotificationMetricsSnapshot => ({
  activeChannelCount: 0,
  activeSubscriberCount: 0,
  authListenerActive: false,
  channelJoinCount: 0,
  ignoredEventCount: 0,
  matchedInvalidationCount: 0,
  receivedEventCount: 0,
  reconnectCount: 0,
  tokenRefreshRejoinCount: 0,
});

function installNotificationMetricsRegistry(): void {
  const metricsGlobal = globalThis as NotificationMetricsGlobal;
  metricsGlobal.__COMTAMMATU_NOTIFICATION_METRICS__ = {
    snapshot: () =>
      sharedNotificationRuntime?.getMetricsSnapshot() ??
      emptyNotificationMetrics(),
  };
}

export function subscribeNotificationEvents(args: {
  filter?: NotificationEventFilter;
  onEvent: (event: NotificationRealtimeEvent | null) => void;
}): () => void {
  if (sharedNotificationRuntime === null) {
    sharedNotificationRuntime = new NotificationRuntime(createClient());
    installNotificationMetricsRegistry();
  }
  return sharedNotificationRuntime.subscribe(args);
}
