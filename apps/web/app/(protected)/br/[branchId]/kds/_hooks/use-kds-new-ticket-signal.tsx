"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { KdsTicket } from "../types";

// How long the new-ticket highlight lingers on a card. The board stays
// static — no pulse, ring, or fade — this window only controls how long
// the info wash stays before it clears.
export const KDS_NEW_TICKET_SIGNAL_MS = 1500;

const EMPTY_SIGNAL_IDS: ReadonlySet<number> = new Set<number>();
const KdsNewTicketSignalContext =
  createContext<ReadonlySet<number>>(EMPTY_SIGNAL_IDS);

export function KdsNewTicketSignalProvider({
  value,
  children,
}: {
  value: ReadonlySet<number>;
  children: ReactNode;
}) {
  return (
    <KdsNewTicketSignalContext.Provider value={value}>
      {children}
    </KdsNewTicketSignalContext.Provider>
  );
}

export function useKdsNewTicketSignalIds(): ReadonlySet<number> {
  return useContext(KdsNewTicketSignalContext);
}

export function getKdsNewTicketSignalClass(): string {
  return "bg-info/15";
}

/**
 * Pure classifier. From the proven realtime-INSERT ids, keep only the ones
 * that (a) are still present as a visible ticket and (b) are not already
 * signalling (one-shot). Anything that reached the board via snapshot refresh,
 * reconnect, poll, visibility refetch, filter, station, mode switch, or ready
 * removal never appears in `insertedTicketIds`, so it can never signal here.
 */
export function selectKdsNewTicketSignalIds({
  insertedTicketIds,
  visibleTicketIds,
  activeSignalIds,
}: {
  insertedTicketIds: readonly number[];
  visibleTicketIds: ReadonlySet<number>;
  activeSignalIds: ReadonlySet<number>;
}): number[] {
  const added: number[] = [];
  for (const id of insertedTicketIds) {
    if (!visibleTicketIds.has(id)) continue;
    if (activeSignalIds.has(id)) continue;
    if (added.includes(id)) continue;
    added.push(id);
  }
  return added;
}

export interface UseKdsNewTicketSignalArgs {
  scopeKey: string | number;
  tickets: KdsTicket[];
  consumeInsertedTicketIds: () => readonly number[];
}

export function useKdsNewTicketSignal({
  scopeKey,
  tickets,
  consumeInsertedTicketIds,
}: UseKdsNewTicketSignalArgs): ReadonlySet<number> {
  const scopeRef = useRef(scopeKey);
  const signalIdsRef = useRef<ReadonlySet<number>>(EMPTY_SIGNAL_IDS);
  const timeoutsRef = useRef<Map<number, number>>(new Map());
  const [signalIds, setSignalIds] =
    useState<ReadonlySet<number>>(EMPTY_SIGNAL_IDS);

  useEffect(() => {
    signalIdsRef.current = signalIds;
  }, [signalIds]);

  // Reset when the board scope changes (e.g. branch switch) so a stale id from
  // the previous board never signals against the new one.
  useEffect(() => {
    if (scopeRef.current === scopeKey) return;
    scopeRef.current = scopeKey;
    for (const timeoutId of timeoutsRef.current.values()) {
      window.clearTimeout(timeoutId);
    }
    timeoutsRef.current.clear();
    signalIdsRef.current = EMPTY_SIGNAL_IDS;
    setSignalIds(EMPTY_SIGNAL_IDS);
  }, [scopeKey]);

  // Runs on every `tickets` change. Only realtime INSERT fills the drain, so a
  // snapshot/reconnect/poll/visibility/mutation change reads an empty drain and
  // signals nothing. Filter / station / mode switches do not touch `tickets`.
  useEffect(() => {
    const inserted = consumeInsertedTicketIds();
    if (inserted.length === 0) return;

    const visibleTicketIds = new Set(tickets.map((ticket) => ticket.id));
    const added = selectKdsNewTicketSignalIds({
      insertedTicketIds: inserted,
      visibleTicketIds,
      activeSignalIds: signalIdsRef.current,
    });
    if (added.length === 0) return;

    setSignalIds((prev) => {
      const next = new Set(prev);
      for (const id of added) next.add(id);
      return next;
    });

    for (const id of added) {
      const existing = timeoutsRef.current.get(id);
      if (existing !== undefined) window.clearTimeout(existing);
      const timeoutId = window.setTimeout(() => {
        timeoutsRef.current.delete(id);
        setSignalIds((prev) => {
          if (!prev.has(id)) return prev;
          const next = new Set(prev);
          next.delete(id);
          return next.size === 0 ? EMPTY_SIGNAL_IDS : next;
        });
      }, KDS_NEW_TICKET_SIGNAL_MS);
      timeoutsRef.current.set(id, timeoutId);
    }
  }, [tickets, consumeInsertedTicketIds]);

  useEffect(
    () => () => {
      for (const timeoutId of timeoutsRef.current.values()) {
        window.clearTimeout(timeoutId);
      }
      timeoutsRef.current.clear();
    },
    [],
  );

  return signalIds;
}
