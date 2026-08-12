"use client";

import type { ReactNode } from "react";
import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { History as IconHistory } from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@comtammatu/ui/components/toggle-group";
import { AppListFrame, AppToolbar } from "@/components/surface";
import { useFormControlSize } from "@/components/form/control-size";
import { messages } from "@lib/messages";

export type ApprovalsQueue = "checkout" | "leave";

export function resolveApprovalsQueue(panel: string | undefined): ApprovalsQueue {
  return panel === "leave" || panel === "leave-history" ? "leave" : "checkout";
}

export function AttendanceApprovalsFrame({
  checkout,
  leave,
}: {
  checkout: ReactNode;
  leave: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const controlSize = useFormControlSize();
  const copy = messages.hr.client.attendanceTabs;
  const leaveCopy = messages.hr.leave;
  const queue = resolveApprovalsQueue(searchParams.get("panel") ?? undefined);

  const setPanel = useCallback(
    (panel: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (panel) params.set("panel", panel);
      else params.delete("panel");
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, {
        scroll: false,
      });
    },
    [pathname, router, searchParams],
  );

  return (
    <AppListFrame
      contentScroll
      toolbar={
        <AppToolbar
          variant="inline"
          filters={
            <ToggleGroup
              type="single"
              size={controlSize === "touch" ? "touch" : "default"}
              value={queue}
              onValueChange={(value) => {
                if (value === "checkout") setPanel(null);
                if (value === "leave") setPanel("leave");
              }}
              aria-label={copy.queueAria}
            >
              <ToggleGroupItem value="checkout">
                {copy.queueCheckout}
              </ToggleGroupItem>
              <ToggleGroupItem value="leave">
                {copy.queueLeave}
              </ToggleGroupItem>
            </ToggleGroup>
          }
          actions={
            queue === "leave" ? (
              <Button
                type="button"
                variant="outline"
                size={controlSize === "touch" ? "touch" : "default"}
                onClick={() => setPanel("leave-history")}
              >
                <IconHistory data-icon="inline-start" />
                {leaveCopy.historyAction}
              </Button>
            ) : null
          }
        />
      }
    >
      {queue === "checkout" ? checkout : leave}
    </AppListFrame>
  );
}
