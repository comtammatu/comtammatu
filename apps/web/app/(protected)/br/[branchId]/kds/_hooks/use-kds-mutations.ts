"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@comtammatu/database/supabase/client";
import { toast } from "@comtammatu/ui/components/sonner";
import { isKdsActiveTicketStatus } from "../_lib/order-status";
import type { KdsTicket } from "../types";

export interface UseKdsMutationsArgs {
  branchId: number;
  tickets: KdsTicket[];
  setTickets: React.Dispatch<React.SetStateAction<KdsTicket[]>>;
  refreshBoardSnapshot: () => Promise<void>;
}

export interface KdsMutations {
  handleRecall: (ticketId: number) => Promise<void>;
  handleCompleteTickets: (ticketIds: number[]) => Promise<void>;
  handleOutOfStock: (ticketId: number, disableForDay?: boolean) => Promise<void>;
  pendingTicketIds: Set<number>;
}

type CompleteKdsTicketsResult = {
  completed_count?: number;
  print_warning?: string | null;
  skipped_ticket_count?: number;
};

export function useKdsMutations({
  branchId,
  tickets,
  setTickets,
  refreshBoardSnapshot,
}: UseKdsMutationsArgs): KdsMutations {
  const supabaseRef = useRef(createClient());
  const ticketsRef = useRef(tickets);
  const [pendingTicketIds, setPendingTicketIds] = useState<Set<number>>(
    () => new Set(),
  );
  const pendingTicketIdsRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    ticketsRef.current = tickets;
  }, [tickets]);

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

  const beginTicketMutations = useCallback((ticketIds: number[]): boolean => {
    const uniqueIds = [...new Set(ticketIds)];
    if (uniqueIds.some((id) => pendingTicketIdsRef.current.has(id))) {
      return false;
    }

    const next = new Set(pendingTicketIdsRef.current);
    for (const id of uniqueIds) next.add(id);
    pendingTicketIdsRef.current = next;
    setPendingTicketIds(next);
    return true;
  }, []);

  const endTicketMutations = useCallback((ticketIds: number[]) => {
    const uniqueIds = [...new Set(ticketIds)];
    if (!uniqueIds.some((id) => pendingTicketIdsRef.current.has(id))) return;

    const next = new Set(pendingTicketIdsRef.current);
    for (const id of uniqueIds) next.delete(id);
    pendingTicketIdsRef.current = next;
    setPendingTicketIds(next);
  }, []);

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

  const handleCompleteTickets = useCallback(
    async (ticketIds: number[]) => {
      const activeIds = [
        ...new Set(
          ticketsRef.current
            .filter(
              (ticket) =>
                ticketIds.includes(ticket.id) &&
                isKdsActiveTicketStatus(ticket.status),
            )
            .map((ticket) => ticket.id),
        ),
      ];

      if (activeIds.length === 0) return;
      if (!beginTicketMutations(activeIds)) return;

      setTickets((prev) =>
        prev.map((ticket) =>
          activeIds.includes(ticket.id)
            ? { ...ticket, status: "ready" }
            : ticket,
        ),
      );

      try {
        const sb = supabaseRef.current;
        const { data, error } = await sb.rpc("complete_kds_tickets", {
          p_branch_id: branchId,
          p_ticket_ids: activeIds,
        });

        if (error) {
          toast.error("Không thể hoàn tất phiếu bếp. Vui lòng thử lại.");
          await refreshBoardSnapshot();
          return;
        }

        const result = (data ?? null) as CompleteKdsTicketsResult | null;
        const hasPrintWarning =
          Boolean(result?.print_warning) ||
          ((result?.completed_count ?? 0) > 0 &&
            (result?.skipped_ticket_count ?? 0) > 0);
        if (hasPrintWarning) {
          toast.warning(
            "Đã hoàn thành món, nhưng chưa tạo đủ phiếu in bếp. Kiểm tra máy in bếp hoặc báo trực tiếp.",
          );
        }
      } finally {
        endTicketMutations(activeIds);
      }
    },
    [
      beginTicketMutations,
      branchId,
      endTicketMutations,
      refreshBoardSnapshot,
      setTickets,
    ],
  );

  const handleOutOfStock = useCallback(
    async (ticketId: number, disableForDay = true) => {
      // Optimistic update: remove the ticket immediately
      setTickets((prev) => prev.filter((t) => t.id !== ticketId));

      try {
        const sb = supabaseRef.current;
        const { error } = await sb.rpc("mark_kds_item_out_of_stock", {
          p_ticket_id: ticketId,
          p_disable_for_day: disableForDay,
          p_reason: "Hết món",
        });

        if (error) {
          toast.error("Không thể báo hết món. Vui lòng thử lại.");
          await refreshBoardSnapshot();
        }
      } catch {
        toast.error("Có lỗi xảy ra khi báo hết món.");
        await refreshBoardSnapshot();
      }
    },
    [refreshBoardSnapshot, setTickets],
  );

  return {
    handleRecall,
    handleCompleteTickets,
    handleOutOfStock,
    pendingTicketIds,
  };
}
