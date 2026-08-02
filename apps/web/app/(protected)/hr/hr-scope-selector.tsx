"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Building2 as IconBuilding } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import type { BranchOption } from "./_types";
import { messages } from "@lib/messages";
import { resolveHrBranchScope } from "@/lib/hr-scope";

type Props = {
  branches: BranchOption[];
  value?: string;
};

export function HrScopeSelector({ branches, value }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const current = resolveHrBranchScope(value, branches);
  const copy = messages.hr.client.scope;

  useEffect(() => {
    const requested = searchParams.get("branch");
    if (requested == null || requested === current) return;
    const next = new URLSearchParams(searchParams.toString());
    next.set("branch", current);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }, [current, pathname, router, searchParams]);

  return (
    <div className="flex min-w-56 items-center gap-2">
      <span className="shrink-0 text-sm text-muted-foreground">
        {copy.label}
      </span>
      <Select
        value={current}
        onValueChange={(nextValue) => {
          const next = new URLSearchParams(searchParams.toString());
          next.set("branch", nextValue);
          next.delete("employee");
          next.delete("day");
          next.delete("calendar");
          router.replace(`${pathname}?${next.toString()}`, { scroll: false });
        }}
      >
        <SelectTrigger size="touch" aria-label={copy.ariaLabel}>
          <IconBuilding className="size-4" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{copy.all}</SelectItem>
          <SelectItem value="office">{copy.office}</SelectItem>
          {branches.map((branch) => (
            <SelectItem key={branch.id} value={String(branch.id)}>
              {branch.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
