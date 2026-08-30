"use client";

import { useEffect, useRef, type DependencyList } from "react";
import { createClient } from "@comtammatu/database/supabase/client";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";

type RealtimeChannelClient = Pick<SupabaseClient, "realtime" | "removeChannel">;
type RealtimeInternals = { _remove: (channel: RealtimeChannel) => void };

export function evictRealtimeChannel(
  supabase: RealtimeChannelClient,
  channel: RealtimeChannel,
): void {
  void supabase.removeChannel(channel);
  (supabase.realtime as unknown as RealtimeInternals)._remove(channel);
}

function realtimeErrorText(error?: Error): string {
  if (!error?.cause) return error?.message ?? "";
  try {
    return `${error.message} ${JSON.stringify(error.cause)}`;
  } catch {
    return error.message;
  }
}

export function stopRealtimeAuthorizationRejoin(
  supabase: RealtimeChannelClient,
  channel: RealtimeChannel,
  error?: Error,
): boolean {
  if (
    !/unauthorized|permission|denied|private.?only|only allows private/i.test(
      realtimeErrorText(error),
    )
  ) {
    return false;
  }
  evictRealtimeChannel(supabase, channel);
  return true;
}

/**
 * Subscribe to a Supabase Realtime channel safely. Defers `.subscribe()`
 * until `auth.getSession()` resolves so the broker registers the
 * subscription with `claims_role=authenticated` instead of `anon`.
 *
 * Without this, a channel created on cold mount before auth loads stays
 * anon for its lifetime and NEVER receives RLS-protected events even
 * after supabase-js later pushes the access token via `realtime.setAuth`
 * — the `realtime.subscription` row's `claims_role` is stamped at
 * subscribe time and not re-evaluated for the per-row RLS check. See
 * regression rule REALTIME-AWAIT-AUTH-BEFORE-SUBSCRIBE.
 *
 * `setupChannel` runs once per effect commit, after auth is hot. Build
 * the channel via `supabase.channel(...).on(...).subscribe(...)` and
 * return it; the helper unsubscribes on cleanup. Return `null` to skip
 * (e.g. when a target id is not yet known).
 *
 * @example
 *   useRealtimeChannel(
 *     (supabase) =>
 *       supabase
 *         .channel(`pos-branch-${branchId}`)
 *         .on('postgres_changes', { ... }, () => refresh())
 *         .subscribe(),
 *     [branchId],
 *   );
 */
export function useRealtimeChannel(
  setupChannel: (
    supabase: SupabaseClient,
    token: string | null,
  ) => RealtimeChannel | null,
  deps: DependencyList,
): void {
  // One client per hook instance. Lazy-init mirrors the existing pattern
  // already used in useOrderSync / useKdsRealtime / useNotifications.
  const supabaseRef = useRef<SupabaseClient | null>(null);
  if (supabaseRef.current === null) {
    supabaseRef.current = createClient();
  }

  // Latest setupChannel via ref so the effect re-runs on `deps` change
  // (caller controls the dep array) without stale-closure-baking the
  // setup function. Caller's deps array is the source of truth for when
  // to tear down + re-subscribe.
  const setupRef = useRef(setupChannel);
  setupRef.current = setupChannel;

  useEffect(() => {
    const supabase = supabaseRef.current;
    if (supabase === null) return;

    let channel: RealtimeChannel | null = null;
    let cancelled = false;

    // REALTIME-EVICT-CHANNEL-SYNC-AFTER-REMOVE: `removeChannel` is async
    // — it awaits the server `phx_close` ACK before its `_onClose`
    // callback evicts from `socket.channels`. realtime-js's
    // `channel(topic)` dedups by topic and returns the existing channel
    // from that list, so any re-subscribe (auth event race, navigation
    // remount, Fast Refresh / strict-mode double-mount) that runs before
    // the leave round-trip completes hands back the stale,
    // already-subscribed channel — calling `.on('postgres_changes', ...)`
    // on it then throws "cannot add `postgres_changes` callbacks for ...
    // after `subscribe()`". `evict` mirrors what `_onClose` does (drop the
    // channel from `socket.channels` synchronously) so the next
    // `supabase.channel(topic)` builds fresh. The async leave still runs,
    // idempotent.
    const teardownChannel = () => {
      if (channel === null) return;
      const stale = channel;
      channel = null;
      evictRealtimeChannel(supabase, stale);
    };

    // `teardownChannel` only evicts the channel THIS effect created. A
    // channel left in the process-global singleton socket (one socket for
    // the whole tab via `@supabase/ssr`'s `createBrowserClient`) by an
    // overlapping mount/unmount, a Fast Refresh remount, or a second live
    // subscriber on the same topic is invisible to it — and realtime-js's
    // topic dedup would hand that already-joined channel to the builder's
    // `.channel(topic)`, throwing on the chained `.on(...)`. Wrap the
    // client so the builder's `.channel(topic)` force-evicts any same-topic
    // channel before creating a fresh one. `_remove` stays internal and
    // the topic naming convention is unchanged.
    const freshChannelClient = new Proxy(supabase, {
      get(target, prop, receiver) {
        if (prop !== "channel") return Reflect.get(target, prop, receiver);
        return (
          name: string,
          opts?: Parameters<SupabaseClient["channel"]>[1],
        ): RealtimeChannel => {
          const topic = `realtime:${name}`;
          for (const existing of target.realtime.getChannels()) {
            if (existing.topic === topic) {
              evictRealtimeChannel(supabase, existing);
            }
          }
          return target.channel(name, opts);
        };
      },
    });

    const subscribeWithToken = (token: string | null) => {
      if (cancelled) return;
      // Always tear down before re-subscribe — covers the auth-event race
      // where TOKEN_REFRESHED fires while a prior subscribe just landed.
      teardownChannel();
      // Never JOIN as anon: private-topic RLS (branch ops, etc.) rejects
      // unauthenticated reads and the client retries forever. Wait for
      // SIGNED_IN / getSession with a real access token.
      if (token === null) return;
      // Defense-in-depth: pin the JWT onto the realtime client before
      // subscribe. supabase-js normally does this on the SIGNED_IN
      // auth event, but on cold mount that event may not have fired
      // yet — explicit setAuth ensures the JOIN frame carries it.
      void supabase.realtime.setAuth(token);
      channel = setupRef.current(freshChannelClient, token);
    };

    void supabase.auth
      .getSession()
      .then(({ data }) =>
        subscribeWithToken(data.session?.access_token ?? null),
      );

    // REALTIME-CHANNEL-RESUBSCRIBE-ON-TOKEN-REFRESH: when supabase-js
    // rotates the JWT (default ~1h, configurable), the connection-level
    // setAuth keeps WebSocket auth fresh, BUT the per-channel
    // `realtime.subscription.claims_role` is stamped at subscribe time
    // and not re-evaluated. After rotation, RLS-protected events stop
    // reaching this channel silently. Tear down + resubscribe so the
    // new claims_role is baked in. SIGNED_OUT also tears down — caller
    // re-mounts on next sign-in.
    const { data: authSub } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (cancelled) return;
        if (event === "TOKEN_REFRESHED" || event === "SIGNED_IN") {
          subscribeWithToken(session?.access_token ?? null);
        } else if (event === "SIGNED_OUT") {
          teardownChannel();
        }
      },
    );

    return () => {
      cancelled = true;
      authSub.subscription.unsubscribe();
      teardownChannel();
    };
  }, deps);
}
