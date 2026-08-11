"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatVNDate } from "@comtammatu/shared/time";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
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
import {
  AppBackLink,
  AppDetailFooter,
  AppPage,
  AppPageHeader,
  AppSection,
  DescriptionList,
} from "@/components/surface";
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

export function WorkTaskDetail({
  task: initialTask,
  assigneeOptions,
  initialComments,
  initialChecklist,
}: {
  task: WorkTaskRow;
  assigneeOptions: AssigneeOption[];
  initialComments: WorkTaskCommentRow[];
  initialChecklist: WorkChecklistItemRow[];
}) {
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

  const assigneeLabel = useMemo(() => {
    if (!task.assigneeId) return "—";
    const match = assigneeOptions.find((option) => option.id === task.assigneeId);
    return match?.fullName ?? task.assigneeId;
  }, [assigneeOptions, task.assigneeId]);

  function handleMutationError(message: string) {
    if (message === workCopy.revisionConflict) {
      toast.error(message);
      router.refresh();
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
    });
  }

  return (
    <AppPage width="wide" density="compact" scroll>
      <AppPageHeader
        title={workCopy.detailTitle}
        description={task.title}
        actions={<AppBackLink href="/work">{workCopy.pageTitle}</AppBackLink>}
      />

      <AppSection title={workCopy.detailTitle}>
        <DescriptionList
          items={[
            { term: workCopy.assignee, description: assigneeLabel },
            {
              term: workCopy.due,
              description: task.dueAt ? formatVNDate(task.dueAt) : workCopy.noDue,
            },
          ]}
        />

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium">{workCopy.titleLabel}</span>
            <Input value={title} onChange={(event) => setTitle(event.target.value)} />
          </label>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium">{workCopy.priorityLabel}</span>
            <Select
              value={priority}
              onValueChange={(value) => setPriority(value as WorkTaskPriority)}
            >
              <SelectTrigger>
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
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={4}
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium">{workCopy.dueLabel}</span>
            <Input
              type="datetime-local"
              value={dueAt}
              onChange={(event) => setDueAt(event.target.value)}
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium">{workCopy.assignee}</span>
            <Select value={assigneeId} onValueChange={setAssigneeId}>
              <SelectTrigger>
                <SelectValue placeholder={workCopy.assignee} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{workCopy.clearAssignee}</SelectItem>
                {assigneeOptions.map((option) => (
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
              value={status}
              onValueChange={(value) => saveStatus(value as WorkTaskStatus)}
              disabled={isPending}
            >
              <SelectTrigger>
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
        {checklist.length === 0 ? (
          <p className="text-sm text-muted-foreground">{workCopy.checklistEmpty}</p>
        ) : (
          <ul className="space-y-2">
            {checklist.map((item) => (
              <li key={item.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={item.isDone}
                  disabled={isPending}
                  onChange={(event) => {
                    const isDone = event.target.checked;
                    startTransition(async () => {
                      const result = await upsertWorkChecklistItem({
                        taskId: task.id,
                        itemId: item.id,
                        title: item.title,
                        isDone,
                        sortOrder: item.sortOrder,
                      });
                      if (!result.success || !result.data) {
                        handleMutationError(
                          result.error ?? workCopy.checklistFailed,
                        );
                        return;
                      }
                      setChecklist((prev) =>
                        prev.map((row) =>
                          row.id === item.id ? result.data! : row,
                        ),
                      );
                    });
                  }}
                />
                <span className={item.isDone ? "line-through opacity-70" : undefined}>
                  {item.title}
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <Input
            value={checklistTitle}
            onChange={(event) => setChecklistTitle(event.target.value)}
            placeholder={workCopy.checklistPlaceholder}
          />
          <Button
            size="touch"
            variant="outline"
            disabled={isPending || checklistTitle.trim().length === 0}
            onClick={() => {
              const titleValue = checklistTitle.trim();
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
            }}
          >
            {workCopy.checklistAdd}
          </Button>
        </div>
      </AppSection>

      <AppSection title={workCopy.commentsTitle}>
        {comments.length === 0 ? (
          <p className="text-sm text-muted-foreground">{workCopy.commentsEmpty}</p>
        ) : (
          <ul className="space-y-3">
            {comments.map((comment) => (
              <li key={comment.id} className="rounded-md border p-3 text-sm">
                <p className="whitespace-pre-wrap">{comment.body}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatVNDate(comment.createdAt)}
                </p>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3 flex flex-col gap-2">
          <Textarea
            value={commentBody}
            onChange={(event) => setCommentBody(event.target.value)}
            placeholder={workCopy.commentPlaceholder}
            rows={3}
          />
          <Button
            size="touch"
            variant="outline"
            className="self-start"
            disabled={isPending || commentBody.trim().length === 0}
            onClick={() => {
              const body = commentBody.trim();
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
            }}
          >
            {workCopy.commentSubmit}
          </Button>
        </div>
      </AppSection>

      <AppDetailFooter
        leading={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">
              {workCopy.statusLabels[task.status]}
            </Badge>
            <Badge variant="secondary">
              {workCopy.priorityLabels[task.priority]}
            </Badge>
          </div>
        }
        trailing={
          <Button size="touch" disabled={isPending} onClick={saveFields}>
            {workCopy.save}
          </Button>
        }
      />
    </AppPage>
  );
}
