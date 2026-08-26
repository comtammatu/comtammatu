/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: operator UI */
"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowRight as IconArrowRight,
  ClipboardCheck as IconClipboardCheck,
  Search as IconSearch,
} from "lucide-react";
import { formatPercent } from "@comtammatu/shared/format";
import { formatVNDate } from "@comtammatu/shared/time";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@comtammatu/ui/components/input-group";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { AppBackLink, AppEmptyState } from "@/components/surface";
import { StatusBadge } from "@/components/status-badge";
import {
  BranchOperatorPage,
  BranchOperatorPanel,
} from "@lib/branch-operator/components/branch-operator-page";
import { matchesSearch } from "@lib/search";
import {
  getBranchStocktakeProgress,
  type BranchStocktakeSession,
} from "@lib/inventory/stocktake-model";
import { messages } from "@lib/messages";

const stocktakeCopy = messages.inventory.stocktake;

export function BranchStocktakeListClient({
  branchId,
  branchName,
  canManage,
  sessions,
}: {
  branchId: number;
  branchName: string;
  canManage: boolean;
  sessions: BranchStocktakeSession[];
}) {
  const stockBasePath = `/br/${branchId}/stock`;
  const stocktakeBasePath = `${stockBasePath}/stocktake`;
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");

  const filteredSessions = useMemo(() => {
    const query = search.trim();
    return sessions.filter((session) => {
      if (status !== "all" && session.status !== status) return false;
      return !query || matchesSearch([`KK-${session.id}`], query);
    });
  }, [search, sessions, status]);
  const hasFilter = status !== "all" || search.trim().length > 0;
  const createAction = canManage ? (
    <Button
      size="touch"
      className="w-full"
      render={<Link href={`${stocktakeBasePath}/new`} />}
    >
      <IconClipboardCheck data-icon="inline-start" />
      {stocktakeCopy.openSession}
    </Button>
  ) : null;

  return (
    <BranchOperatorPage
      title={stocktakeCopy.title}
      description={branchName}
      back={<AppBackLink href={`/br/${branchId}/stock`} />}
    >
      <div className="flex min-w-0 touch-manipulation flex-col gap-3">
        {createAction}

        <BranchOperatorPanel
          title="Phiên kiểm kê"
          description="Mở hoặc tiếp tục một phiên kiểm kê của chi nhánh này."
          icon={IconClipboardCheck}
          size="sm"
          contentClassName="gap-3"
        >
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
            <InputGroup className="min-h-12 min-w-0 flex-1">
              <InputGroupAddon>
                <IconSearch />
              </InputGroupAddon>
              <InputGroupInput
                aria-label={stocktakeCopy.searchPlaceholder}
                autoComplete="off"
                inputMode="search"
                name="stocktake-search"
                placeholder={stocktakeCopy.searchPlaceholder}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </InputGroup>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger
                aria-label={stocktakeCopy.statusPlaceholder}
                size="touch"
                className="w-full sm:w-auto sm:min-w-48"
              >
                <SelectValue placeholder={stocktakeCopy.statusPlaceholder} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" size="touch">
                  {stocktakeCopy.allStatuses}
                </SelectItem>
                <SelectItem value="in_progress" size="touch">
                  Đang thực hiện
                </SelectItem>
                <SelectItem value="completed" size="touch">
                  Đã hoàn tất
                </SelectItem>
                <SelectItem value="cancelled" size="touch">
                  Đã hủy
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {sessions.length > 0 ? (
            <Badge variant="outline" className="w-fit rounded-full">
              {filteredSessions.length}/{sessions.length}
            </Badge>
          ) : null}

          {filteredSessions.length === 0 ? (
            <AppEmptyState
              compact
              mode={hasFilter ? "no-results" : "no-data"}
              icon={<IconClipboardCheck />}
              title={
                hasFilter
                  ? stocktakeCopy.noSessionsMatched
                  : stocktakeCopy.noSessions
              }
              description={hasFilter ? undefined : stocktakeCopy.noSessionsHint}
            />
          ) : (
            <ItemGroup className="gap-2" role="list">
              {filteredSessions.map((session) => {
                const progress = getBranchStocktakeProgress(session);
                return (
                  <div key={session.id} role="listitem">
                    <Item
                      variant="outline"
                      className="min-h-16 min-w-0 flex-nowrap touch-manipulation"
                      render={
                        <Link href={`${stocktakeBasePath}/${session.id}`} />
                      }
                    >
                      <ItemContent className="min-w-0 gap-1">
                        <div className="flex min-w-0 items-center gap-2">
                          <ItemTitle className="truncate font-mono text-sm font-semibold">
                            KK-{session.id}
                          </ItemTitle>
                          <StatusBadge
                            domain="inventory"
                            value={session.status}
                            size="sm"
                          />
                        </div>
                        <ItemDescription className="line-clamp-none text-xs">
                          {session.status === "in_progress"
                            ? `${progress.counted}/${progress.total} dòng đã đếm · ${formatPercent(progress.percent)}`
                            : formatVNDate(
                                session.completedAt ??
                                  session.startedAt ??
                                  session.createdAt,
                              )}
                        </ItemDescription>
                      </ItemContent>
                      <ItemActions className="self-center text-muted-foreground">
                        <IconArrowRight />
                      </ItemActions>
                    </Item>
                  </div>
                );
              })}
            </ItemGroup>
          )}
        </BranchOperatorPanel>
      </div>
    </BranchOperatorPage>
  );
}
