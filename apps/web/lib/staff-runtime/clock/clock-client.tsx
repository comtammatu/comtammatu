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
import { confirm } from "@comtammatu/ui/components/confirm-dialog";
import { ACTIONS_VI } from "@comtammatu/shared/messages";
import { formatVNTime, getVNMinutesOfDay } from "@comtammatu/shared/time";
import { messages } from "@lib/messages";
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
import type { EmployeeClockRoutes } from "./page";
import {
  cancelCheckoutRequest,
  clockInWithPhoto,
  clockOutManagerShift,
  requestCheckoutApproval,
} from "./actions";

interface ClockClientProps {
  state: TodayWorkState;
  routes: EmployeeClockRoutes;
  plane?: ClockPlane;
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
  | "idle"
  | "ready"
  | "processing"
  | "submitting"
  | "success"
  | "error";
type CameraState = "idle" | "starting" | "ready" | "capturing" | "error";
type CheckoutState = "idle" | "submitting" | "success" | "error";

const MAX_CLIENT_PHOTO_EDGE = 1280;
const MAX_UPLOAD_SOURCE_BYTES = 15_000_000;
const MAX_CLOCK_PHOTO_BYTES = 3_500_000;
const PHOTO_QUALITY = 0.82;
const UPLOAD_PHOTO_ACCEPT = "image/jpeg,image/png,image/webp";
const UPLOAD_PHOTO_TYPES = new Set(UPLOAD_PHOTO_ACCEPT.split(","));
const clockCopy = messages.employee.clock;

function waitForNextAnimationFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

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

async function capturePhotoFromVideo(
  video: HTMLVideoElement,
): Promise<File | null> {
  const sourceWidth = video.videoWidth;
  const sourceHeight = video.videoHeight;
  if (!sourceWidth || !sourceHeight) return null;

  const scale = Math.min(
    1,
    MAX_CLIENT_PHOTO_EDGE / Math.max(sourceWidth, sourceHeight),
  );
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, width, height);

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/webp", PHOTO_QUALITY);
  });
  return blob
    ? new File([blob], "attendance.webp", { type: "image/webp" })
    : null;
}

function loadImageFromObjectUrl(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("photo_decode_failed"));
    image.src = url;
  });
}

async function normalizePhotoFile(file: File): Promise<File | null> {
  const objectUrl = URL.createObjectURL(file);

  try {
    const image = await loadImageFromObjectUrl(objectUrl);
    const sourceWidth = image.naturalWidth;
    const sourceHeight = image.naturalHeight;
    if (!sourceWidth || !sourceHeight) return null;

    const scale = Math.min(
      1,
      MAX_CLIENT_PHOTO_EDGE / Math.max(sourceWidth, sourceHeight),
    );
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(image, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/webp", PHOTO_QUALITY);
    });

    if (!blob) return null;
    return new File([blob], "attendance-upload.webp", { type: "image/webp" });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function ClockClient({
  state,
  routes,
  plane = "employee",
}: ClockClientProps) {
  const { ActionGrid, DetailList, Frame, InlineState, Panel } =
    plane === "branch" ? BRANCH_CLOCK_PRIMITIVES : EMPLOYEE_CLOCK_PRIMITIVES;
  const router = useRouter();
  const [photoState, setPhotoState] = useState<PhotoState>("idle");
  const [cameraState, setCameraState] = useState<CameraState>("idle");
  const [checkoutState, setCheckoutState] = useState<CheckoutState>("idle");
  const [photo, setPhoto] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const videoRef = useRef<HTMLVideoElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const managerAttendanceOnly = state.managerAttendanceOnly;

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const stopCamera = useCallback(() => {
    if (cameraStreamRef.current) {
      for (const track of cameraStreamRef.current.getTracks()) {
        track.stop();
      }
      cameraStreamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  // The not-started screen has exactly one job — take the check-in photo —
  // so the camera opens itself once on mount. One-shot: a manual cancel
  // must not re-trigger it, and the "Mở camera" button stays as the
  // fallback when permission is denied.
  const autoStartCameraRef = useRef(false);

  const startCamera = useCallback(async () => {
    setError(null);

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraState("error");
      setError("Thiết bị hoặc trình duyệt chưa hỗ trợ chụp ảnh bằng camera.");
      return;
    }

    setCameraState("starting");
    stopCamera();

    try {
      await waitForNextAnimationFrame();

      const video = videoRef.current;
      if (!video) {
        throw new Error("camera_video_not_ready");
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: "user",
          width: { ideal: 1280 },
          height: { ideal: 960 },
        },
      });
      cameraStreamRef.current = stream;

      video.srcObject = stream;
      await video.play();
      setCameraState("ready");
    } catch {
      stopCamera();
      setCameraState("error");
      setError("Không thể mở camera. Cho phép quyền camera rồi thử lại.");
    }
  }, [stopCamera]);

  useEffect(() => {
    if (autoStartCameraRef.current) return;
    if (state.status !== "not_started") return;
    autoStartCameraRef.current = true;
    void startCamera();
  }, [startCamera, state.status]);

  const capturePhoto = useCallback(async () => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) {
      setError("Camera chưa sẵn sàng. Thử lại sau một nhịp.");
      return;
    }

    setError(null);
    setPhotoState("idle");
    setCameraState("capturing");
    const captured = await capturePhotoFromVideo(video);

    if (!captured) {
      setCameraState("ready");
      setError("Không thể chụp ảnh từ camera. Thử lại một lần nữa.");
      return;
    }

    setPhoto(captured);
    setPhotoState("ready");
    setPreviewUrl(URL.createObjectURL(captured));
    stopCamera();
    setCameraState("idle");
  }, [stopCamera]);

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

      setPhoto(normalized);
      setPreviewUrl(URL.createObjectURL(normalized));
      setPhotoState("ready");
      stopCamera();
      setCameraState("idle");
    },
    [stopCamera],
  );

  const submitClockIn = useCallback(() => {
    if (!photo) {
      setError(clockCopy.photoRequired);
      return;
    }

    setPhotoState("submitting");
    setError(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("photo", photo);
      const result = await clockInWithPhoto(null, formData);

      if (result.success) {
        stopCamera();
        setPhotoState("success");
        if (navigator.vibrate) navigator.vibrate(150);
        router.push(
          result.data?.nextPath === "home" ? routes.home : routes.tasks,
        );
        router.refresh();
      } else {
        setPhotoState("error");
        setError(result.error ?? "Chấm công vào thất bại.");
      }
    });
  }, [photo, router, routes.home, routes.tasks, stopCamera]);

  const submitCheckout = useCallback(async () => {
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
        router.push(routes.home);
        router.refresh();
      } else {
        setCheckoutState("error");
        setError(result.error ?? "Kết ca thất bại.");
      }
    });
  }, [
    managerAttendanceOnly,
    router,
    routes.home,
    state.attendance?.checkIn,
    state.attendance?.id,
  ]);

  const cancelCheckout = useCallback(() => {
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
        router.push(routes.home);
        router.refresh();
      } else {
        setCheckoutState("error");
        setError(result.error ?? "Không thể rút yêu cầu kết ca.");
      }
    });
  }, [router, routes.home, state.attendance?.id]);

  const cameraActive =
    cameraState === "starting" ||
    cameraState === "ready" ||
    cameraState === "capturing";
  const photoBusy =
    isPending || photoState === "processing" || photoState === "submitting";

  if (state.status === "missing_branch") {
    return (
      <AppEmptyState
        title={clockCopy.missingBranchTitle}
        description={clockCopy.missingBranchDescription}
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
              value: state.attendance?.shiftName ?? clockCopy.noTodayShift,
              muted: !state.attendance?.shiftName,
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
              label: clockCopy.branchLabel,
              value: state.branchName ?? clockCopy.notRecorded,
              muted: !state.branchName,
            },
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
        {error ? <ErrorAlert message={error} /> : null}
        <Button
          variant="outline"
          size="touch"
          className="w-full sm:w-fit"
          disabled={checkoutState === "submitting"}
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
    const checkoutTitle = managerAttendanceOnly
      ? pastShiftEnd
        ? "Quá giờ ca - Chấm công ra"
        : clockCopy.managerCheckoutTitle
      : pastShiftEnd
        ? "Quá giờ ca - Kết ca làm"
        : clockCopy.staffCheckoutTitle;
    const checkoutDescription = managerAttendanceOnly
      ? pastShiftEnd
        ? "Ca đã quá giờ kết thúc. Ghi giờ ra để chốt ca hiện tại."
        : clockCopy.managerCheckoutDescription
      : pastShiftEnd
        ? `Ca đã quá giờ kết thúc. ${clockCopy.staffCheckoutDescriptionPrefix} ${state.approvalTargetLabel} ${clockCopy.staffCheckoutDescriptionSuffix}`
        : `${clockCopy.staffCheckoutDescriptionPrefix} ${state.approvalTargetLabel} ${clockCopy.staffCheckoutDescriptionSuffix}`;
    const checkoutBadge = managerAttendanceOnly
      ? pastShiftEnd
        ? "Quá giờ ca"
        : clockCopy.managerCheckoutBadge
      : pastShiftEnd
        ? "Cần kết ca"
        : clockCopy.staffCheckoutBadge;
    const checkoutButtonLabel = managerAttendanceOnly
      ? clockCopy.managerCheckoutButton
      : clockCopy.staffCheckoutButton;
    const checkoutPendingLabel = managerAttendanceOnly
      ? clockCopy.managerCheckoutSubmitting
      : clockCopy.staffCheckoutSubmitting;
    const detailRows = managerAttendanceOnly
      ? [
          {
            label: clockCopy.branchLabel,
            value: state.branchName ?? clockCopy.notRecorded,
            muted: !state.branchName,
          },
          {
            label: clockCopy.checkInLabel,
            value: formatTime(state.attendance?.checkIn ?? null),
          },
        ]
      : [
          {
            label: clockCopy.branchLabel,
            value: state.branchName ?? clockCopy.notRecorded,
            muted: !state.branchName,
          },
          {
            label: "Việc trong ca",
            value: `${state.checklist.done}/${state.checklist.total} xong`,
          },
          {
            label: clockCopy.checkInLabel,
            value: formatTime(state.attendance?.checkIn ?? null),
          },
        ];

    return (
      <Panel
        icon={IconClock}
        title={checkoutTitle}
        description={checkoutDescription}
        tone={pastShiftEnd ? "warning" : "success"}
        badge={{
          children: checkoutBadge,
          variant: pastShiftEnd ? "warning" : "success",
        }}
      >
        <DetailList rows={detailRows} />

        {error ? <ErrorAlert message={error} /> : null}

        <Button
          size="touch"
          className="w-full sm:w-fit"
          onClick={submitCheckout}
          disabled={isPending || checkoutState === "submitting"}
        >
          {checkoutState === "submitting" || isPending ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <IconCircleCheck data-icon="inline-start" />
          )}
          {checkoutButtonLabel}
        </Button>

        {checkoutState === "submitting" ? (
          <InlineState media={<Spinner />} title={checkoutPendingLabel} />
        ) : null}
      </Panel>
    );
  }

  return (
    <Panel
      icon={IconCamera}
      title={clockCopy.clockInTitle}
      tone="info"
      badge={{
        children:
          photoState === "success"
            ? clockCopy.recordedBadge
            : clockCopy.notClockedInBadge,
        variant: photoState === "success" ? "success" : "info",
      }}
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
            value: state.attendance?.shiftName ?? clockCopy.noTodayShift,
            muted: !state.attendance?.shiftName,
          },
        ]}
      />

      {cameraActive ? (
        <Frame className="overflow-hidden bg-muted/30">
          <div className="relative aspect-[4/3] w-full">
            <video
              ref={videoRef}
              className={
                cameraState === "ready" || cameraState === "capturing"
                  ? "h-full w-full object-cover"
                  : "h-full w-full object-cover opacity-0"
              }
              autoPlay
              muted
              playsInline
            />
            {cameraState === "ready" || cameraState === "capturing" ? null : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
                <Spinner />
                <span>{clockCopy.cameraOpening}</span>
              </div>
            )}
          </div>
        </Frame>
      ) : null}

      {!cameraActive && previewUrl ? (
        <InlineState
          media={
            <Image
              src={previewUrl}
              alt=""
              width={48}
              height={48}
              className="size-full object-cover"
              unoptimized
            />
          }
          mediaClassName="size-12 rounded-md"
          title={clockCopy.photoReadyTitle}
          description={photo?.name}
          className="bg-muted/30"
        />
      ) : !cameraActive ? (
        <InlineState
          icon={IconCamera}
          description={clockCopy.cameraNotOpen}
          className="bg-muted/30"
        />
      ) : null}

      {error ? <ErrorAlert message={error} /> : null}

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

      {cameraState === "ready" || cameraState === "capturing" ? (
        <ActionGrid>
          <Button
            type="button"
            size="touch"
            onClick={capturePhoto}
            disabled={isPending || cameraState === "capturing"}
          >
            {cameraState === "capturing" ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <IconCamera data-icon="inline-start" />
            )}
            {clockCopy.capturePhoto}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="touch"
            disabled={cameraState === "capturing"}
            onClick={() => {
              stopCamera();
              setCameraState("idle");
            }}
          >
            {ACTIONS_VI.cancel}
          </Button>
        </ActionGrid>
      ) : photo ? (
        <ActionGrid>
          <Button
            type="button"
            variant="outline"
            size="touch"
            onClick={startCamera}
            disabled={photoBusy || cameraState === "starting"}
          >
            {cameraState === "starting" ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <IconCamera data-icon="inline-start" />
            )}
            {cameraState === "starting"
              ? clockCopy.cameraOpening
              : clockCopy.retakePhoto}
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
              : clockCopy.uploadAnotherPhoto}
          </Button>
          <Button
            type="button"
            size="touch"
            className="sm:col-span-2"
            onClick={submitClockIn}
            disabled={photoBusy}
          >
            {photoState === "submitting" || isPending ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <IconCircleCheck data-icon="inline-start" />
            )}
            {clockCopy.clockInButton}
          </Button>
        </ActionGrid>
      ) : cameraState === "starting" ? null : (
        <ActionGrid>
          <Button
            type="button"
            size="touch"
            onClick={startCamera}
            disabled={photoBusy}
          >
            <IconCamera data-icon="inline-start" />
            {clockCopy.openCamera}
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
    </Panel>
  );
}
