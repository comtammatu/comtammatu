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

  useEffect(() => {
    setCategoriesRef.current = setCategories;
  }, [setCategories]);

  useRealtimeChannel(
    (supabase) => {
      const handleMenuRefetch = async () => {
        try {
          const res = await fetchMenuForPos(branchId, true);
          if (res.success && Array.isArray(res.data)) {
            setCategoriesRef.current(res.data as MenuCategory[]);
            toast.success("Thực đơn POS đã được cập nhật tự động.");
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
          if (payload.payload?.domain === "pos") {
            handleMenuRefetch();
          }
        })
        .subscribe();
    },
    [branchId],
  );
}
