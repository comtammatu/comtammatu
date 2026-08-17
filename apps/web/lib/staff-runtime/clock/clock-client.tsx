"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import type { ComponentProps, ElementType, ReactNode } from "react";
import {
  Camera as IconCamera,
  CircleCheck as IconCircleCheck,
  CircleX as IconCircleX,
  Clock as IconClock,
  Upload as IconUpload,
} from "lucide-react";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@comtammatu/ui/components/alert";
import type { BadgeProps } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { confirm } from "@/components/confirm-dialog";
import { formatVNTime, getVNMinutesOfDay } from "@comtammatu/shared/time";
import { messages } from "@lib/messages";
import { useIsOnline } from "@/components/pwa-runtime";
import { AppEmptyState } from "@/components/surface";
import {
  BranchOperatorActionGrid,
  BranchOperatorDetailList,
  BranchOperatorFrame,
  BranchOperatorInlineState,
  BranchOperatorPanel,
} from "@lib/branch-operator/components/branch-operator-page";
import {
  EmployeeActionGrid,
  EmployeeDetailList,
  EmployeeFrame,
  EmployeeInlineState,
  EmployeePanel,
} from "../components/staff-runtime-page";
import type { TodayWorkState } from "../_lib/today-work-state";
import {
  MAX_CLOCK_PHOTO_BYTES,
  MAX_UPLOAD_SOURCE_BYTES,
  UPLOAD_PHOTO_ACCEPT,
  UPLOAD_PHOTO_TYPES,
  normalizePhotoFile,
} from "../_lib/shift-photo";
import { useLiveCamera } from "../_lib/use-live-camera";
import {
  cancelCheckoutRequest,
  clockInWithPhoto,
  clockOutManagerShift,
  requestCheckoutApproval,
} from "./actions";

export type EmployeeClockRoutes = {
  home: string;
  tasks: string;
  schedule: string;
  profile: string;
  managerHr: string;
};

interface ClockClientProps {
  state: TodayWorkState;
  routes: EmployeeClockRoutes;
  plane?: ClockPlane;
  surface?: "page" | "embedded";
}

type ClockTone = "default" | "success" | "warning" | "info" | "destructive";
type ClockPlanePrimitives = {
  Panel: (props: {
    title?: string;
    description?: string;
    headerHint?: ReactNode;
    icon?: ElementType;
    tone?: ClockTone;
    badge?: {
      children: ReactNode;
      variant?: BadgeProps["variant"];
    };
    action?: ReactNode;
    children: ReactNode;
    className?: string;
    contentClassName?: string;
    size?: "default" | "sm";
  }) => ReactNode;
  DetailList: (props: {
    rows: Array<{
      label: string;
      value: ReactNode;
      muted?: boolean;
    }>;
    columns?: 1 | 2 | 3;
    className?: string;
  }) => ReactNode;
  InlineState: (props: {
    icon?: ElementType;
    media?: ReactNode;
    title?: ReactNode;
    description?: ReactNode;
    children?: ReactNode;
    actions?: ReactNode;
    tone?: ClockTone;
    className?: string;
    mediaClassName?: string;
  }) => ReactNode;
  Frame: (props: ComponentProps<"div"> & { pad?: "none" | "sm" }) => ReactNode;
  ActionGrid: (props: {
    children: ReactNode;
    columns?: 1 | 2;
    className?: string;
  }) => ReactNode;
};

export type ClockPlane = "employee" | "branch";

const EMPLOYEE_CLOCK_PRIMITIVES: ClockPlanePrimitives = {
  Panel: EmployeePanel,
  DetailList: EmployeeDetailList,
  InlineState: EmployeeInlineState,
  Frame: EmployeeFrame,
  ActionGrid: EmployeeActionGrid,
};

const BRANCH_CLOCK_PRIMITIVES: ClockPlanePrimitives = {
  Panel: BranchOperatorPanel,
  DetailList: BranchOperatorDetailList,
  InlineState: BranchOperatorInlineState,
  Frame: BranchOperatorFrame,
  ActionGrid: BranchOperatorActionGrid,
};

type PhotoState =
  "idle" | "ready" | "processing" | "submitting" | "success" | "error";
type CheckoutState = "idle" | "submitting" | "success" | "error";

const clockCopy = messages.employee.clock;

function formatTime(iso: string | null): string {
  return iso ? formatVNTime(iso) : "—";
}

function timeToMinutes(value: string | null | undefined): number | null {
  if (!value) return null;
  const [hourRaw, minuteRaw] = value.split(":");
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return hour * 60 + minute;
}

function isPastShiftEnd(state: TodayWorkState): boolean {
  const attendance = state.attendance;
  if (
    !attendance?.checkIn ||
    attendance.checkOut ||
    attendance.checkoutRequestedAt
  ) {
    return false;
  }
  if (attendance.date < state.today) return true;
  if (attendance.date !== state.today) return false;

  const start = timeToMinutes(attendance.shiftStartTime);
  const end = timeToMinutes(attendance.shiftEndTime);
  if (start === null || end === null) return false;

  const effectiveEnd = end > start ? end : end + 1440;
  const now = getVNMinutesOfDay();
  const effectiveNow = effectiveEnd > 1440 && now < start ? now + 1440 : now;
  return effectiveNow >= effectiveEnd;
}

function ErrorAlert({ message }: { message: string }) {
  return (
    <Alert variant="destructive">
      <IconCircleX />
      <AlertTitle>{clockCopy.cannotContinueTitle}</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}

function getCheckoutApprovalTargetLabel(state: TodayWorkState): string {
  const targetRoles = state.attendance?.checkoutApprovalTargetRoles ?? [];
  if (targetRoles.includes("branch_manager")) return "quản lý chi nhánh";
  if (targetRoles.length > 0) return "quản lý cấp trên";
  return state.approvalTargetLabel;
}

export function ClockClient({
  state,
  routes,
  plane = "employee",
  surface = "page",
}: ClockClientProps) {
  const { ActionGrid, DetailList, Frame, Panel } =
    plane === "branch" ? BRANCH_CLOCK_PRIMITIVES : EMPLOYEE_CLOCK_PRIMITIVES;
  const router = useRouter();
  const isOnline = useIsOnline();
  const camera = useLiveCamera("user");
  const [photoState, setPhotoState] = useState<PhotoState>("idle");
  const [checkoutState, setCheckoutState] = useState<CheckoutState>("idle");
  const [photo, setPhoto] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const photoInputRef = useRef<HTMLInputElement>(null);
  const autoStartCameraRef = useRef(false);
  const managerAttendanceOnly = state.managerAttendanceOnly;
  const todayShiftName =
    state.attendance?.shiftName ?? state.todayShifts[0]?.shiftName ?? null;
  const embedded = surface === "embedded";

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    if (autoStartCameraRef.current) return;
    if (state.status !== "not_started" || state.shiftUnassigned) return;
    autoStartCameraRef.current = true;
    void camera.start();
  }, [camera.start, state.shiftUnassigned, state.status]);

  const completeClockIn = useCallback(
    (file: File) => {
      if (!isOnline) {
        setError(clockCopy.offline);
        return;
      }

      setPhoto(file);
      setPhotoState("submitting");
      setError(null);
      startTransition(async () => {
        const formData = new FormData();
        formData.set("photo", file);
        const result = await clockInWithPhoto(null, formData);

        if (result.success) {
          camera.stop();
          setPhotoState("success");
          if (navigator.vibrate) navigator.vibrate(150);
          if (!embedded) {
            router.replace(
              result.data?.nextPath === "home" ? routes.home : routes.tasks,
            );
          }
          router.refresh();
        } else {
          setPhotoState("error");
          setPreviewUrl((current) => {
            if (current) URL.revokeObjectURL(current);
            return URL.createObjectURL(file);
          });
          setError(result.error ?? "Chấm công vào thất bại.");
        }
      });
    },
    [camera.stop, embedded, isOnline, router, routes.home, routes.tasks],
  );

  const punchFromCamera = useCallback(async () => {
    if (!isOnline) {
      setError(clockCopy.offline);
      return;
    }
    setError(null);
    const captured = await camera.capture("attendance.webp");
    if (!captured) {
      setError("Camera chưa sẵn sàng. Thử lại sau một nhịp.");
      return;
    }
    camera.stop();
    completeClockIn(captured);
  }, [camera, completeClockIn, isOnline]);

  const uploadPhoto = useCallback(
    async (file: File) => {
      setError(null);
      setPhotoState("processing");

      if (!UPLOAD_PHOTO_TYPES.has(file.type)) {
        setPhotoState("error");
        setError(clockCopy.uploadUnsupported);
        return;
      }

      if (file.size > MAX_UPLOAD_SOURCE_BYTES) {
        setPhotoState("error");
        setError(clockCopy.uploadTooLarge);
        return;
      }

      let normalized: File | null;
      try {
        normalized = await normalizePhotoFile(file);
      } catch {
        normalized = null;
      }

      if (!normalized) {
        setPhotoState("error");
        setError(clockCopy.uploadUnreadable);
        return;
      }

      if (normalized.size > MAX_CLOCK_PHOTO_BYTES) {
        setPhotoState("error");
        setError(clockCopy.uploadTooLargeAfterResize);
        return;
      }

      camera.stop();
      completeClockIn(normalized);
    },
    [camera, completeClockIn],
  );

  const submitCheckout = useCallback(async () => {
    if (!isOnline) {
      setError(clockCopy.offline);
      return;
    }
    const checkInValue = formatTime(state.attendance?.checkIn ?? null);
    const attendanceId = state.attendance?.id;
    if (!attendanceId) {
      setCheckoutState("error");
      setError("Không tìm thấy ca đang mở để kết ca.");
      return;
    }

    if (managerAttendanceOnly) {
      const ok = await confirm({
        title: "Đóng ca của bạn?",
        description:
          "Thao tác này chốt ca làm việc và ghi giờ ra ngay, không thể hoàn tác.",
        details: [{ label: "Giờ vào ca", value: checkInValue }],
        confirmText: "Đóng ca",
        variant: "destructive",
      });
      if (!ok) return;
    }
    setCheckoutState("submitting");
    setError(null);
    startTransition(async () => {
      const result = managerAttendanceOnly
        ? await clockOutManagerShift({ attendanceId })
        : await requestCheckoutApproval({ attendanceId });
      if (result.success) {
        setCheckoutState("success");
        if (navigator.vibrate) navigator.vibrate(150);
        if (!embedded) {
          router.replace(routes.home);
        }
        router.refresh();
      } else {
        setCheckoutState("error");
        setError(result.error ?? "Kết ca thất bại.");
      }
    });
  }, [
    embedded,
    isOnline,
    managerAttendanceOnly,
    router,
    routes.home,
    state.attendance?.checkIn,
    state.attendance?.id,
  ]);

  const cancelCheckout = useCallback(() => {
    if (!isOnline) {
      setError(clockCopy.offline);
      return;
    }
    const attendanceId = state.attendance?.id;
    if (!attendanceId) {
      setCheckoutState("error");
      setError("Không tìm thấy yêu cầu kết ca.");
      return;
    }

    setCheckoutState("submitting");
    setError(null);
    startTransition(async () => {
      const result = await cancelCheckoutRequest({ attendanceId });
      if (result.success) {
        if (navigator.vibrate) navigator.vibrate(80);
        if (!embedded) {
          router.replace(routes.home);
        }
        router.refresh();
      } else {
        setCheckoutState("error");
        setError(result.error ?? "Không thể rút yêu cầu kết ca.");
      }
    });
  }, [embedded, isOnline, router, routes.home, state.attendance?.id]);

  const photoBusy =
    isPending || photoState === "processing" || photoState === "submitting";
  const visibleError =
    !isOnline
      ? clockCopy.offline
      : error ??
        (camera.state === "error" ? clockCopy.cameraDenied : null);

  if (state.status === "missing_branch") {
    return (
      <AppEmptyState
        title={clockCopy.missingBranchTitle}
        description={clockCopy.missingBranchDescription}
        icon={<IconCircleX />}
      />
    );
  }

  if (state.status === "not_started" && state.shiftUnassigned) {
    return (
      <AppEmptyState
        title={messages.employee.home.statusNotStarted}
        description={messages.employee.home.descriptionShiftUnassigned}
        icon={<IconCircleX />}
      />
    );
  }

  if (state.status === "not_required") {
    return (
      <Panel
        icon={IconClock}
        title={clockCopy.notRequiredTitle}
        tone="info"
        badge={{ children: clockCopy.noShiftBadge, variant: "info" }}
      >
        <DetailList
          rows={[
            {
              label: clockCopy.branchLabel,
              value: state.branchName ?? clockCopy.noBranch,
              muted: !state.branchName,
            },
            {
              label: clockCopy.todayShiftLabel,
              value: todayShiftName ?? clockCopy.noTodayShift,
              muted: !todayShiftName,
            },
          ]}
        />
        <Button
          variant="outline"
          size="touch"
          className="w-full sm:w-fit"
          render={<Link href={routes.schedule} />}
        >
          {clockCopy.viewSchedule}
        </Button>
      </Panel>
    );
  }

  if (state.status === "done") {
    return (
      <Panel
        icon={IconCircleCheck}
        title={clockCopy.doneTitle}
        tone="success"
        badge={{ children: clockCopy.doneBadge, variant: "success" }}
      >
        <DetailList
          rows={[
            {
              label: clockCopy.branchLabel,
              value: state.branchName ?? clockCopy.notRecorded,
              muted: !state.branchName,
            },
            {
              label: clockCopy.checkInLabel,
              value: formatTime(state.attendance?.checkIn ?? null),
            },
            {
              label: clockCopy.checkOutLabel,
              value: formatTime(state.attendance?.checkOut ?? null),
            },
          ]}
        />
      </Panel>
    );
  }

  if (state.status === "checkout_pending") {
    return (
      <Panel
        icon={IconClock}
        title={clockCopy.checkoutPendingTitle}
        description={`${clockCopy.checkoutPendingDescriptionPrefix} ${getCheckoutApprovalTargetLabel(
          state,
        )}.`}
        tone="warning"
        badge={{ children: clockCopy.checkoutPendingBadge, variant: "warning" }}
      >
        <DetailList
          rows={[
            {
              label: clockCopy.checkInLabel,
              value: formatTime(state.attendance?.checkIn ?? null),
            },
            {
              label: clockCopy.checkoutRequestLabel,
              value: formatTime(state.attendance?.checkoutRequestedAt ?? null),
            },
          ]}
        />
        {visibleError ? <ErrorAlert message={visibleError} /> : null}
        <Button
          variant="outline"
          size="touch"
          className="w-full sm:w-fit"
          disabled={!isOnline || checkoutState === "submitting"}
          onClick={cancelCheckout}
        >
          {checkoutState === "submitting"
            ? clockCopy.cancelCheckoutPending
            : clockCopy.cancelCheckoutButton}
        </Button>
      </Panel>
    );
  }

  if (state.status === "working") {
    const pastShiftEnd = isPastShiftEnd(state);
    const checkoutButtonLabel = managerAttendanceOnly
      ? clockCopy.managerCheckoutButton
      : clockCopy.staffCheckoutButton;
    const checkoutPendingLabel = managerAttendanceOnly
      ? clockCopy.managerCheckoutSubmitting
      : clockCopy.staffCheckoutSubmitting;
    const checkoutBody = (
      <>
        {embedded ? null : (
          <DetailList
            rows={[
              {
                label: clockCopy.checkInLabel,
                value: formatTime(state.attendance?.checkIn ?? null),
              },
            ]}
          />
        )}
        {visibleError ? <ErrorAlert message={visibleError} /> : null}
        <Button
          size="touch-lg"
          className="w-full"
          onClick={submitCheckout}
          disabled={!isOnline || isPending || checkoutState === "submitting"}
        >
          {checkoutState === "submitting" || isPending ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <IconCircleCheck data-icon="inline-start" />
          )}
          {checkoutState === "submitting" || isPending
            ? checkoutPendingLabel
            : checkoutButtonLabel}
        </Button>
      </>
    );

    if (embedded) {
      return <div className="flex w-full flex-col gap-3">{checkoutBody}</div>;
    }

    return (
      <Panel
        icon={IconClock}
        title={
          managerAttendanceOnly
            ? clockCopy.managerCheckoutTitle
            : clockCopy.staffCheckoutTitle
        }
        tone={pastShiftEnd ? "warning" : "success"}
        badge={
          pastShiftEnd
            ? { children: clockCopy.pastShiftBadge, variant: "warning" }
            : undefined
        }
      >
        {checkoutBody}
      </Panel>
    );
  }

  const punchBody = (
    <>
      {embedded ? null : (
        <p className="text-sm text-muted-foreground">
          {todayShiftName ?? clockCopy.noTodayShift}
        </p>
      )}

      <Frame className="overflow-hidden bg-muted/30">
        <div className="relative aspect-[4/3] w-full">
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
              {photo && previewUrl ? (
                <Image
                  src={previewUrl}
                  alt=""
                  width={320}
                  height={240}
                  className="h-full w-full object-cover"
                  unoptimized
                />
              ) : (
                <>
                  <Spinner />
                  <span>
                    {camera.state === "starting"
                      ? clockCopy.cameraOpening
                      : clockCopy.cameraNotOpen}
                  </span>
                </>
              )}
            </div>
          )}
        </div>
      </Frame>

      {visibleError ? <ErrorAlert message={visibleError} /> : null}

      <input
        ref={photoInputRef}
        type="file"
        accept={UPLOAD_PHOTO_ACCEPT}
        className="hidden"
        disabled={photoBusy}
        aria-label={clockCopy.uploadPhoto}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void uploadPhoto(file);
          event.target.value = "";
        }}
      />

      {photoState === "submitting" || isPending ? (
        <Button size="touch-lg" className="w-full" disabled>
          <Spinner data-icon="inline-start" />
          {clockCopy.clockInSubmitting}
        </Button>
      ) : camera.state === "starting" ? (
        <Button size="touch-lg" className="w-full" disabled>
          <Spinner data-icon="inline-start" />
          {clockCopy.cameraOpening}
        </Button>
      ) : camera.state === "ready" || camera.state === "capturing" ? (
        <Button
          type="button"
          size="touch-lg"
          className="w-full"
          onClick={() => void punchFromCamera()}
          disabled={photoBusy || camera.state === "capturing"}
        >
          {camera.state === "capturing" ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <IconCamera data-icon="inline-start" />
          )}
          {clockCopy.clockInButton}
        </Button>
      ) : (
        <ActionGrid>
          <Button
            type="button"
            size="touch"
            onClick={() => {
              if (photo) {
                completeClockIn(photo);
                return;
              }
              void camera.start();
            }}
            disabled={photoBusy}
          >
            {photo ? (
              <IconCircleCheck data-icon="inline-start" />
            ) : (
              <IconCamera data-icon="inline-start" />
            )}
            {photo ? clockCopy.clockInButton : clockCopy.openCamera}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="touch"
            onClick={() => photoInputRef.current?.click()}
            disabled={photoBusy}
          >
            {photoState === "processing" ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <IconUpload data-icon="inline-start" />
            )}
            {photoState === "processing"
              ? clockCopy.uploadProcessing
              : clockCopy.uploadPhoto}
          </Button>
        </ActionGrid>
      )}
    </>
  );

  if (embedded) {
    return <div className="flex w-full flex-col gap-3">{punchBody}</div>;
  }

  return (
    <Panel
      icon={IconCamera}
      title={clockCopy.clockInTitle}
      tone="info"
    >
      {punchBody}
    </Panel>
  );
}
