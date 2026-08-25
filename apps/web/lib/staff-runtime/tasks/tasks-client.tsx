"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Camera as IconCamera,
  ClipboardList as IconCount,
  LogOut as IconLogout,
} from "lucide-react";
import { cn } from "@comtammatu/ui";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Checkbox } from "@comtammatu/ui/components/checkbox";
import { Label } from "@comtammatu/ui/components/label";
import { Spinner } from "@comtammatu/ui/components/spinner";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { toast } from "@comtammatu/ui/components/sonner";
import { AppDialog } from "@/components/form";
import { AppSheet } from "@/components/surface";
import { messages } from "@lib/messages";
import { isRequiredChecklistItemComplete } from "../_lib/checklist-complete";
import { isShiftCountDutyItem } from "../_lib/count-duty";
import type { TodayChecklistItem } from "../_lib/today-work-state";
import {
  MAX_CLOCK_PHOTO_BYTES,
  MAX_UPLOAD_SOURCE_BYTES,
  UPLOAD_PHOTO_ACCEPT,
  isEligiblePhotoFile,
  normalizePhotoFile,
} from "../_lib/shift-photo";
import { useLiveCamera } from "../_lib/use-live-camera";
import {
  attachChecklistTaskPhoto,
  getEmployeeTaskPhotoUrl,
  toggleChecklistItem,
} from "../clock/actions";

const taskCopy = messages.employee.tasks;
const homeCopy = messages.employee.home;
const CHECKLIST_PHASES = ["start_of_shift", "end_of_shift"] as const;

interface TasksClientProps {
  items: TodayChecklistItem[];
  disabled?: boolean;
  countHref: string;
  checkoutHref?: string;
  checkoutLabel?: string;
  hideCountTask?: boolean;
}

function sortPhaseItems(items: TodayChecklistItem[]) {
  return [...items].sort((left, right) => {
    if (left.done !== right.done) return left.done ? 1 : -1;
    if (left.isRequired !== right.isRequired) return left.isRequired ? -1 : 1;
    return left.sortOrder - right.sortOrder;
  });
}

function TaskPhotoSheet({
  item,
  disabled,
  onClose,
  onCaptured,
}: {
  item: TodayChecklistItem | null;
  disabled: boolean;
  onClose: () => void;
  onCaptured: (itemId: number, file: File) => void;
}) {
  const camera = useLiveCamera("environment");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const open = item !== null;

  const { start, stop } = camera;

  useEffect(() => {
    if (!open) {
      stop();
      return;
    }
    void start();
    return () => {
      stop();
    };
  }, [open, start, stop]);

  async function handleUpload(file: File | null) {
    if (!file || !item || disabled) return;
    setBusy(true);
    if (!isEligiblePhotoFile(file)) {
      toast.error(messages.employee.clock.uploadUnsupported);
      setBusy(false);
      return;
    }
    if (file.size > MAX_UPLOAD_SOURCE_BYTES) {
      toast.error(messages.employee.clock.uploadTooLarge);
      setBusy(false);
      return;
    }
    let normalized: File | null;
    try {
      normalized = await normalizePhotoFile(file);
    } catch {
      normalized = null;
    }
    if (!normalized || normalized.size > MAX_CLOCK_PHOTO_BYTES) {
      toast.error(messages.employee.clock.uploadUnreadable);
      setBusy(false);
      return;
    }
    onCaptured(item.id, normalized);
    setBusy(false);
  }

  return (
    <AppSheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={item?.title ?? taskCopy.photoCaptureTitle}
      description={taskCopy.photoCaptureHint}
      side="bottom"
      size="md"
      footer={
        item ? (
          <div className="flex w-full flex-col gap-2">
            <Button
              type="button"
              size="touch-lg"
              className="w-full"
              disabled={disabled || busy}
              onClick={() => {
                if (camera.state === "ready") {
                  void camera.capture(`task-${item.id}.webp`).then((file) => {
                    if (!file) {
                      toast.error(taskCopy.photoUploadError);
                      return;
                    }
                    camera.stop();
                    onCaptured(item.id, file);
                  });
                } else {
                  fileInputRef.current?.click();
                }
              }}
            >
              {camera.state === "capturing" || busy ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <IconCamera data-icon="inline-start" />
              )}
              {taskCopy.captureAndComplete}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="touch"
              className="w-full"
              disabled={disabled || busy}
              onClick={() => fileInputRef.current?.click()}
            >
              {messages.employee.clock.uploadPhoto}
            </Button>
          </div>
        ) : null
      }
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-md bg-muted">
        <video
          ref={camera.videoRef}
          className={
            camera.state === "ready" || camera.state === "capturing"
              ? "h-full w-full object-cover"
              : "h-full w-full object-cover opacity-0"
          }
          autoPlay
          muted
          playsInline
        />
        {camera.state === "ready" || camera.state === "capturing" ? null : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
            <Spinner />
            <span>
              {camera.state === "error"
                ? messages.employee.clock.cameraDenied
                : messages.employee.clock.cameraOpening}
            </span>
          </div>
        )}
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept={UPLOAD_PHOTO_ACCEPT}
        capture="environment"
        className="sr-only"
        disabled={disabled || busy}
        onChange={(event) => {
          const file = event.target.files?.[0] ?? null;
          void handleUpload(file);
          event.target.value = "";
        }}
      />
    </AppSheet>
  );
}

export function TasksClient({
  items,
  disabled = false,
  countHref,
  checkoutHref,
  checkoutLabel = homeCopy.clockOut,
  hideCountTask = false,
}: TasksClientProps) {
  const router = useRouter();
  const [localItems, setLocalItems] = useState(items);
  const [pendingItemIds, setPendingItemIds] = useState<Set<number>>(
    () => new Set(),
  );
  const [capturingItemId, setCapturingItemId] = useState<number | null>(null);
  const pendingItemIdsRef = useRef<Set<number>>(new Set());
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLocalItems((current) => {
      const pending = pendingItemIdsRef.current;
      if (pending.size === 0) return items;
      const localDoneById = new Map(
        current
          .filter((item) => pending.has(item.id))
          .map((item) => [item.id, item.done]),
      );
      return items.map((item) =>
        pending.has(item.id)
          ? { ...item, done: localDoneById.get(item.id) ?? item.done }
          : item,
      );
    });
  }, [items]);

  useEffect(() => {
    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, []);

  function scheduleRefresh() {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(() => {
      refreshTimerRef.current = null;
      router.refresh();
    }, 600);
  }

  function setItemPending(itemId: number, pending: boolean) {
    setPendingItemIds((current) => {
      const next = new Set(current);
      if (pending) {
        next.add(itemId);
      } else {
        next.delete(itemId);
      }
      pendingItemIdsRef.current = next;
      return next;
    });
  }

  function revertItem(itemId: number, done: boolean | undefined) {
    if (done === undefined) return;
    setLocalItems((current) =>
      current.map((item) => (item.id === itemId ? { ...item, done } : item)),
    );
  }

  function handleToggle(itemId: number, done: boolean) {
    const item = localItems.find((row) => row.id === itemId);
    if (disabled || !item) return;
    if (done && item.allowsPhoto && !item.photoPath) {
      toast.error(taskCopy.photoRequired);
      setCapturingItemId(itemId);
      return;
    }

    const previousDone = item.done;
    setItemPending(itemId, true);
    setLocalItems((current) =>
      current.map((row) => (row.id === itemId ? { ...row, done } : row)),
    );

    void toggleChecklistItem({ itemId, done })
      .then((result) => {
        setItemPending(itemId, false);
        if (!result.success) {
          revertItem(itemId, previousDone);
          toast.error(result.error ?? taskCopy.updateError);
          return;
        }
        scheduleRefresh();
      })
      .catch(() => {
        setItemPending(itemId, false);
        revertItem(itemId, previousDone);
        toast.error(taskCopy.updateError);
      });
  }

  function handlePhotoCapture(itemId: number, file: File) {
    if (disabled) return;
    setItemPending(itemId, true);
    setCapturingItemId(null);
    const formData = new FormData();
    formData.set("itemId", String(itemId));
    formData.set("photo", file);
    void attachChecklistTaskPhoto(formData)
      .then((result) => {
        setItemPending(itemId, false);
        if (!result.success) {
          toast.error(result.error ?? taskCopy.photoUploadError);
          return;
        }
        setLocalItems((current) =>
          current.map((item) =>
            item.id === itemId
              ? { ...item, photoPath: item.photoPath ?? "local", done: true }
              : item,
          ),
        );
        setPhotoUrls((prev) => {
          const next = { ...prev };
          delete next[itemId];
          return next;
        });
        loadPhotoUrl(itemId);
        toast.success(taskCopy.photoAttached);
        scheduleRefresh();
      })
      .catch(() => {
        setItemPending(itemId, false);
        toast.error(taskCopy.photoUploadError);
      });
  }

  const [photoUrls, setPhotoUrls] = useState<Record<number, string>>({});
  const [photoLoadingIds, setPhotoLoadingIds] = useState<Set<number>>(
    new Set(),
  );
  const [photoPreview, setPhotoPreview] = useState<{
    url: string;
    title: string;
  } | null>(null);

  const loadPhotoUrl = useCallback((itemId: number) => {
    if (photoUrls[itemId] || photoLoadingIds.has(itemId)) return;
    setPhotoLoadingIds((prev) => new Set(prev).add(itemId));
    void getEmployeeTaskPhotoUrl({ itemId }).then((res) => {
      setPhotoLoadingIds((prev) => {
        const next = new Set(prev);
        next.delete(itemId);
        return next;
      });
      if (res.success && res.data?.url) {
        setPhotoUrls((prev) => ({ ...prev, [itemId]: res.data!.url }));
      }
    });
  }, [photoUrls, photoLoadingIds]);

  useEffect(() => {
    for (const item of localItems) {
      if (
        item.allowsPhoto &&
        item.photoPath &&
        !photoUrls[item.id] &&
        !photoLoadingIds.has(item.id)
      ) {
        loadPhotoUrl(item.id);
      }
    }
  }, [localItems, photoUrls, photoLoadingIds, loadPhotoUrl]);

  const requiredRemaining = localItems.filter(
    (item) => !isRequiredChecklistItemComplete(item),
  ).length;
  const visibleItems = hideCountTask
    ? localItems.filter((item) => !isShiftCountDutyItem(item))
    : localItems;
  const capturingItem =
    capturingItemId === null
      ? null
      : (visibleItems.find((item) => item.id === capturingItemId) ?? null);

  return (
    <div className="flex flex-col gap-4">
      {CHECKLIST_PHASES.map((phase) => {
        const phaseItems = visibleItems.filter((item) => item.phase === phase);
        if (phaseItems.length === 0) return null;
        const sortedPhaseItems = sortPhaseItems(phaseItems);
        const phaseDone = phaseItems.filter((item) => item.done).length;
        const headingId = `shift-task-phase-${phase}`;

        return (
          <section
            key={phase}
            className="flex flex-col gap-2"
            aria-labelledby={headingId}
          >
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div className="min-w-0">
                <p id={headingId} className="font-heading text-base font-semibold">
                  {taskCopy.phaseLabels[phase]}
                </p>
                <p className="text-xs leading-5 text-muted-foreground">
                  {taskCopy.phaseHints[phase]}
                </p>
              </div>
              <Badge
                variant={
                  phaseDone === phaseItems.length ? "success" : "secondary"
                }
              >
                {phaseDone}/{phaseItems.length}
              </Badge>
            </div>
            <ItemGroup className="gap-2">
              {sortedPhaseItems.map((item) => {
                const checkboxId = `shift-task-${item.id}`;
                const isCountTask = item.taskKind === "inventory_count";
                const isItemPending = pendingItemIds.has(item.id);
                const needsPhoto = item.allowsPhoto && !isCountTask;
                const canMarkDoneWithoutPhoto = !needsPhoto || Boolean(item.photoPath);
                return (
                  <Item
                    key={item.id}
                    variant="outline"
                    size="sm"
                    className={cn(
                      "items-start bg-card",
                      item.done
                        ? "border-success/20 bg-success/10"
                        : "hover:bg-muted/50",
                      disabled && "bg-muted/30",
                    )}
                  >
                    {isCountTask ? (
                      <ItemMedia
                        variant="icon"
                        className={cn(
                          "rounded-md bg-muted p-2 text-muted-foreground",
                          item.done && "bg-success/10 text-success",
                        )}
                      >
                        <IconCount />
                      </ItemMedia>
                    ) : needsPhoto ? (
                      <div className="flex shrink-0 pt-0.5">
                        <Button
                          type="button"
                          size="icon"
                          variant={item.done ? "outline" : "default"}
                          className={cn(
                            item.done
                              ? "border-success/20 text-success"
                              : "bg-primary text-primary-foreground",
                          )}
                          disabled={disabled || isItemPending}
                          aria-label={
                            item.done ? taskCopy.retakePhoto : taskCopy.attachPhoto
                          }
                          onClick={() => setCapturingItemId(item.id)}
                        >
                          <IconCamera />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex shrink-0 pt-0.5">
                        <Checkbox
                          id={checkboxId}
                          checked={item.done}
                          disabled={disabled || isItemPending}
                          onCheckedChange={(checked) => {
                            if (
                              checked === true &&
                              !canMarkDoneWithoutPhoto
                            ) {
                              toast.error(taskCopy.photoRequired);
                              setCapturingItemId(item.id);
                              return;
                            }
                            handleToggle(item.id, checked === true);
                          }}
                          aria-label={
                            item.done ? taskCopy.markTodo : taskCopy.markDone
                          }
                        />
                      </div>
                    )}
                    <ItemContent className="min-w-0 gap-1">
                      <ItemTitle
                        className={cn(
                          "block w-full min-w-0 max-w-full whitespace-normal break-words line-clamp-2 text-sm leading-5",
                          item.done && "text-muted-foreground",
                        )}
                      >
                        {isCountTask ? (
                          <span className="block min-w-0 max-w-full whitespace-normal break-words">
                            {item.title}
                          </span>
                        ) : needsPhoto ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-auto w-full justify-start p-0 text-left font-normal text-sm leading-5 whitespace-normal break-words hover:bg-transparent hover:underline"
                            disabled={disabled || isItemPending}
                            onClick={() => setCapturingItemId(item.id)}
                          >
                            {item.title}
                          </Button>
                        ) : (
                          <Label
                            className="block min-w-0 max-w-full cursor-pointer whitespace-normal break-words font-normal text-sm leading-5"
                            htmlFor={checkboxId}
                          >
                            {item.title}
                          </Label>
                        )}
                      </ItemTitle>
                      {!item.done && item.doneDefinition ? (
                        <ItemDescription className="line-clamp-2 max-w-full whitespace-normal break-words text-xs leading-5">
                          {item.doneDefinition}
                        </ItemDescription>
                      ) : null}
                      {needsPhoto && !item.done ? (
                        <p className="text-xs text-muted-foreground">
                          {taskCopy.photoRequiredHint}
                        </p>
                      ) : null}
                      {needsPhoto && item.done && item.photoPath ? (
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="relative size-12 shrink-0 overflow-hidden p-0"
                            aria-label={taskCopy.viewPhoto}
                            onClick={() => {
                              const url = photoUrls[item.id];
                              if (url) {
                                setPhotoPreview({ url, title: item.title });
                              } else {
                                loadPhotoUrl(item.id);
                              }
                            }}
                          >
                            {photoUrls[item.id] ? (
                              <Image
                                src={photoUrls[item.id]!}
                                alt={taskCopy.photoThumbnailAlt(item.title)}
                                fill
                                sizes="48px"
                                className="object-cover"
                                unoptimized
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                                {photoLoadingIds.has(item.id) ? (
                                  <Spinner className="size-3.5" />
                                ) : (
                                  <IconCamera className="size-4" />
                                )}
                              </div>
                            )}
                          </Button>
                          <div className="flex flex-col gap-1">
                            <span className="text-2xs font-medium text-success">
                              {taskCopy.photoAttached}
                            </span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="xs"
                              className="gap-1 px-1.5 text-xs text-muted-foreground hover:text-foreground"
                              disabled={disabled || isItemPending}
                              onClick={() => setCapturingItemId(item.id)}
                            >
                              <IconCamera className="size-3" />
                              {taskCopy.retakePhoto}
                            </Button>
                          </div>
                        </div>
                      ) : null}
                      {isCountTask && item.countProgress ? (
                        <div className="mt-1">
                          <Badge
                            variant={item.done ? "success" : "warning"}
                          >
                            {item.done
                              ? taskCopy.countLocationsProgress(
                                  item.countProgress.done,
                                  item.countProgress.total,
                                )
                              : item.countProgress.done > 0
                                ? taskCopy.countLocationsProgress(
                                    item.countProgress.done,
                                    item.countProgress.total,
                                  )
                                : taskCopy.countLocationsPending(
                                    item.countProgress.total,
                                  )}
                          </Badge>
                        </div>
                      ) : null}
                      {isCountTask && !item.done ? (
                        <Button
                          size="touch"
                          className="w-full sm:w-fit"
                          variant="default"
                          render={<Link href={countHref} />}
                        >
                          <IconCount data-icon="inline-start" />
                          {homeCopy.countCta}
                        </Button>
                      ) : null}
                    </ItemContent>
                  </Item>
                );
              })}
            </ItemGroup>
          </section>
        );
      })}
      {checkoutHref && requiredRemaining === 0 && !disabled ? (
        <Button
          size="touch-lg"
          className="w-full sm:w-fit"
          render={<Link href={checkoutHref} />}
        >
          <IconLogout data-icon="inline-start" />
          {checkoutLabel}
        </Button>
      ) : null}
      <TaskPhotoSheet
        item={disabled ? null : capturingItem}
        disabled={disabled}
        onClose={() => setCapturingItemId(null)}
        onCaptured={handlePhotoCapture}
      />
      <AppDialog
        open={photoPreview !== null}
        onOpenChange={(open) => {
          if (!open) setPhotoPreview(null);
        }}
        title={photoPreview?.title ?? taskCopy.photoPreviewTitle}
        description={taskCopy.photoPreviewTitle}
      >
        {photoPreview?.url ? (
          <Image
            src={photoPreview.url}
            alt={photoPreview.title}
            width={800}
            height={600}
            className="h-auto max-h-dvh-80 w-full rounded-md object-contain"
            unoptimized
          />
        ) : null}
      </AppDialog>
    </div>
  );
}
