"use client";

import { useEffect, useRef, useState } from "react";
import { AppEmptyState } from "@/components/surface";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Input } from "@comtammatu/ui/components/input";
import { ScrollArea } from "@comtammatu/ui/components/scroll-area";
import { Item, ItemFooter, ItemGroup } from "@comtammatu/ui/components/item";
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
import { messages } from "@lib/messages";
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

  const { orders, isLoading, isLoadingMore, hasMore, error, reload, loadMore } =
    useArchivedOrders({
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
            placeholder={messages.pos.archivedOrders.searchPlaceholder}
            className="h-10 pl-9 text-base"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            aria-label={messages.pos.archivedOrders.searchAria}
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
          size="touch"
          className="grid w-full grid-cols-2 gap-0"
        >
          <ToggleGroupItem
            value="session"
            className="justify-center font-semibold"
          >
            {messages.pos.archivedOrders.currentSession}
          </ToggleGroupItem>
          <ToggleGroupItem
            value="today"
            className="justify-center font-semibold"
          >
            {messages.pos.archivedOrders.branchToday}
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-2 px-3 py-3">
          {error !== null ? (
            <AppEmptyState
              title={messages.pos.archivedOrders.loadFailed}
              description={error}
              className="min-h-32"
              compact
            >
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
            </AppEmptyState>
          ) : isLoading ? (
            <AppEmptyState
              title={STATES_VI.loading}
              icon={<Spinner />}
              className="min-h-32"
              compact
            />
          ) : orders.length === 0 ? (
            <AppEmptyState
              title={
                debouncedQuery !== ""
                  ? messages.pos.archivedOrders.emptyMatch(debouncedQuery)
                  : messages.pos.archivedOrders.empty
              }
              icon={<IconReceipt />}
              className="min-h-32"
              compact
            />
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
              {messages.pos.archivedOrders.loadingMore}
            </div>
          ) : !hasMore && orders.length > 0 ? (
            <div className="py-3 text-center text-sm text-muted-foreground">
              {messages.pos.archivedOrders.end}
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
          <DrawerTitle className="sr-only">
            {messages.pos.archivedOrders.sheetTitle}
          </DrawerTitle>
          <DrawerDescription className="sr-only">
            {messages.pos.archivedOrders.description}
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
        className="p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-md"
      >
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {messages.pos.archivedOrders.sheetTitle}
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
      role="listitem"
      className="bg-card"
    >
      <OrderCardSummary
        order={order}
        rightMeta={<OrderStatusBadge order={order} />}
      />
      <ItemFooter className="mt-2 justify-end border-t border-border/60 pt-2">
        <Button
          type="button"
          variant="outline"
          size="touch"
          aria-label={messages.pos.archivedOrders.openReceiptAria(
            order.order_number,
          )}
          onClick={() => onViewBill(order.id, "receipt")}
        >
          <IconReceipt data-icon="inline-start" />
          {messages.pos.archivedOrders.viewReceipt}
        </Button>
      </ItemFooter>
    </Item>
  );
}
