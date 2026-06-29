import {
  CalendarDays,
  Clock,
  ListChecks,
  UserCircle,
} from "lucide-react";
import { MODULE_ACL } from "@comtammatu/shared/auth";
import { AppLinkCard, AppSection, LinkCardGrid } from "@/components/surface";
import { messages } from "@lib/messages";

export default async function OperatorShiftPage({
  params,
}: {
  params: Promise<{ branchId: string }>;
}) {
  const { branchId } = await params;
  const copy = messages.employee;

  return (
    <AppSection title={MODULE_ACL.employee.label}>
      <LinkCardGrid>
        <AppLinkCard
          href={`/br/${branchId}/shift/clock`}
          title={copy.home.clockPanelTitle}
          icon={<Clock />}
        />
        <AppLinkCard
          href={`/br/${branchId}/shift/tasks`}
          title={copy.home.workdayTitle}
          icon={<ListChecks />}
        />
        <AppLinkCard
          href={`/br/${branchId}/shift/schedule`}
          title={copy.nav.schedule}
          icon={<CalendarDays />}
        />
        <AppLinkCard
          href={`/br/${branchId}/shift/profile`}
          title={copy.nav.profileShort}
          icon={<UserCircle />}
        />
      </LinkCardGrid>
    </AppSection>
  );
}
