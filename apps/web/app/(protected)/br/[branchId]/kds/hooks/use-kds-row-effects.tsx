"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { KdsOrderItem, KdsTicket } from "../types";

export const KDS_ROW_EFFECT_MS = 1800;

export type KdsRowEffectTone =
  | "added"
  | "content"
  | "quantity"
  | "status"
  | "removed";

export interface KdsRowSnapshot {
  ticketId: number;
  orderItemId: number;
  status: string;
  quantity: number | null;
  contentSignature: string;
}

interface KdsRowEffectsArgs {
  scopeKey: string | number;
  tickets: KdsTicket[];
  orderItemById: ReadonlyMap<number, KdsOrderItem>;
}

const EMPTY_EFFECTS = new Map<number, KdsRowEffectTone>();
const KdsRowEffectsContext =
  createContext<ReadonlyMap<number, KdsRowEffectTone>>(EMPTY_EFFECTS);

export function KdsRowEffectsProvider({
  value,
  children,
}: {
  value: ReadonlyMap<number, KdsRowEffectTone>;
  children: ReactNode;
}) {
  return (
    <KdsRowEffectsContext.Provider value={value}>
      {children}
    </KdsRowEffectsContext.Provider>
  );
}

export function useKdsRowEffect(
  ticketId: number | null | undefined,
): KdsRowEffectTone | null {
  const effects = useContext(KdsRowEffectsContext);
  if (ticketId == null) return null;
  return effects.get(ticketId) ?? null;
}

export function useKdsRowEffectsValue(): ReadonlyMap<number, KdsRowEffectTone> {
  return useContext(KdsRowEffectsContext);
}

export function useKdsRowEffects({
  scopeKey,
  tickets,
  orderItemById,
}: KdsRowEffectsArgs): ReadonlyMap<number, KdsRowEffectTone> {
  const currentSnapshots = useMemo(
    () =>
      tickets.map((ticket) =>
        createKdsRowSnapshot(ticket, orderItemById.get(ticket.order_item_id)),
      ),
    [orderItemById, tickets],
  );
  const scopeRef = useRef(scopeKey);
  const previousSnapshotsRef = useRef<ReadonlyMap<
    number,
    KdsRowSnapshot
  > | null>(null);
  const timeoutsRef = useRef<Map<number, number>>(new Map());
  const [effects, setEffects] =
    useState<ReadonlyMap<number, KdsRowEffectTone>>(EMPTY_EFFECTS);

  useEffect(() => {
    const scopeChanged = scopeRef.current !== scopeKey;
    if (scopeChanged) {
      scopeRef.current = scopeKey;
      previousSnapshotsRef.current = null;
      for (const timeoutId of timeoutsRef.current.values()) {
        window.clearTimeout(timeoutId);
      }
      timeoutsRef.current.clear();
      setEffects(EMPTY_EFFECTS);
    }

    const { nextSnapshots, effects: nextEffects } = deriveKdsRowEffects(
      previousSnapshotsRef.current,
      currentSnapshots,
    );
    previousSnapshotsRef.current = nextSnapshots;

    if (nextEffects.size === 0) return;

    setEffects((prev) => {
      const next = new Map(prev);
      for (const [ticketId, tone] of nextEffects) {
        next.set(ticketId, tone);
      }
      return next;
    });

    for (const [ticketId, tone] of nextEffects) {
      const currentTimeout = timeoutsRef.current.get(ticketId);
      if (currentTimeout !== undefined) {
        window.clearTimeout(currentTimeout);
      }

      const timeoutId = window.setTimeout(() => {
        timeoutsRef.current.delete(ticketId);
        setEffects((prev) => {
          if (prev.get(ticketId) !== tone) return prev;
          const next = new Map(prev);
          next.delete(ticketId);
          return next.size === 0 ? EMPTY_EFFECTS : next;
        });
      }, KDS_ROW_EFFECT_MS);
      timeoutsRef.current.set(ticketId, timeoutId);
    }
  }, [currentSnapshots, scopeKey]);

  useEffect(
    () => () => {
      for (const timeoutId of timeoutsRef.current.values()) {
        window.clearTimeout(timeoutId);
      }
      timeoutsRef.current.clear();
    },
    [],
  );

  return effects;
}

export function createKdsRowSnapshot(
  ticket: KdsTicket,
  item: KdsOrderItem | undefined,
): KdsRowSnapshot {
  return {
    ticketId: ticket.id,
    orderItemId: ticket.order_item_id,
    status: ticket.status,
    quantity: item?.quantity ?? null,
    contentSignature: buildKdsItemContentSignature(item),
  };
}

export function deriveKdsRowEffects(
  previousSnapshots: ReadonlyMap<number, KdsRowSnapshot> | null,
  currentSnapshots: KdsRowSnapshot[],
): {
  nextSnapshots: ReadonlyMap<number, KdsRowSnapshot>;
  effects: ReadonlyMap<number, KdsRowEffectTone>;
} {
  const nextSnapshots = new Map(
    currentSnapshots.map((snapshot) => [snapshot.ticketId, snapshot]),
  );
  const effects = new Map<number, KdsRowEffectTone>();

  if (previousSnapshots === null) {
    return { nextSnapshots, effects };
  }

  for (const snapshot of currentSnapshots) {
    const previous = previousSnapshots.get(snapshot.ticketId);
    const tone = classifyKdsRowEffect(previous, snapshot);
    if (tone !== null) {
      effects.set(snapshot.ticketId, tone);
    }
  }

  return { nextSnapshots, effects };
}

function classifyKdsRowEffect(
  previous: KdsRowSnapshot | undefined,
  next: KdsRowSnapshot,
): KdsRowEffectTone | null {
  if (previous === undefined) return "added";
  if (
    previous.status === next.status &&
    previous.quantity === next.quantity &&
    previous.contentSignature === next.contentSignature
  ) {
    return null;
  }
  if (next.status === "cancelled") return "removed";
  if (previous.quantity !== next.quantity) return "quantity";
  if (previous.status !== next.status) return "status";
  return "content";
}

export function getKdsRowEffectClass(
  tone: KdsRowEffectTone | null,
): string | false {
  if (tone === "added") {
    return "bg-info/10 ring-2 ring-inset ring-info/50 motion-safe:animate-pulse";
  }
  if (tone === "quantity") {
    return "bg-warning/10 ring-2 ring-inset ring-warning/50 motion-safe:animate-pulse";
  }
  if (tone === "removed") {
    return "bg-destructive/10 ring-2 ring-inset ring-destructive/40";
  }
  if (tone === "status") {
    return "bg-success/10 ring-2 ring-inset ring-success/40";
  }
  if (tone === "content") {
    return "bg-info/10 ring-2 ring-inset ring-info/40";
  }
  return false;
}

function buildKdsItemContentSignature(item: KdsOrderItem | undefined): string {
  if (!item) return "missing-item";
  return JSON.stringify({
    itemName: item.item_name,
    variantName: item.variant_name,
    unitPrice: item.unit_price,
    note: item.note,
    isPriority: item.is_priority,
    modifiers: item.modifiers,
    sides: item.sides,
  });
}
