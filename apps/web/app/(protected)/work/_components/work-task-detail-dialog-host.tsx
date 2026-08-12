"use client";

import { useRouter } from "next/navigation";
import { ACTIONS_VI } from "@comtammatu/shared/messages";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { StatusBadge } from "@/components/status-badge";
import { AppDialog } from "@/components/form";
import { AppDetailFooter, AppEmptyState } from "@/components/surface";
import { workCopy } from "@lib/messages/work";
import type {
  WorkChecklistItemRow,
  WorkTaskCommentRow,
  WorkTaskRow,
} from "../actions";
import { workHref, type ParsedWorkParams } from "../_lib/params";
import {
  useWorkTaskDetailForm,
  WorkTaskDetailBody,
  WorkTaskDetailFooter,
} from "./work-task-detail-panel";

export type WorkTaskDetailPayload = {
  task: WorkTaskRow;
  assigneeOptions: Array<{ id: string; fullName: string }>;
  comments: WorkTaskCommentRow[];
  checklist: WorkChecklistItemRow[];
};

function WorkTaskDetailCloseFooter({ onClose }: { onClose: () => void }) {
  return (
    <AppDetailFooter
      sticky
      trailing={
        <Button type="button" onClick={onClose}>
          {ACTIONS_VI.close}
        </Button>
      }
    />
  );
}

function WorkTaskDetailDocumentDialog({
  detail,
  onClose,
  onSaved,
}: {
  detail: WorkTaskDetailPayload;
  onClose: () => void;
  onSaved: () => void;
}) {
  const form = useWorkTaskDetailForm({
    task: detail.task,
    assigneeOptions: detail.assigneeOptions,
    initialComments: detail.comments,
    initialChecklist: detail.checklist,
    onSaved,
  });

  return (
    <AppDialog
      open
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
      variant="document"
      title={
        <div className="flex flex-wrap items-center gap-2">
          <span>{detail.task.title}</span>
          <StatusBadge domain="work-task" value={detail.task.status} />
          <Badge variant="secondary">
            {workCopy.priorityLabels[detail.task.priority]}
          </Badge>
        </div>
      }
      footer={<WorkTaskDetailFooter form={form} />}
    >
      <WorkTaskDetailBody form={form} />
    </AppDialog>
  );
}

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

  if (!open) return null;

  if (loadError != null) {
    return (
      <AppDialog
        open
        onOpenChange={(nextOpen) => {
          if (!nextOpen) closeDialog();
        }}
        variant="document"
        title={workCopy.detailTitle}
        footer={<WorkTaskDetailCloseFooter onClose={closeDialog} />}
      >
        <AppEmptyState mode="error" description={loadError} />
      </AppDialog>
    );
  }

  if (detail == null) {
    return (
      <AppDialog
        open
        onOpenChange={(nextOpen) => {
          if (!nextOpen) closeDialog();
        }}
        variant="document"
        title={workCopy.detailTitle}
        footer={<WorkTaskDetailCloseFooter onClose={closeDialog} />}
      >
        <AppEmptyState mode="no-data" description={workCopy.loadFailed} compact />
      </AppDialog>
    );
  }

  return (
    <WorkTaskDetailDocumentDialog
      detail={detail}
      onClose={closeDialog}
      onSaved={() => router.refresh()}
    />
  );
}
