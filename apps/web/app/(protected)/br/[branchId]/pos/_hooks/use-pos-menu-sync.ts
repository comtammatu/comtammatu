"use client";

import { useEffect, useRef } from "react";
import { useRealtimeChannel } from "@/_hooks/use-realtime-channel";
import { fetchMenuForPos } from "../actions";
import type { MenuCategory } from "../pos-menu-types";
import { toast } from "@comtammatu/ui/components/sonner";

export interface UsePosMenuSyncArgs {
  branchId: number;
  setCategories: React.Dispatch<React.SetStateAction<MenuCategory[]>>;
}

export function usePosMenuSync({ branchId, setCategories }: UsePosMenuSyncArgs) {
  const setCategoriesRef = useRef(setCategories);
  const didInitialSubscribeRef = useRef(false);

  useEffect(() => {
    setCategoriesRef.current = setCategories;
  }, [setCategories]);

  useEffect(() => {
    didInitialSubscribeRef.current = false;
  }, [branchId]);

  useRealtimeChannel(
    (supabase) => {
      const handleMenuRefetch = async ({ notify = true } = {}) => {
        try {
          const res = await fetchMenuForPos(branchId, true);
          if (res.success && Array.isArray(res.data)) {
            setCategoriesRef.current(res.data as MenuCategory[]);
            if (notify) {
              toast.success("Thực đơn POS đã được cập nhật tự động.");
            }
          }
        } catch (err) {
          console.error("Refetch POS menu failed:", err);
        }
      };

      return supabase
        .channel(`branch:${String(branchId)}:ops`, {
          config: { broadcast: { self: false }, private: true },
        })
        .on("broadcast", { event: "ops" }, (payload) => {
          const event = payload.payload;
          if (
            event?.domain === "pos" ||
            (event?.domain === "inventory" && event?.table === "stock_levels")
          ) {
            handleMenuRefetch();
          }
        })
        .subscribe((status) => {
          if (status !== "SUBSCRIBED") return;
          if (!didInitialSubscribeRef.current) {
            didInitialSubscribeRef.current = true;
            return;
          }
          handleMenuRefetch({ notify: false });
        });
    },
    [branchId],
  );
}
