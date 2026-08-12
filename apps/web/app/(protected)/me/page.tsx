import Link from "next/link";
import {
  Calendar as IconCalendar,
  CalendarX as IconLeave,
  Camera as IconCamera,
  User as IconUser,
  Wallet as IconWallet,
} from "lucide-react";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { AppPage, AppPageHeader, AppSection } from "@/components/surface";
import { messages } from "@lib/messages";

const copy = messages.employee.home;

const HUB_LINKS = [
  {
    href: "/me/profile",
    title: copy.profileTitle,
    description: copy.profileDescription,
    icon: IconUser,
  },
  {
    href: "/me/schedule",
    title: copy.scheduleTitle,
    description: copy.scheduleDescription,
    icon: IconCalendar,
  },
  {
    href: "/me/schedule/leave",
    title: copy.leaveTitle,
    description: copy.leaveDescription,
    icon: IconLeave,
  },
  {
    href: "/me/payslip",
    title: copy.payslipTitle,
    description: copy.payslipLongDescription,
    icon: IconWallet,
  },
  {
    href: "/me/clock",
    title: copy.clockIn,
    description: copy.clockLongDescription,
    icon: IconCamera,
  },
] as const;

export default function SelfServicePage() {
  return (
    <AppPage density="compact" width="wide">
      <AppPageHeader
        title={copy.personalHubTitle}
        description={copy.personalHubDescription}
      />
      <AppSection headingLevel="h2">
        <ItemGroup className="grid gap-2">
          {HUB_LINKS.map((item) => {
            const Icon = item.icon;
            return (
              <Item
                key={item.href}
                size="sm"
                variant="outline"
                render={<Link href={item.href} />}
              >
                <ItemMedia variant="icon">
                  <Icon aria-hidden="true" className="size-5" />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle size="heading">{item.title}</ItemTitle>
                  <ItemDescription>{item.description}</ItemDescription>
                </ItemContent>
              </Item>
            );
          })}
        </ItemGroup>
      </AppSection>
    </AppPage>
  );
}
