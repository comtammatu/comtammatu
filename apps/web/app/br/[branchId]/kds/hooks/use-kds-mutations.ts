"use client";

import { useCallback, useRef, useState } from "react";
import { createClient } from "@comtammatu/database/supabase/client";
import { toast } from "@comtammatu/ui/components/sonner";
import type { KdsTicket } from "../types";

export interface UseKdsMutationsArgs {
  setTickets: React.Dispatch<React.SetStateAction<KdsTicket[]>>;
  refreshBoardSnapshot: () => Promise<void>;
}

export interface KdsMutations {
  handleBump: (ticketId: number) => Promise<void>;
  handleRecall: (ticketId: number) => Promise<void>;
  pendingTicketIds: Set<number>;
}

export function useKdsMutations({
  setTickets,
  refreshBoardSnapshot,
}: UseKdsMutationsArgs): KdsMutations {
  const supabaseRef = useRef(createClient());
  const [pendingTicketIds, setPendingTicketIds] = useState<Set<number>>(
    () => new Set(),
  );
  const pendingTicketIdsRef = useRef<Set<number>>(new Set());

  const beginTicketMutation = useCallback((ticketId: number): boolean => {
    if (pendingTicketIdsRef.current.has(ticketId)) return false;

    const next = new Set(pendingTicketIdsRef.current);
    next.add(ticketId);
    pendingTicketIdsRef.current = next;
    setPendingTicketIds(next);
    return true;
  }, []);

  const endTicketMutation = useCallback((ticketId: number) => {
    if (!pendingTicketIdsRef.current.has(ticketId)) return;

    const next = new Set(pendingTicketIdsRef.current);
    next.delete(ticketId);
    pendingTicketIdsRef.current = next;
    setPendingTicketIds(next);
  }, []);

  const handleBump = useCallback(
    async (ticketId: number) => {
      if (!beginTicketMutation(ticketId)) return;

      setTickets((prev) =>
        prev.map((t) => {
          if (t.id !== ticketId) return t;
          const nextStatus =
            t.status === "pending"
              ? "preparing"
              : t.status === "preparing"
                ? "ready"
                : t.status;
          return { ...t, status: nextStatus };
        }),
      );

      try {
        const sb = supabaseRef.current;
        const { error } = await sb.rpc("bump_kds_ticket", {
          p_ticket_id: ticketId,
        });

        if (error) {
          toast.error("Không thể cập nhật trạng thái món. Vui lòng thử lại.");
          await refreshBoardSnapshot();
        }
      } finally {
        endTicketMutation(ticketId);
      }
    },
    [beginTicketMutation, endTicketMutation, refreshBoardSnapshot, setTickets],
  );

  const handleRecall = useCallback(
    async (ticketId: number) => {
      if (!beginTicketMutation(ticketId)) return;

      setTickets((prev) =>
        prev.map((t) => {
          if (t.id !== ticketId) return t;
          const prevStatus =
            t.status === "ready"
              ? "preparing"
              : t.status === "preparing"
                ? "pending"
                : t.status;
          return { ...t, status: prevStatus };
        }),
      );

      try {
        const sb = supabaseRef.current;
        const { error } = await sb.rpc("recall_kds_ticket", {
          p_ticket_id: ticketId,
        });

        if (error) {
          toast.error("Không thể thu hồi trạng thái món. Vui lòng thử lại.");
          await refreshBoardSnapshot();
        }
      } finally {
        endTicketMutation(ticketId);
      }
    },
    [beginTicketMutation, endTicketMutation, refreshBoardSnapshot, setTickets],
  );

  return { handleBump, handleRecall, pendingTicketIds };
}
