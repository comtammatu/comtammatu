import Link from "next/link";
import { ArrowRight as IconArrowRight } from "lucide-react";
import { canAccess, MODULE_ACL, type StaffRole } from "@comtammatu/shared/auth";
import { formatCount } from "@comtammatu/shared/format";
import { Badge } from "@comtammatu/ui/components/badge";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import {
  AppEmptyState,
  AppPage,
  AppPageHeader,
  AppSection,
} from "@/components/surface";
import type { ControlHomeAttentionItem } from "@/_lib/control-home-attention";
import type { TodayWorkState } from "@lib/staff-runtime/_lib/today-work-state";
import { messages } from "@lib/messages";
import { AppTodayCommandBar } from "./app-today-command-bar";

const copy = messages.controlSurface.dashboard;

const MINE_ATTENTION_IDS = new Set(["work:mine-due", "notifications:unread"]);

function AttentionQueue({
  title,
  items,
}: {
  title: string;
  items: ControlHomeAttentionItem[];
}) {
  if (items.length === 0) return null;

  return (
    <AppSection title={title} headingLevel="h2">
      <ItemGroup>
        {items.map((item) => (
          <Item
            key={item.id}
            variant="outline"
            size="sm"
            role="listitem"
            render={<Link href={item.href} />}
          >
            <ItemContent className="min-w-0">
              <ItemTitle className="line-clamp-none">
                {item.documentTitle ?? item.label}
              </ItemTitle>
              {item.documentTitle ? (
                <ItemDescription>{item.label}</ItemDescription>
              ) : null}
            </ItemContent>
            <ItemActions className="ml-auto shrink-0">
              <Badge
                variant={
                  item.tone === "destructive" ? "destructive" : "warning"
                }
              >
                {formatCount(item.count)}
              </Badge>
              <IconArrowRight className="size-4" aria-hidden />
            </ItemActions>
          </Item>
        ))}
      </ItemGroup>
    </AppSection>
  );
}

function WorkModulePulse({ dueCount }: { dueCount: number }) {
  return (
    <AppSection title={copy.modulesTitle} headingLevel="h2">
      <ItemGroup>
        <Item
          variant="outline"
          size="sm"
          role="listitem"
          render={<Link href={MODULE_ACL.work.path} />}
        >
          <ItemContent className="min-w-0">
            <ItemTitle className="line-clamp-none">
              {MODULE_ACL.work.label}
            </ItemTitle>
            <ItemDescription>{messages.work.inboxTitle}</ItemDescription>
          </ItemContent>
          <ItemActions className="ml-auto shrink-0">
            {dueCount > 0 ? (
              <Badge variant="warning">{formatCount(dueCount)}</Badge>
            ) : null}
            <IconArrowRight className="size-4" aria-hidden />
          </ItemActions>
        </Item>
      </ItemGroup>
    </AppSection>
  );
}

export function ControlSurfaceOverview({
  role,
  attention,
  todayWork,
}: {
  role: StaffRole;
  attention: ControlHomeAttentionItem[];
  todayWork: TodayWorkState | null;
}) {
  const showCommandBar =
    todayWork != null &&
    canAccess(role, "me") &&
    todayWork.attendanceRequired &&
    todayWork.status !== "missing_profile" &&
    todayWork.status !== "not_required";
  const showWorkPulse = canAccess(role, "work");
  const mine = attention.filter((item) => MINE_ATTENTION_IDS.has(item.id));
  const coordinate = attention.filter(
    (item) => !MINE_ATTENTION_IDS.has(item.id),
  );
  const workDueCount =
    mine.find((item) => item.id === "work:mine-due")?.count ?? 0;
  const showEmpty =
    !showCommandBar &&
    mine.length === 0 &&
    coordinate.length === 0 &&
    !showWorkPulse;

  return (
    <AppPage density="compact" width="wide">
      <AppPageHeader title={copy.title} />
      {showCommandBar ? <AppTodayCommandBar state={todayWork} /> : null}
      <AttentionQueue title={copy.mineTitle} items={mine} />
      <AttentionQueue title={copy.coordinateTitle} items={coordinate} />
      {showWorkPulse ? <WorkModulePulse dueCount={workDueCount} /> : null}
      {showEmpty ? (
        <AppEmptyState mode="no-data" title={copy.attentionEmpty} />
      ) : null}
    </AppPage>
  );
}
