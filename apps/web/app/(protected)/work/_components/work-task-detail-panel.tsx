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
import {
  Download as IconDownload,
  ExternalLink as IconExternalLink,
  FileText as IconFileText,
  Paperclip as IconPaperclip,
  Trash2 as IconTrash2,
  X as IconX,
} from "lucide-react";
import { Badge } from "@comtammatu/ui/components/badge";
import { MultiSelectCombobox } from "@/components/form";
import { useFormControlSize } from "@/components/form/control-size";
import { confirm } from "@/components/confirm-dialog";
import {
  AppDetailFooter,
  AppInspectorGrid,
  AppInspectorMain,
  AppInspectorRow,
  AppInspectorSection,
  AppInspectorSidebar,
} from "@/components/surface";
import {
  addWorkTaskComment,
  deleteWorkTaskAttachment,
  setWorkTaskStatus,
  updateWorkTask,
  uploadWorkTaskAttachmentFile,
  upsertWorkChecklistItem,
  type WorkChecklistItemRow,
  type WorkTaskAttachmentRow,
  type WorkTaskCommentRow,
  type WorkTaskPriority,
  type WorkTaskRow,
  type WorkTaskStatus,
} from "../actions";
import { resolveWorkTaskDocumentLink } from "../_lib/document-links";
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
  initialAssigneeIds?: string[];
  initialSupporterIds?: string[];
  initialComments: WorkTaskCommentRow[];
  initialChecklist: WorkChecklistItemRow[];
  initialAttachments?: WorkTaskAttachmentRow[];
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
  initialAssigneeIds,
  initialSupporterIds,
  initialComments,
  initialChecklist,
  initialAttachments,
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
  const [assigneeIds, setAssigneeIds] = useState<string[]>(
    initialAssigneeIds ?? (task.assigneeId ? [task.assigneeId] : []),
  );
  const [supporterIds, setSupporterIds] = useState<string[]>(
    initialSupporterIds ?? [],
  );
  const [comments, setComments] = useState(initialComments);
  const [checklist, setChecklist] = useState(initialChecklist);
  const [attachments, setAttachments] = useState<WorkTaskAttachmentRow[]>(
    initialAttachments ?? [],
  );
  const [isUploadingAttachment, setIsUploadingAttachment] = useState(false);
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
      const clearAssignee =
        (assigneeIds.length === 0 || assigneeId === "none") &&
        task.assigneeId != null;
      const nextDueAt = fromDateTimeLocalValue(dueAt);
      const clearDueAt = !dueAt && task.dueAt != null;

      const result = await updateWorkTask({
        taskId: task.id,
        expectedRevision: task.revision,
        title,
        description: description || undefined,
        priority,
        assigneeIds,
        supporterIds,
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

  async function handleUploadFile(file: File) {
    setIsUploadingAttachment(true);
    try {
      const formData = new FormData();
      formData.append("taskId", String(task.id));
      formData.append("file", file);
      const res = await uploadWorkTaskAttachmentFile(formData);
      if (!res.success || !res.data) {
        toast.error(res.error ?? workCopy.attachmentUploadFailed);
        return;
      }
      setAttachments((prev) => [...prev, res.data!]);
      toast.success(workCopy.attachmentUpload);
      router.refresh();
      onSaved?.();
    } catch {
      toast.error(workCopy.attachmentUploadFailed);
    } finally {
      setIsUploadingAttachment(false);
    }
  }

  function handleDeleteAttachment(attachmentId: number) {
    startTransition(async () => {
      const res = await deleteWorkTaskAttachment({
        taskId: task.id,
        attachmentId,
      });
      if (!res.success) {
        handleMutationError(res.error ?? workCopy.attachmentDeleteFailed);
        return;
      }
      setAttachments((prev) => prev.filter((a) => a.id !== attachmentId));
      toast.success(workCopy.attachmentDelete);
      router.refresh();
      onSaved?.();
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
    assigneeIds,
    setAssigneeIds,
    supporterIds,
    setSupporterIds,
    comments,
    checklist,
    attachments,
    isUploadingAttachment,
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
    handleUploadFile,
    handleDeleteAttachment,
  };
}

export type WorkTaskDetailForm = ReturnType<typeof useWorkTaskDetailForm>;

export function WorkTaskDetailBody({ form }: { form: WorkTaskDetailForm }) {
  const controlSize = useFormControlSize();
  const docLink = resolveWorkTaskDocumentLink({
    title: form.title,
    description: form.description,
  });

  return (
    <AppInspectorGrid ratio="wide-main">
      {/* Main Content Column */}
      <AppInspectorMain>
        {docLink ? (
          <Frame className="flex items-center justify-between gap-3 border-primary/20 bg-primary/10 p-3 text-sm">
            <div className="flex items-center gap-2">
              <IconFileText className="size-4 shrink-0 text-primary" />
              <div>
                <span className="block text-xs font-semibold uppercase tracking-wider text-primary">
                  {workCopy.relatedDocument}
                </span>
                <span className="font-medium">{docLink.label}</span>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              render={<a href={docLink.href} target="_blank" rel="noreferrer" />}
            >
              <span>{docLink.label}</span>
              <IconExternalLink className="size-3.5" />
            </Button>
          </Frame>
        ) : null}

        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {workCopy.titleLabel}
            </span>
            <Input
              value={form.title}
              onChange={(event) => form.setTitle(event.target.value)}
              className="text-base font-semibold"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {workCopy.descriptionLabel}
            </span>
            <Textarea
              value={form.description}
              onChange={(event) => form.setDescription(event.target.value)}
              rows={4}
              className="resize-y"
            />
          </label>
        </div>

        <Frame className="flex flex-col gap-3 bg-muted/30 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">
                {workCopy.checklistTitle}
              </span>
              {form.checklist.length > 0 ? (
                <Badge variant="secondary" className="font-mono text-2xs">
                  {form.checklist.filter((i) => i.isDone).length}/
                  {form.checklist.length}
                </Badge>
              ) : null}
            </div>
          </div>

          {form.checklist.length === 0 ? (
            <p className="text-xs text-muted-foreground">
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
                      item.isDone
                        ? "line-through text-muted-foreground"
                        : undefined
                    }
                  >
                    {item.title}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={form.checklistTitle}
              onChange={(event) => form.setChecklistTitle(event.target.value)}
              placeholder={workCopy.checklistPlaceholder}
              className="bg-background"
            />
            <Button
              size={controlSize}
              variant="outline"
              disabled={
                form.isPending || form.checklistTitle.trim().length === 0
              }
              onClick={form.addChecklistItem}
            >
              {workCopy.checklistAdd}
            </Button>
          </div>
        </Frame>

        <Frame className="flex flex-col gap-3 bg-muted/30 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">
                {workCopy.attachmentsTitle}
              </span>
              {form.attachments.length > 0 ? (
                <Badge variant="secondary" className="font-mono text-2xs">
                  {form.attachments.length}
                </Badge>
              ) : null}
            </div>
            <label className="inline-flex cursor-pointer items-center gap-2">
              <input
                type="file"
                accept="image/*,.pdf"
                className="sr-only"
                disabled={form.isUploadingAttachment}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    form.handleUploadFile(file);
                    e.target.value = "";
                  }
                }}
              />
              <Button
                size={controlSize}
                variant="outline"
                disabled={form.isUploadingAttachment}
                className="pointer-events-none gap-2"
              >
                <IconPaperclip className="size-4" />
                <span>
                  {form.isUploadingAttachment
                    ? workCopy.attachmentUploading
                    : workCopy.attachmentUpload}
                </span>
              </Button>
            </label>
          </div>

          {form.attachments.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {workCopy.attachmentsEmpty}
            </p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {form.attachments.map((item) => {
                const isImg =
                  item.contentType?.startsWith("image/") ||
                  /\.(jpe?g|png|webp|heic)$/i.test(item.storagePath);
                return (
                  <Frame
                    key={item.id}
                    className="flex items-center justify-between gap-2 bg-background p-2"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      {isImg ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={item.storagePath}
                          alt={item.fileName}
                          className="size-10 shrink-0 rounded border border-border object-cover"
                        />
                      ) : (
                        <div className="flex size-10 shrink-0 items-center justify-center rounded bg-muted text-xs font-semibold text-muted-foreground">
                          FILE
                        </div>
                      )}
                      <div className="min-w-0 flex-1 text-xs">
                        <a
                          href={item.storagePath}
                          target="_blank"
                          rel="noreferrer"
                          className="block truncate font-medium hover:underline"
                        >
                          {item.fileName}
                        </a>
                        <span className="font-mono text-2xs text-muted-foreground">
                          {formatVNDate(item.createdAt)}
                        </span>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="text-muted-foreground hover:text-foreground"
                        aria-label={workCopy.attachmentDownload}
                        render={
                          <a
                            href={item.storagePath}
                            target="_blank"
                            rel="noreferrer"
                            download
                          />
                        }
                      >
                        <IconDownload className="size-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="text-destructive hover:bg-destructive/10"
                        aria-label={workCopy.attachmentDelete}
                        disabled={form.isPending}
                        onClick={async () => {
                          const ok = await confirm({
                            title: workCopy.attachmentDelete,
                            description: workCopy.attachmentDeleteConfirm,
                            confirmText: workCopy.attachmentDelete,
                            variant: "destructive",
                          });
                          if (!ok) return;
                          form.handleDeleteAttachment(item.id);
                        }}
                      >
                        <IconTrash2 className="size-4" />
                      </Button>
                    </div>
                  </Frame>
                );
              })}
            </div>
          )}
        </Frame>

        <Frame className="flex flex-col gap-3 bg-muted/30 p-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">
              {workCopy.commentsTitle}
            </span>
            {form.comments.length > 0 ? (
              <Badge variant="secondary" className="font-mono text-2xs">
                {form.comments.length}
              </Badge>
            ) : null}
          </div>

          {form.comments.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {workCopy.commentsEmpty}
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {form.comments.map((comment) => (
                <li key={comment.id}>
                  <Frame className="bg-background p-3 text-sm">
                    <p className="whitespace-pre-wrap">{comment.body}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatVNDate(comment.createdAt)}
                    </p>
                  </Frame>
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-col gap-2">
            <Textarea
              value={form.commentBody}
              onChange={(event) => form.setCommentBody(event.target.value)}
              placeholder={workCopy.commentPlaceholder}
              rows={3}
              className="bg-background"
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
        </Frame>
      </AppInspectorMain>

      {/* Sidebar Inspector Column */}
      <AppInspectorSidebar>
        <AppInspectorSection
          eyebrow={`${workCopy.statusLabel} & ${workCopy.priorityLabel}`}
        >
          <AppInspectorRow label={workCopy.statusLabel}>
            <Select
              value={form.status}
              onValueChange={(value) =>
                form.saveStatus(value as WorkTaskStatus)
              }
              disabled={form.isPending}
            >
              <SelectTrigger size={controlSize} className="bg-background">
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
          </AppInspectorRow>

          <AppInspectorRow label={workCopy.priorityLabel}>
            <Select
              value={form.priority}
              onValueChange={(value) =>
                form.setPriority(value as WorkTaskPriority)
              }
            >
              <SelectTrigger size={controlSize} className="bg-background">
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
          </AppInspectorRow>

          {/* Multi-assignees */}
          <AppInspectorRow label={workCopy.assignees}>
            <div className="flex flex-col gap-1.5 w-full">
              <div className="flex flex-wrap items-center gap-1 min-h-7">
                {form.assigneeIds.length === 0 ? (
                  <span className="text-xs text-muted-foreground italic">
                    {workCopy.noAssignee}
                  </span>
                ) : (
                  form.assigneeIds.map((id) => {
                    const option = form.assigneeOptions.find((o) => o.id === id);
                    const name = option?.fullName ?? id;
                    return (
                      <Badge
                        key={id}
                        variant="secondary"
                        className="gap-1 pr-1 text-xs"
                      >
                        <span>{name}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          aria-label={`${workCopy.clearAssignee}: ${name}`}
                          className="-mr-1 ml-0.5 size-4"
                          disabled={form.isPending}
                          onClick={() =>
                            form.setAssigneeIds((prev) =>
                              prev.filter((v) => v !== id),
                            )
                          }
                        >
                          <IconX className="size-3" />
                        </Button>
                      </Badge>
                    );
                  })
                )}
              </div>
              <MultiSelectCombobox
                options={form.assigneeOptions
                  .filter((o) => !form.supporterIds.includes(o.id))
                  .map((o) => ({
                    value: o.id,
                    label: o.fullName,
                    alreadySelected: form.assigneeIds.includes(o.id),
                  }))}
                triggerLabel={workCopy.addAssignee}
                confirmLabel={(count) =>
                  count > 0
                    ? `${workCopy.addAssignee} (${count})`
                    : workCopy.addAssignee
                }
                searchPlaceholder={workCopy.teamAddSearchPlaceholder}
                disabled={form.isPending}
                onConfirm={(values) =>
                  form.setAssigneeIds((prev) =>
                    Array.from(new Set([...prev, ...values])),
                  )
                }
              />
            </div>
          </AppInspectorRow>

          {/* Multi-supporters */}
          <AppInspectorRow label={workCopy.supporterLabel}>
            <div className="flex flex-col gap-1.5 w-full">
              <div className="flex flex-wrap items-center gap-1 min-h-7">
                {form.supporterIds.length === 0 ? (
                  <span className="text-xs text-muted-foreground italic">
                    {workCopy.noSupporter}
                  </span>
                ) : (
                  form.supporterIds.map((id) => {
                    const option = form.assigneeOptions.find((o) => o.id === id);
                    const name = option?.fullName ?? id;
                    return (
                      <Badge
                        key={id}
                        variant="secondary"
                        className="gap-1 pr-1 text-xs"
                      >
                        <span>{name}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          aria-label={`${workCopy.clearSupporter}: ${name}`}
                          className="-mr-1 ml-0.5 size-4"
                          disabled={form.isPending}
                          onClick={() =>
                            form.setSupporterIds((prev) =>
                              prev.filter((v) => v !== id),
                            )
                          }
                        >
                          <IconX className="size-3" />
                        </Button>
                      </Badge>
                    );
                  })
                )}
              </div>
              <MultiSelectCombobox
                options={form.assigneeOptions
                  .filter((o) => !form.assigneeIds.includes(o.id))
                  .map((o) => ({
                    value: o.id,
                    label: o.fullName,
                    alreadySelected: form.supporterIds.includes(o.id),
                  }))}
                triggerLabel={workCopy.addSupporter}
                confirmLabel={(count) =>
                  count > 0
                    ? `${workCopy.addSupporter} (${count})`
                    : workCopy.addSupporter
                }
                searchPlaceholder={workCopy.teamAddSearchPlaceholder}
                disabled={form.isPending}
                onConfirm={(values) =>
                  form.setSupporterIds((prev) =>
                    Array.from(new Set([...prev, ...values])),
                  )
                }
              />
            </div>
          </AppInspectorRow>

          <AppInspectorRow label={workCopy.dueLabel}>
            <Input
              type="datetime-local"
              value={form.dueAt}
              onChange={(event) => form.setDueAt(event.target.value)}
              className="bg-background"
            />
          </AppInspectorRow>
        </AppInspectorSection>
      </AppInspectorSidebar>
    </AppInspectorGrid>
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
