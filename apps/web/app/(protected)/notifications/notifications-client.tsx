"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CheckSquare as IconCheckSquare,
  Inbox as IconInbox,
  Package as IconPackage,
  Receipt as IconReceipt,
  Search as IconSearch,
  ShoppingBag as IconShoppingBag,
  Users as IconUsers,
} from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@comtammatu/ui/components/input-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { useNotifications } from "@/_hooks/use-notifications";
import {
  NotificationFeedFilter,
  NotificationList,
} from "@/_components/notification-list";
import { NotificationPopupControl } from "@/_components/notification-popup-control";
import {
  AppListFrame,
  AppPageHeader,
  AppSegmentedControl,
  type AppSegmentedOption,
} from "@/components/surface";
import { messages, m } from "@lib/messages";
import {
  OWNER_SHELL_BREAKPOINT,
  useIsMobile,
} from "@comtammatu/ui/hooks/use-mobile";
import type { NotificationItem as NotificationItemModel } from "./actions";

type NotificationCategory =
  | "all"
  | "actionable"
  | "pos"
  | "inventory"
  | "hr"
  | "finance";

type SeverityFilter = "all" | "critical" | "warning" | "info";

function categorizeNotification(
  item: NotificationItemModel,
): NotificationCategory[] {
  const categories: NotificationCategory[] = ["all"];
  const kind = item.kind;
  const isActionable =
    item.read_at === null &&
    Boolean(item.action_url);

  if (isActionable) {
    categories.push("actionable");
  }

  if (kind.startsWith("pos.") || kind.startsWith("order.")) {
    categories.push("pos");
  } else if (
    kind.startsWith("inventory.") ||
    kind.startsWith("procurement.") ||
    kind.startsWith("workflow.")
  ) {
    if (
      kind === "inventory.valuation_variance" ||
      kind === "inventory.valuation_reconciliation_failed"
    ) {
      categories.push("finance");
    } else {
      categories.push("inventory");
    }
  } else if (kind.startsWith("hr.") || kind.startsWith("attendance.")) {
    categories.push("hr");
  } else if (kind.startsWith("finance.")) {
    categories.push("finance");
  }

  return categories;
}

export function NotificationsClient({
  tenantId,
  branchId,
  backHref,
}: {
  tenantId: number;
  branchId: number | null;
  backHref: string | null;
}) {
  const isTouchLayout = useIsMobile(OWNER_SHELL_BREAKPOINT);
  const [selectedCategory, setSelectedCategory] =
    useState<NotificationCategory>("all");
  const [selectedSeverity, setSelectedSeverity] =
    useState<SeverityFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const {
    items,
    unreadCount,
    loading,
    loadingMore,
    hasMore,
    feedMode,
    markRead,
    markAll,
    loadMore,
    setFeedMode,
  } = useNotifications({ tenantId, branchId });

  const hasUnread = unreadCount > 0;

  const categoryCounts = useMemo(() => {
    const counts: Record<NotificationCategory, number> = {
      all: 0,
      actionable: 0,
      pos: 0,
      inventory: 0,
      hr: 0,
      finance: 0,
    };
    for (const item of items) {
      if (item.read_at === null) {
        const cats = categorizeNotification(item);
        for (const cat of cats) {
          counts[cat] = (counts[cat] ?? 0) + 1;
        }
      }
    }
    counts.all = unreadCount;
    return counts;
  }, [items, unreadCount]);

  const categoryOptions: AppSegmentedOption<NotificationCategory>[] = useMemo(
    () => [
      {
        value: "all",
        label: messages.notifications.categories.all,
        icon: IconInbox,
        count: categoryCounts.all > 0 ? categoryCounts.all : undefined,
      },
      {
        value: "actionable",
        label: messages.notifications.categories.actionable,
        icon: IconCheckSquare,
        count:
          categoryCounts.actionable > 0
            ? categoryCounts.actionable
            : undefined,
      },
      {
        value: "pos",
        label: messages.notifications.categories.pos,
        icon: IconShoppingBag,
        count: categoryCounts.pos > 0 ? categoryCounts.pos : undefined,
      },
      {
        value: "inventory",
        label: messages.notifications.categories.inventory,
        icon: IconPackage,
        count:
          categoryCounts.inventory > 0
            ? categoryCounts.inventory
            : undefined,
      },
      {
        value: "hr",
        label: messages.notifications.categories.hr,
        icon: IconUsers,
        count: categoryCounts.hr > 0 ? categoryCounts.hr : undefined,
      },
      {
        value: "finance",
        label: messages.notifications.categories.finance,
        icon: IconReceipt,
        count: categoryCounts.finance > 0 ? categoryCounts.finance : undefined,
      },
    ],
    [categoryCounts],
  );

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (selectedCategory !== "all") {
        const cats = categorizeNotification(item);
        if (!cats.includes(selectedCategory)) return false;
      }
      if (selectedSeverity !== "all" && item.severity !== selectedSeverity) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchTitle = item.title.toLowerCase().includes(q);
        const matchBody = item.body?.toLowerCase().includes(q) ?? false;
        const matchKind = item.kind.toLowerCase().includes(q);
        const matchEntity = item.entity_id
          ? String(item.entity_id).includes(q)
          : false;
        if (!matchTitle && !matchBody && !matchKind && !matchEntity) {
          return false;
        }
      }
      return true;
    });
  }, [items, selectedCategory, selectedSeverity, searchQuery]);

  return (
    <div className="flex flex-col gap-4">
      <AppPageHeader
        title={messages.notifications.pageTitle}
        description={
          hasUnread
            ? m(messages.notifications.pageDescriptionUnread, {
                count: unreadCount,
              })
            : messages.notifications.pageDescription
        }
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            {hasUnread ? (
              <Button
                type="button"
                variant="outline"
                size={isTouchLayout ? "touch" : "lg"}
                onClick={markAll}
              >
                {messages.notifications.markAllRead}
              </Button>
            ) : null}
            {backHref ? (
              <Button
                variant="outline"
                size={isTouchLayout ? "touch" : "lg"}
                render={<Link href={backHref} />}
              >
                <ArrowLeft data-icon="inline-start" />
                {messages.notifications.back}
              </Button>
            ) : null}
          </div>
        }
      />

      {/* Domain Category Triage Navigation */}
      <div className="overflow-x-auto pb-1">
        <AppSegmentedControl<NotificationCategory>
          value={selectedCategory}
          options={categoryOptions}
          onChange={setSelectedCategory}
          size={isTouchLayout ? "default" : "sm"}
          aria-label={messages.notifications.categoryAriaLabel}
        />
      </div>

      <AppListFrame
        toolbar={
          <div className="flex flex-col gap-3 px-3 py-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <NotificationFeedFilter
                  feedMode={feedMode}
                  unreadCount={unreadCount}
                  onFeedModeChange={setFeedMode}
                />
                <Select
                  value={selectedSeverity}
                  onValueChange={(val) =>
                    setSelectedSeverity(val as SeverityFilter)
                  }
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder={messages.notifications.severityAll} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{messages.notifications.severityAll}</SelectItem>
                    <SelectItem value="critical">{messages.notifications.severity.critical}</SelectItem>
                    <SelectItem value="warning">{messages.notifications.severity.warning}</SelectItem>
                    <SelectItem value="info">{messages.notifications.severity.info}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <NotificationPopupControl compact />
            </div>
            {/* Quick Search */}
            <InputGroup size="field" className="w-full sm:max-w-xs">
              <InputGroupAddon>
                <IconSearch aria-hidden />
              </InputGroupAddon>
              <InputGroupInput
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={messages.notifications.searchPlaceholder}
              />
            </InputGroup>
          </div>
        }
      >
        <div className="px-3 pb-3">
          <NotificationList
            items={filteredItems}
            unreadCount={unreadCount}
            loading={loading}
            loadingMore={loadingMore}
            hasMore={hasMore}
            feedMode={feedMode}
            onRead={markRead}
            onMarkAll={markAll}
            onLoadMore={loadMore}
            showViewAll={false}
            showPanelHeader={false}
            showFilterBar={false}
          />
        </div>
      </AppListFrame>
    </div>
  );
}
