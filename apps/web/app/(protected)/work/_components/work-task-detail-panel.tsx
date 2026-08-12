"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { formatVNDate } from "@comtammatu/shared/time";
import { Button } from "@comtammatu/ui/components/button";
import { Frame } from "@comtammatu/ui/components/frame";
import { Input } from "@comtammatu/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { Textarea } from "@comtammatu/ui/components/textarea";
import { toast } from "@comtammatu/ui/components/sonner";
import { useFormControlSize } from "@/components/form/control-size";
import { AppDetailFooter, AppSection } from "@/components/surface";
import {
  addWorkTaskComment,
  setWorkTaskStatus,
  updateWorkTask,
  upsertWorkChecklistItem,
  type WorkChecklistItemRow,
  type WorkTaskCommentRow,
  type WorkTaskPriority,
  type WorkTaskRow,
  type WorkTaskStatus,
} from "../actions";
import {
  WORK_TASK_PRIORITIES,
  WORK_TASK_STATUSES,
  workCopy,
} from "@lib/messages/work";

type AssigneeOption = {
  id: string;
  fullName: string;
};

export type WorkTaskDetailFormOptions = {
  task: WorkTaskRow;
  assigneeOptions: AssigneeOption[];
  initialComments: WorkTaskCommentRow[];
  initialChecklist: WorkChecklistItemRow[];
  onSaved?: () => void;
};

function toDateTimeLocalValue(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const offsetMs = date.getTime() - date.getTimezoneOffset() * 60_000;
  return new Date(offsetMs).toISOString().slice(0, 16);
}

function fromDateTimeLocalValue(value: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

export function useWorkTaskDetailForm({
  task: initialTask,
  assigneeOptions: _assigneeOptions,
  initialComments,
  initialChecklist,
  onSaved,
}: WorkTaskDetailFormOptions) {
  const router = useRouter();
  const [task, setTask] = useState(initialTask);
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [priority, setPriority] = useState<WorkTaskPriority>(task.priority);
  const [status, setStatus] = useState<WorkTaskStatus>(task.status);
  const [dueAt, setDueAt] = useState(toDateTimeLocalValue(task.dueAt));
  const [assigneeId, setAssigneeId] = useState(task.assigneeId ?? "none");
  const [comments, setComments] = useState(initialComments);
  const [checklist, setChecklist] = useState(initialChecklist);
  const [commentBody, setCommentBody] = useState("");
  const [checklistTitle, setChecklistTitle] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleMutationError(message: string) {
    if (message === workCopy.revisionConflict) {
      toast.error(message);
      router.refresh();
      onSaved?.();
      return;
    }
    toast.error(message);
  }

  function saveFields() {
    startTransition(async () => {
      const clearAssignee = assigneeId === "none" && task.assigneeId != null;
      const nextDueAt = fromDateTimeLocalValue(dueAt);
      const clearDueAt = !dueAt && task.dueAt != null;

      const result = await updateWorkTask({
        taskId: task.id,
        expectedRevision: task.revision,
        title,
        description: description || undefined,
        priority,
        assigneeId: assigneeId !== "none" ? assigneeId : undefined,
        dueAt: nextDueAt,
        clearAssignee,
        clearDueAt,
      });

      if (!result.success || !result.data) {
        handleMutationError(result.error ?? workCopy.saveFailed);
        return;
      }

      setTask(result.data);
      setStatus(result.data.status);
      toast.success(workCopy.save);
      router.refresh();
      onSaved?.();
    });
  }

  function saveStatus(nextStatus: WorkTaskStatus) {
    setStatus(nextStatus);
    startTransition(async () => {
      const result = await setWorkTaskStatus({
        taskId: task.id,
        expectedRevision: task.revision,
        status: nextStatus,
      });
      if (!result.success || !result.data) {
        setStatus(task.status);
        handleMutationError(result.error ?? workCopy.saveFailed);
        return;
      }
      setTask(result.data);
      toast.success(workCopy.statusChange);
      router.refresh();
      onSaved?.();
    });
  }

  function addChecklistItem() {
    const titleValue = checklistTitle.trim();
    if (!titleValue) return;
    startTransition(async () => {
      const result = await upsertWorkChecklistItem({
        taskId: task.id,
        title: titleValue,
        isDone: false,
        sortOrder: checklist.length,
      });
      if (!result.success || !result.data) {
        handleMutationError(result.error ?? workCopy.checklistFailed);
        return;
      }
      setChecklist((prev) => [...prev, result.data!]);
      setChecklistTitle("");
    });
  }

  function toggleChecklistItem(
    item: WorkChecklistItemRow,
    isDone: boolean,
  ) {
    startTransition(async () => {
      const result = await upsertWorkChecklistItem({
        taskId: task.id,
        itemId: item.id,
        title: item.title,
        isDone,
        sortOrder: item.sortOrder,
      });
      if (!result.success || !result.data) {
        handleMutationError(result.error ?? workCopy.checklistFailed);
        return;
      }
      setChecklist((prev) =>
        prev.map((row) => (row.id === item.id ? result.data! : row)),
      );
    });
  }

  function submitComment() {
    const body = commentBody.trim();
    if (!body) return;
    startTransition(async () => {
      const result = await addWorkTaskComment({
        taskId: task.id,
        body,
      });
      if (!result.success || !result.data) {
        handleMutationError(result.error ?? workCopy.commentFailed);
        return;
      }
      setComments((prev) => [...prev, result.data!]);
      setCommentBody("");
    });
  }

  return {
    task,
    assigneeOptions: _assigneeOptions,
    title,
    setTitle,
    description,
    setDescription,
    priority,
    setPriority,
    status,
    dueAt,
    setDueAt,
    assigneeId,
    setAssigneeId,
    comments,
    checklist,
    commentBody,
    setCommentBody,
    checklistTitle,
    setChecklistTitle,
    isPending,
    saveFields,
    saveStatus,
    addChecklistItem,
    toggleChecklistItem,
    submitComment,
  };
}

export type WorkTaskDetailForm = ReturnType<typeof useWorkTaskDetailForm>;

export function WorkTaskDetailBody({ form }: { form: WorkTaskDetailForm }) {
  const controlSize = useFormControlSize();

  return (
    <div className="flex flex-col gap-4">
      <AppSection>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium">{workCopy.titleLabel}</span>
            <Input
              value={form.title}
              onChange={(event) => form.setTitle(event.target.value)}
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium">{workCopy.priorityLabel}</span>
            <Select
              value={form.priority}
              onValueChange={(value) =>
                form.setPriority(value as WorkTaskPriority)
              }
            >
              <SelectTrigger size={controlSize}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WORK_TASK_PRIORITIES.map((item) => (
                  <SelectItem key={item} value={item}>
                    {workCopy.priorityLabels[item]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          <label className="flex flex-col gap-1.5 text-sm md:col-span-2">
            <span className="font-medium">{workCopy.descriptionLabel}</span>
            <Textarea
              value={form.description}
              onChange={(event) => form.setDescription(event.target.value)}
              rows={4}
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium">{workCopy.dueLabel}</span>
            <Input
              type="datetime-local"
              value={form.dueAt}
              onChange={(event) => form.setDueAt(event.target.value)}
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium">{workCopy.assignee}</span>
            <Select
              value={form.assigneeId}
              onValueChange={form.setAssigneeId}
            >
              <SelectTrigger size={controlSize}>
                <SelectValue placeholder={workCopy.assignee} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{workCopy.clearAssignee}</SelectItem>
                {form.assigneeOptions.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.fullName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          <label className="flex flex-col gap-1.5 text-sm md:col-span-2">
            <span className="font-medium">{workCopy.statusLabel}</span>
            <Select
              value={form.status}
              onValueChange={(value) =>
                form.saveStatus(value as WorkTaskStatus)
              }
              disabled={form.isPending}
            >
              <SelectTrigger size={controlSize}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WORK_TASK_STATUSES.map((item) => (
                  <SelectItem key={item} value={item}>
                    {workCopy.statusLabels[item]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        </div>
      </AppSection>

      <AppSection title={workCopy.checklistTitle}>
        {form.checklist.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {workCopy.checklistEmpty}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {form.checklist.map((item) => (
              <li key={item.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={item.isDone}
                  disabled={form.isPending}
                  onChange={(event) =>
                    form.toggleChecklistItem(item, event.target.checked)
                  }
                />
                <span
                  className={
                    item.isDone ? "line-through opacity-70" : undefined
                  }
                >
                  {item.title}
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <Input
            value={form.checklistTitle}
            onChange={(event) => form.setChecklistTitle(event.target.value)}
            placeholder={workCopy.checklistPlaceholder}
          />
          <Button
            size={controlSize}
            variant="outline"
            disabled={form.isPending || form.checklistTitle.trim().length === 0}
            onClick={form.addChecklistItem}
          >
            {workCopy.checklistAdd}
          </Button>
        </div>
      </AppSection>

      <AppSection title={workCopy.commentsTitle}>
        {form.comments.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {workCopy.commentsEmpty}
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {form.comments.map((comment) => (
              <li key={comment.id}>
                <Frame className="p-3 text-sm">
                  <p className="whitespace-pre-wrap">{comment.body}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatVNDate(comment.createdAt)}
                  </p>
                </Frame>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3 flex flex-col gap-2">
          <Textarea
            value={form.commentBody}
            onChange={(event) => form.setCommentBody(event.target.value)}
            placeholder={workCopy.commentPlaceholder}
            rows={3}
          />
          <Button
            size={controlSize}
            variant="outline"
            className="self-start"
            disabled={form.isPending || form.commentBody.trim().length === 0}
            onClick={form.submitComment}
          >
            {workCopy.commentSubmit}
          </Button>
        </div>
      </AppSection>
    </div>
  );
}

export function WorkTaskDetailFooter({ form }: { form: WorkTaskDetailForm }) {
  const controlSize = useFormControlSize();

  return (
    <AppDetailFooter
      sticky
      trailing={
        <Button
          size={controlSize}
          disabled={form.isPending}
          onClick={form.saveFields}
        >
          {workCopy.save}
        </Button>
      }
    />
  );
}
