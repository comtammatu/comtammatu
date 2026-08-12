"use client";

import Link from "next/link";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { useFormControlSize } from "@/components/form/control-size";
import { workCopy } from "@lib/messages/work";
import { workHref, type ParsedWorkParams } from "../../_lib/params";

export function WorkScopeLabel({
  params,
  departmentName,
  projectName,
}: {
  params: ParsedWorkParams;
  departmentName?: string | null;
  projectName?: string | null;
}) {
  const controlSize = useFormControlSize();
  const isScoped = projectName != null || departmentName != null;
  const label =
    projectName != null
      ? `${workCopy.scopeProject}: ${projectName}`
      : departmentName != null
        ? `${workCopy.scopeDepartment}: ${departmentName}`
        : workCopy.viewMine;

  const showChangeScope =
    params.view !== "mine" &&
    (isScoped || params.view === "board" || params.view === "timeline");

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant="secondary">{label}</Badge>
      {showChangeScope ? (
        <Button
          variant="ghost"
          size={controlSize}
          render={
            <Link
              href={workHref(params, {
                view: params.view,
                departmentId: null,
                projectId: null,
              })}
            />
          }
        >
          {workCopy.pickScope}
        </Button>
      ) : null}
    </div>
  );
}
