"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@comtammatu/ui/components/button";
import { useFormControlSize } from "@/components/form/control-size";
import { workCopy } from "@lib/messages/work";

export function WorkPageHeaderActions({
  canManage,
  children,
}: {
  canManage: boolean;
  children: ReactNode;
}) {
  const controlSize = useFormControlSize();

  return (
    <div className="flex flex-wrap items-center gap-2">
      {canManage ? (
        <Button
          variant="outline"
          size={controlSize}
          render={<Link href="/work/team" />}
        >
          {workCopy.teamNav}
        </Button>
      ) : null}
      {children}
    </div>
  );
}
