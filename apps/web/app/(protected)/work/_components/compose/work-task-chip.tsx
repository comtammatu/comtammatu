"use client";

import Link from "next/link";
import { Button } from "@comtammatu/ui/components/button";
import { WORK_TASK_CHIP } from "../../_lib/compose-styles";

export function WorkTaskChip({
  taskId,
  title,
}: {
  taskId: number;
  title: string;
}) {
  return (
    <Button
      variant="secondary"
      size="xs"
      className={WORK_TASK_CHIP}
      render={<Link href={`/work/tasks/${taskId}`} />}
    >
      {title}
    </Button>
  );
}
