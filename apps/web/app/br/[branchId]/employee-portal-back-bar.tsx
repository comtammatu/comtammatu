import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";

export function EmployeePortalBackBar() {
  return (
    <header className="flex shrink-0 items-center border-b border-border bg-background px-2 py-1.5">
      <Button asChild variant="ghost" size="sm" className="h-8 gap-1.5 text-xs">
        <Link href="/employee">
          <ArrowLeft className="size-4 shrink-0" />
          Quay lại Cổng nhân viên
        </Link>
      </Button>
    </header>
  );
}
