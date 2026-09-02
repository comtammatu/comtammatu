"use client";

import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import {
  canSubscribeBranchOpsTopic,
  extractClaimsFromAccessToken,
} from "@comtammatu/shared/auth";
import { createClient } from "@comtammatu/database/supabase/client";
import {
  evictRealtimeChannel,
  stopRealtimeAuthorizationRejoin,
} from "./use-realtime-channel";

export interface BranchOpsEvent {
  at: string | null;
  domain: string | null;
  id: number | string | null;
  op: string | null;
  table: string;
}

export interface BranchOpsEventFilter {
  domains?: readonly string[];
  tables?: readonly string[];
}

export interface BranchOpsMetricsSnapshot {
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

export const INVENTORY_BRANCH_OPS_TABLES = [
  "goods_received_notes",
  "inventory_count_slips",
  "production_runs",
  "purchase_orders",
  "stock_issues",
  "stock_levels",
  "stock_transfers",
  "stocktake_sessions",
  "supplier_returns",
] as const;

export const PEOPLE_BRANCH_OPS_TABLES = [
  "attendance_records",
  "leave_requests",
] as const;

export const OPERATOR_BRANCH_OPS_TABLES = [
  ...INVENTORY_BRANCH_OPS_TABLES,
  ...PEOPLE_BRANCH_OPS_TABLES,
] as const;

interface BranchOpsSubscriber {
  filter: BranchOpsEventFilter;
  onInvalidate: () => void;
}

interface BranchOpsEntry {
  activeToken: string | null;
  branchId: number;
  channel: RealtimeChannel | null;
  subscribers: Map<symbol, BranchOpsSubscriber>;
}

type BranchOpsClient = SupabaseClient;

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

export function parseBranchOpsEvent(payload: unknown): BranchOpsEvent | null {
  const envelope = record(payload);
  const event = record(envelope?.payload);
  if (!event || typeof event.table !== "string" || event.table.length === 0) {
    return null;
  }

  const id = event.id;
  return {
    at: typeof event.at === "string" ? event.at : null,
    domain: typeof event.domain === "string" ? event.domain : null,
    id: typeof id === "number" || typeof id === "string" ? id : null,
    op: typeof event.op === "string" ? event.op : null,
    table: event.table,
  };
}

export function matchesBranchOpsFilter(
  event: BranchOpsEvent,
  filter: BranchOpsEventFilter,
): boolean {
  if (
    filter.domains &&
    filter.domains.length > 0 &&
    (event.domain === null || !filter.domains.includes(event.domain))
  ) {
    return false;
  }
  if (
    filter.tables &&
    filter.tables.length > 0 &&
    !filter.tables.includes(event.table)
  ) {
    return false;
  }
  return true;
}

export function createBranchOpsChannel(
  supabase: BranchOpsClient,
  branchId: number,
  onEvent: (event: BranchOpsEvent | null) => void,
  token: string | null,
): RealtimeChannel | null {
  const claims = extractClaimsFromAccessToken(token);
  if (!claims || !canSubscribeBranchOpsTopic(claims, branchId)) {
    return null;
  }

  const topic = `realtime:branch:${String(branchId)}:ops`;
  for (const existing of supabase.realtime.getChannels()) {
    if (existing.topic === topic) {
      evictRealtimeChannel(supabase, existing);
    }
  }

  let initialSubscribe = true;
  const channel = supabase.channel(`branch:${String(branchId)}:ops`, {
    config: { broadcast: { self: false }, private: true },
  });
  channel.on("broadcast", { event: "ops" }, (payload) => {
    const event = parseBranchOpsEvent(payload);
    if (event !== null) onEvent(event);
  });
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

export class BranchOpsRuntime {
  private authGeneration = 0;
  private authUnsubscribe: (() => void) | null = null;
  private currentToken: string | null = null;
  private readonly entries = new Map<number, BranchOpsEntry>();
  private channelJoinCount = 0;
  private ignoredEventCount = 0;
  private matchedInvalidationCount = 0;
  private receivedEventCount = 0;
  private reconnectCount = 0;
  private tokenRefreshRejoinCount = 0;

  constructor(private readonly supabase: BranchOpsClient) {}

  getMetricsSnapshot(): BranchOpsMetricsSnapshot {
    let activeChannelCount = 0;
    let activeSubscriberCount = 0;
    for (const entry of this.entries.values()) {
      if (entry.channel !== null) activeChannelCount += 1;
      activeSubscriberCount += entry.subscribers.size;
    }
    return {
      activeChannelCount,
      activeSubscriberCount,
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
    branchId: number;
    filter?: BranchOpsEventFilter;
    onInvalidate: () => void;
  }): () => void {
    const subscriberId = Symbol("branch-ops-subscriber");
    let entry = this.entries.get(args.branchId);
    if (!entry) {
      entry = {
        activeToken: null,
        branchId: args.branchId,
        channel: null,
        subscribers: new Map(),
      };
      this.entries.set(args.branchId, entry);
    }
    entry.subscribers.set(subscriberId, {
      filter: args.filter ?? {},
      onInvalidate: args.onInvalidate,
    });

    this.startAuthLifecycle();
    this.ensureChannel(entry);

    let active = true;
    return () => {
      if (!active) return;
      active = false;
      const current = this.entries.get(args.branchId);
      if (!current) return;
      current.subscribers.delete(subscriberId);
      if (current.subscribers.size > 0) return;
      this.teardownChannel(current);
      this.entries.delete(args.branchId);
      if (this.entries.size === 0) this.stopAuthLifecycle();
    };
  }

  private dispatch(entry: BranchOpsEntry, event: BranchOpsEvent | null): void {
    if (event === null) this.reconnectCount += 1;
    else this.receivedEventCount += 1;
    let matched = 0;
    for (const subscriber of entry.subscribers.values()) {
      if (event === null || matchesBranchOpsFilter(event, subscriber.filter)) {
        matched += 1;
        subscriber.onInvalidate();
      }
    }
    this.matchedInvalidationCount += matched;
    if (event !== null && matched === 0) this.ignoredEventCount += 1;
  }

  private ensureChannel(entry: BranchOpsEntry): void {
    const token = this.currentToken;
    if (token === null || entry.activeToken === token) return;
    this.teardownChannel(entry);
    entry.activeToken = token;
    entry.channel = createBranchOpsChannel(
      this.supabase,
      entry.branchId,
      (event) => this.dispatch(entry, event),
      token,
    );
    if (entry.channel !== null) this.channelJoinCount += 1;
  }

  private setToken(token: string | null): void {
    if (token === this.currentToken) {
      for (const entry of this.entries.values()) this.ensureChannel(entry);
      return;
    }

    const previousToken = this.currentToken;
    this.currentToken = token;
    if (previousToken !== null && token !== null) {
      this.tokenRefreshRejoinCount += 1;
    }
    if (token !== null) void this.supabase.realtime.setAuth(token);
    for (const entry of this.entries.values()) {
      this.teardownChannel(entry);
      this.ensureChannel(entry);
    }
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

  private teardownChannel(entry: BranchOpsEntry): void {
    entry.activeToken = null;
    if (entry.channel === null) return;
    const channel = entry.channel;
    entry.channel = null;
    evictRealtimeChannel(this.supabase, channel);
  }
}

let sharedBranchOpsRuntime: BranchOpsRuntime | null = null;

type BranchOpsMetricsGlobal = typeof globalThis & {
  __COMTAMMATU_BRANCH_OPS_METRICS__?: {
    snapshot: () => BranchOpsMetricsSnapshot;
  };
};

const emptyBranchOpsMetrics = (): BranchOpsMetricsSnapshot => ({
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

function installBranchOpsMetricsRegistry(): void {
  const metricsGlobal = globalThis as BranchOpsMetricsGlobal;
  metricsGlobal.__COMTAMMATU_BRANCH_OPS_METRICS__ = {
    snapshot: () =>
      sharedBranchOpsRuntime?.getMetricsSnapshot() ?? emptyBranchOpsMetrics(),
  };
}

export function subscribeBranchOps(args: {
  branchId: number;
  filter?: BranchOpsEventFilter;
  onInvalidate: () => void;
}): () => void {
  if (sharedBranchOpsRuntime === null) {
    sharedBranchOpsRuntime = new BranchOpsRuntime(createClient());
    installBranchOpsMetricsRegistry();
  }
  return sharedBranchOpsRuntime.subscribe(args);
}
