import Link from "next/link";
import { ArrowRight as IconArrowRight } from "lucide-react";
import { canAccess, type StaffRole } from "@comtammatu/shared/auth";
import { formatCount } from "@comtammatu/shared/format";
import { Badge } from "@comtammatu/ui/components/badge";
import {
  Item,
  ItemActions,
  ItemContent,
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

function AttentionQueue({ items }: { items: ControlHomeAttentionItem[] }) {
  return (
    <AppSection
      title={copy.attentionTitle}
      description={copy.description}
      headingLevel="h2"
    >
      {items.length === 0 ? (
        <AppEmptyState mode="no-data" title={copy.attentionEmpty} />
      ) : (
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
              </ItemContent>
              <ItemActions className="ml-auto">
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
      )}
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

  return (
    <AppPage density="compact" width="wide">
      <AppPageHeader title={copy.title} description={copy.description} />
      {showCommandBar ? <AppTodayCommandBar state={todayWork} /> : null}
      <AttentionQueue items={attention} />
    </AppPage>
  );
}
