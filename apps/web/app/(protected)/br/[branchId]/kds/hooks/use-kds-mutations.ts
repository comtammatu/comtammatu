"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@comtammatu/database/supabase/client";
import { toast } from "@comtammatu/ui/components/sonner";
import { markKdsItemOutOfStock } from "../actions";
import type { KdsTicket } from "../types";

export interface UseKdsMutationsArgs {
  branchId: number;
  tickets: KdsTicket[];
  setTickets: React.Dispatch<React.SetStateAction<KdsTicket[]>>;
  refreshBoardSnapshot: () => Promise<void>;
  onMenuLimitChanged?: (patch: {
    menuItemId: number;
    limitQuantity: number | null;
    isDisabled: boolean;
    soldToday: number;
  }) => void;
}

export interface KdsMutations {
  handleBump: (ticketId: number) => Promise<void>;
  handleRecall: (ticketId: number) => Promise<void>;
  handleOutOfStock: (ticketId: number) => Promise<void>;
  handleCompleteTickets: (ticketIds: number[]) => Promise<void>;
  pendingTicketIds: Set<number>;
}

export function useKdsMutations({
  branchId,
  tickets,
  setTickets,
  refreshBoardSnapshot,
  onMenuLimitChanged,
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

  const handleOutOfStock = useCallback(
    async (ticketId: number) => {
      if (!beginTicketMutation(ticketId)) return;

      setTickets((prev) => prev.filter((t) => t.id !== ticketId));

      try {
        const ticket = ticketsRef.current.find((t) => t.id === ticketId);
        if (!ticket) {
          toast.error("Không tìm thấy phiếu bếp. Vui lòng tải lại.");
          await refreshBoardSnapshot();
          return;
        }

        const result = await markKdsItemOutOfStock({
          ticketId,
          branchId,
          disableForDay: true,
        });

        if (!result.success) {
          toast.error(result.error ?? "Không thể báo hết món.");
          await refreshBoardSnapshot();
          return;
        }

        toast.warning(`Đã báo hết món: ${result.data?.itemName ?? "món"}`);
        if (result.data) {
          onMenuLimitChanged?.({
            menuItemId: result.data.menuItemId,
            limitQuantity: result.data.limitQuantity,
            isDisabled: result.data.isDisabled,
            soldToday: result.data.soldToday,
          });
        }
      } finally {
        endTicketMutation(ticketId);
      }
    },
    [
      beginTicketMutation,
      branchId,
      endTicketMutation,
      onMenuLimitChanged,
      refreshBoardSnapshot,
      setTickets,
    ],
  );

  const handleCompleteTickets = useCallback(
    async (ticketIds: number[]) => {
      const activeIds = [
        ...new Set(
          ticketsRef.current
            .filter(
              (ticket) =>
                ticketIds.includes(ticket.id) &&
                (ticket.status === "pending" || ticket.status === "preparing"),
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
        // RPC is introduced by migration 20260601850000; cast until db:types is
        // regenerated from the schema where the migration is applied.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (sb as any).rpc("complete_kds_tickets", {
          p_branch_id: branchId,
          p_ticket_ids: activeIds,
        });

        if (error) {
          toast.error("Không thể hoàn tất phiếu bếp. Vui lòng thử lại.");
          await refreshBoardSnapshot();
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

  return {
    handleBump,
    handleRecall,
    handleOutOfStock,
    handleCompleteTickets,
    pendingTicketIds,
  };
}
