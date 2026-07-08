import { Skeleton } from "@comtammatu/ui/components/skeleton";
import { EmployeePanel } from "@lib/staff-runtime/components/staff-runtime-page";
import { APP_COPY_VI } from "@comtammatu/shared/labels";
import { messages } from "@lib/messages";

const branchCopy = messages.settings.branch;

export function HubTodayStatusSkeleton() {
  return (
    <EmployeePanel
      title={APP_COPY_VI.branchCommand}
      size="sm"
    >
      <div className="flex animate-pulse flex-col gap-3">
        <div className="flex items-center gap-3">
          <Skeleton className="size-12 rounded-md" />
          <div className="flex flex-col gap-2 flex-1">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-1/4" />
          </div>
        </div>
        <Skeleton className="h-10 w-full rounded-md" />
      </div>
    </EmployeePanel>
  );
}

export function HubQueueSkeleton() {
  return (
    <EmployeePanel
      title={branchCopy.queueTitle}
      size="sm"
    >
      <div className="flex flex-col gap-2">
        <Skeleton className="h-12 w-full rounded-md" />
        <Skeleton className="h-12 w-full rounded-md" />
      </div>
    </EmployeePanel>
  );
}

export function HubOverviewSkeleton() {
  return (
    <EmployeePanel
      title={branchCopy.hubOverviewTitle}
      size="sm"
    >
      <div className="grid grid-cols-2 gap-2">
        <Skeleton className="h-16 w-full rounded-md" />
        <Skeleton className="h-16 w-full rounded-md" />
      </div>
    </EmployeePanel>
  );
}
