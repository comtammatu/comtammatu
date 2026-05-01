"use client";

import { useEffect, useRef, useState } from "react";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Input } from "@comtammatu/ui/components/input";
import { ScrollArea } from "@comtammatu/ui/components/scroll-area";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@comtammatu/ui/components/empty";
import { Item, ItemGroup } from "@comtammatu/ui/components/item";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@comtammatu/ui/components/sheet";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from "@comtammatu/ui/components/drawer";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@comtammatu/ui/components/toggle-group";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { useIsMobile } from "@comtammatu/ui/hooks/use-mobile";
import {
  Receipt as IconReceipt,
  RefreshCw as IconRefresh,
  Search as IconSearch,
} from "lucide-react";
import {
  OrderCardSummary,
  OrderStatusBadge,
  type SessionOrder,
} from "../order-history";
import {
  useArchivedOrders,
  type ArchivedScope,
} from "../_hooks/use-archived-orders";

import { ACTIONS_VI, STATES_VI } from "@comtammatu/shared/messages";
interface ArchivedOrdersSheetProps {
  branchId: number;
  sessionId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onViewBill: (orderId: number, intent: "receipt") => void;
}

export function ArchivedOrdersSheet({
  branchId,
  sessionId,
  open,
  onOpenChange,
  onViewBill,
}: ArchivedOrdersSheetProps) {
  const isMobile = useIsMobile();
  const [scope, setScope] = useState<ArchivedScope>("session");
  // Debounced search — Zod tolerates max 50, but we throttle keystrokes so a
  // long search string doesn't fire one query per character.
  const [searchInput, setSearchInput] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => setDebouncedQuery(searchInput), 250);
    return () => window.clearTimeout(id);
  }, [open, searchInput]);

  // Reset filters when the sheet closes so the next open starts clean.
  // Keep the search box value to make "close + reopen for one more lookup"
  // ergonomic — only the active query is reset.
  useEffect(() => {
    if (open) return;
    setDebouncedQuery("");
    setSearchInput("");
    setScope("session");
  }, [open]);

  const {
    orders,
    isLoading,
    isLoadingMore,
    hasMore,
    error,
    reload,
    loadMore,
  } = useArchivedOrders({
    branchId,
    sessionId,
    open,
    scope,
    query: debouncedQuery,
  });

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const el = sentinelRef.current;
    if (el === null) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting === true) {
          loadMore();
        }
      },
      { rootMargin: "120px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [open, loadMore]);

  const body = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-border/60 px-4 py-3 flex flex-col gap-3">
        <div className="relative">
          <IconSearch
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            inputMode="search"
            placeholder="Tìm số đơn..."
            className="h-10 pl-9 text-base"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            aria-label="Tìm theo số đơn"
            data-testid="pos-archived-search"
          />
        </div>
        <ToggleGroup
          type="single"
          value={scope}
          onValueChange={(value) => {
            if (value === "session" || value === "today") setScope(value);
          }}
          variant="outline"
          className="grid h-10 w-full grid-cols-2 gap-0"
        >
          <ToggleGroupItem
            value="session"
            className="h-full justify-center text-sm font-semibold"
          >
            Ca này
          </ToggleGroupItem>
          <ToggleGroupItem
            value="today"
            className="h-full justify-center text-sm font-semibold"
          >
            Cả chi nhánh
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-2 px-3 py-3">
          {error !== null ? (
            <Empty className="min-h-32">
              <EmptyHeader>
                <EmptyTitle>Không tải được lịch sử</EmptyTitle>
                <EmptyDescription>{error}</EmptyDescription>
              </EmptyHeader>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={reload}
              >
                <IconRefresh data-icon="inline-start" />
                {ACTIONS_VI.retry}
              </Button>
            </Empty>
          ) : isLoading ? (
            <Empty className="min-h-32">
              <EmptyHeader>
                <EmptyTitle>
                  <Spinner data-icon="inline-start" />
                  {STATES_VI.loading}
                </EmptyTitle>
              </EmptyHeader>
            </Empty>
          ) : orders.length === 0 ? (
            <Empty className="min-h-32">
              <EmptyMedia variant="icon">
                <IconReceipt />
              </EmptyMedia>
              <EmptyHeader>
                <EmptyTitle>
                  {debouncedQuery !== ""
                    ? `Không có đơn khớp "${debouncedQuery}"`
                    : "Chưa có đơn đã xử lý"}
                </EmptyTitle>
              </EmptyHeader>
            </Empty>
          ) : (
            <ItemGroup className="gap-2">
              {orders.map((order) => (
                <ArchivedOrderRow
                  key={order.id}
                  order={order}
                  onViewBill={onViewBill}
                />
              ))}
            </ItemGroup>
          )}

          {/* Sentinel for IntersectionObserver-driven pagination. Always
              present so the observer instance survives content swaps; it
              just sits below the list and triggers `loadMore` when scrolled
              into view. */}
          <div ref={sentinelRef} aria-hidden className="h-px w-full" />

          {isLoadingMore ? (
            <div className="flex items-center justify-center py-3 text-sm text-muted-foreground">
              <Spinner data-icon="inline-start" />
              Đang tải thêm...
            </div>
          ) : !hasMore && orders.length > 0 ? (
            <div className="py-3 text-center text-sm text-muted-foreground">
              Đã hết lịch sử
            </div>
          ) : null}
        </div>
      </ScrollArea>
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent
          showHandle
          className="h-dvh max-h-dvh p-0 data-[vaul-drawer-direction=bottom]:top-0 data-[vaul-drawer-direction=bottom]:mt-0 data-[vaul-drawer-direction=bottom]:max-h-dvh before:inset-0 before:rounded-none before:border-0 before:bg-background"
        >
          <DrawerTitle className="sr-only">Đơn đã xử lý</DrawerTitle>
          <DrawerDescription className="sr-only">
            Danh sách hóa đơn đã thanh toán hoặc đã hủy.
          </DrawerDescription>
          {body}
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col p-0 sm:max-w-md"
      >
        <SheetHeader className="border-b px-5 pt-5 pb-3 text-left">
          <SheetTitle className="flex items-center gap-2">
            Đơn đã xử lý
            {orders.length > 0 ? (
              <Badge variant="secondary" className="text-xs">
                {orders.length}
                {hasMore ? "+" : ""}
              </Badge>
            ) : null}
          </SheetTitle>
        </SheetHeader>
        {body}
      </SheetContent>
    </Sheet>
  );
}

function ArchivedOrderRow({
  order,
  onViewBill,
}: {
  order: SessionOrder;
  onViewBill: (orderId: number, intent: "receipt") => void;
}) {
  return (
    <Item
      data-testid={`pos-archived-bill-${order.id}`}
      variant="outline"
      size="sm"
      role="button"
      tabIndex={0}
      aria-label={`Mở hóa đơn #${order.order_number}`}
      className="cursor-pointer bg-card transition-colors hover:bg-muted/50 focus-visible:bg-muted/50"
      onClick={() => onViewBill(order.id, "receipt")}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        onViewBill(order.id, "receipt");
      }}
    >
      <OrderCardSummary
        order={order}
        rightMeta={<OrderStatusBadge order={order} />}
      />
    </Item>
  );
}
