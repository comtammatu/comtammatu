"use client";

import { useRouter } from "next/navigation";
import { StatusBadge } from "@/components/status-badge";
import { AppDialog } from "@/components/form";
import { AppEmptyState } from "@/components/surface";
import { workCopy } from "@lib/messages/work";
import type {
  WorkChecklistItemRow,
  WorkTaskCommentRow,
  WorkTaskRow,
} from "../actions";
import { workHref, type ParsedWorkParams } from "../_lib/params";
import { WorkTaskDetailPanel } from "./work-task-detail-panel";

export type WorkTaskDetailPayload = {
  task: WorkTaskRow;
  assigneeOptions: Array<{ id: string; fullName: string }>;
  comments: WorkTaskCommentRow[];
  checklist: WorkChecklistItemRow[];
};

export function WorkTaskDetailDialogHost({
  params,
  detail,
  loadError,
}: {
  params: ParsedWorkParams;
  detail: WorkTaskDetailPayload | null;
  loadError: string | null;
}) {
  const router = useRouter();
  const open = params.taskId != null;

  function closeDialog() {
    router.replace(workHref(params, { taskId: null }));
  }

  return (
    <AppDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) closeDialog();
      }}
      variant="document"
      title={
        detail ? (
          <div className="flex flex-wrap items-center gap-2">
            <span>{detail.task.title}</span>
            <StatusBadge domain="work-task" value={detail.task.status} />
          </div>
        ) : (
          workCopy.detailTitle
        )
      }
      description={workCopy.detailTitle}
    >
      {loadError ? (
        <AppEmptyState mode="error" description={loadError} />
      ) : detail ? (
        <WorkTaskDetailPanel
          task={detail.task}
          assigneeOptions={detail.assigneeOptions}
          initialComments={detail.comments}
          initialChecklist={detail.checklist}
          onSaved={() => router.refresh()}
        />
      ) : open ? (
        <AppEmptyState mode="no-data" description={workCopy.loadFailed} compact />
      ) : null}
    </AppDialog>
  );
}
