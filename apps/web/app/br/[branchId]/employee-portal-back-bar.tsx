import { DoorOpen } from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";

export function EmployeePortalBackBar() {
  return (
    <header className="flex shrink-0 items-center border-b border-border bg-background px-2 py-1.5">
      <Button
        variant="ghost"
        size="sm"
        className="h-7 text-xs text-muted-foreground"
        asChild
      >
        <a href="/employee">
          <DoorOpen className="mr-1 size-3" />
          Quay lại Cổng nhân viên
        </a>
      </Button>
    </header>
  );
}
