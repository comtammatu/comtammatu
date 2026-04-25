"use client";

import { useEffect, useRef, type DependencyList } from "react";
import { createClient } from "@comtammatu/database/supabase/client";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";

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
  setupChannel: (supabase: SupabaseClient) => RealtimeChannel | null,
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

    void supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      const token = data.session?.access_token ?? null;
      if (token !== null) {
        // Defense-in-depth: pin the JWT onto the realtime client before
        // subscribe. supabase-js normally does this on the SIGNED_IN
        // auth event, but on cold mount that event may not have fired
        // yet — explicit setAuth ensures the JOIN frame carries it.
        void supabase.realtime.setAuth(token);
      }
      channel = setupRef.current(supabase);
    });

    return () => {
      cancelled = true;
      if (channel !== null) {
        void supabase.removeChannel(channel);
      }
    };
  }, deps);
}
