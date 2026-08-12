"use client";

import Link from "next/link";
import { Button } from "@comtammatu/ui/components/button";
import { WORK_TASK_CHIP } from "../../_lib/compose-styles";
import { workHref, type ParsedWorkParams } from "../../_lib/params";

export function WorkTaskChip({
  taskId,
  title,
  params,
}: {
  taskId: number;
  title: string;
  params: ParsedWorkParams;
}) {
  return (
    <Button
      variant="secondary"
      size="xs"
      className={WORK_TASK_CHIP}
      render={
        <Link href={workHref(params, { taskId })} scroll={false} />
      }
    >
      {title}
    </Button>
  );
}
