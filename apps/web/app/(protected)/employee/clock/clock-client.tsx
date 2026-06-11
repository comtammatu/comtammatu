"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import {
  Camera as IconCamera,
  CircleCheck as IconCircleCheck,
  CircleX as IconCircleX,
  Clock as IconClock,
  ListChecks as IconListChecks,
} from "lucide-react";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@comtammatu/ui/components/alert";
import { Button } from "@comtammatu/ui/components/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@comtammatu/ui/components/empty";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { ACTIONS_VI } from "@comtammatu/shared/messages";
import { formatVNTime } from "@comtammatu/shared/time";
import { messages } from "@lib/messages";
import { EmployeeDetailList, EmployeePanel } from "../components/employee-page";
import type { TodayWorkState } from "../_lib/today-work-state";
import {
  clockInWithPhoto,
  clockOutManagerShift,
  requestCheckoutApproval,
} from "./actions";

interface ClockClientProps {
  state: TodayWorkState;
}

type PhotoState = "idle" | "ready" | "submitting" | "success" | "error";
type CameraState = "idle" | "starting" | "ready" | "capturing" | "error";
type CheckoutState = "idle" | "submitting" | "success" | "error";

const MAX_CLIENT_PHOTO_EDGE = 1280;
const PHOTO_QUALITY = 0.82;
const clockCopy = messages.employee.clock;

function formatTime(iso: string | null): string {
  return iso ? formatVNTime(iso) : "—";
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

export function ClockClient({ state }: ClockClientProps) {
  const router = useRouter();
  const [photoState, setPhotoState] = useState<PhotoState>("idle");
  const [cameraState, setCameraState] = useState<CameraState>("idle");
  const [checkoutState, setCheckoutState] = useState<CheckoutState>("idle");
  const [photo, setPhoto] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const videoRef = useRef<HTMLVideoElement>(null);
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
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: "user",
          width: { ideal: 1280 },
          height: { ideal: 960 },
        },
      });
      cameraStreamRef.current = stream;

      const video = videoRef.current;
      if (!video) {
        throw new Error("camera_video_not_ready");
      }

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

  const submitClockIn = useCallback(() => {
    if (!photo) {
      setError("Cần chụp ảnh chấm công.");
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
        router.push(result.data?.nextPath ?? "/employee/tasks");
        router.refresh();
      } else {
        setPhotoState("error");
        setError(result.error ?? "Chấm công vào thất bại.");
      }
    });
  }, [photo, router, stopCamera]);

  const submitCheckout = useCallback(() => {
    setCheckoutState("submitting");
    setError(null);
    startTransition(async () => {
      const result = managerAttendanceOnly
        ? await clockOutManagerShift({})
        : await requestCheckoutApproval();
      if (result.success) {
        setCheckoutState("success");
        if (navigator.vibrate) navigator.vibrate(150);
        router.push("/employee");
        router.refresh();
      } else {
        setCheckoutState("error");
        setError(result.error ?? "Kết ca thất bại.");
      }
    });
  }, [managerAttendanceOnly, router]);

  const cameraActive =
    cameraState === "starting" ||
    cameraState === "ready" ||
    cameraState === "capturing";

  if (state.status === "missing_branch") {
    return (
      <Empty>
        <EmptyMedia variant="icon">
          <IconCircleX />
        </EmptyMedia>
        <EmptyHeader>
          <EmptyTitle>{clockCopy.missingBranchTitle}</EmptyTitle>
          <EmptyDescription>
            {clockCopy.missingBranchDescription}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  if (state.status === "not_required") {
    return (
      <EmployeePanel
        icon={IconClock}
        title={clockCopy.notRequiredTitle}
        tone="info"
        badge={{ children: clockCopy.noShiftBadge, variant: "info" }}
      >
        <EmployeeDetailList
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
          asChild
          variant="outline"
          size="touch"
          className="w-full sm:w-fit"
        >
          <Link href="/employee/schedule">{clockCopy.viewSchedule}</Link>
        </Button>
      </EmployeePanel>
    );
  }

  if (state.status === "done") {
    return (
      <EmployeePanel
        icon={IconCircleCheck}
        title={clockCopy.doneTitle}
        tone="success"
        badge={{ children: clockCopy.doneBadge, variant: "success" }}
      >
        <EmployeeDetailList
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
      </EmployeePanel>
    );
  }

  if (state.status === "checkout_pending") {
    return (
      <EmployeePanel
        icon={IconClock}
        title={clockCopy.checkoutPendingTitle}
        description={`${clockCopy.checkoutPendingDescriptionPrefix} ${getCheckoutApprovalTargetLabel(
          state,
        )}.`}
        tone="warning"
        badge={{ children: clockCopy.checkoutPendingBadge, variant: "warning" }}
      >
        <EmployeeDetailList
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
      </EmployeePanel>
    );
  }

  if (
    state.status === "working" &&
    !managerAttendanceOnly &&
    state.checklist.requiredRemaining > 0
  ) {
    return (
      <EmployeePanel
        icon={IconListChecks}
        title={clockCopy.tasksTitle}
        tone="info"
        badge={{
          children: `${state.checklist.done}/${state.checklist.total} xong`,
          variant: "info",
        }}
      >
        <EmployeeDetailList
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
          ]}
        />
        <Button asChild size="touch" className="w-full sm:w-fit">
          <Link href="/employee/tasks">
            <IconListChecks data-icon="inline-start" />
            {clockCopy.tasksButton}
          </Link>
        </Button>
      </EmployeePanel>
    );
  }

  if (state.status === "working") {
    const checkoutTitle = managerAttendanceOnly
      ? clockCopy.managerCheckoutTitle
      : clockCopy.staffCheckoutTitle;
    const checkoutDescription = managerAttendanceOnly
      ? clockCopy.managerCheckoutDescription
      : `${clockCopy.staffCheckoutDescriptionPrefix} ${state.approvalTargetLabel} ${clockCopy.staffCheckoutDescriptionSuffix}`;
    const checkoutBadge = managerAttendanceOnly
      ? clockCopy.managerCheckoutBadge
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
            label: "Checklist",
            value: `${state.checklist.done}/${state.checklist.total} xong`,
          },
          {
            label: clockCopy.checkInLabel,
            value: formatTime(state.attendance?.checkIn ?? null),
          },
        ];

    return (
      <EmployeePanel
        icon={IconClock}
        title={checkoutTitle}
        description={checkoutDescription}
        tone="success"
        badge={{ children: checkoutBadge, variant: "success" }}
      >
        <EmployeeDetailList rows={detailRows} />

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
          <div className="flex items-center gap-2 text-sm text-muted-foreground motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:duration-200">
            <Spinner />
            {checkoutPendingLabel}
          </div>
        ) : null}
      </EmployeePanel>
    );
  }

  return (
    <EmployeePanel
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
      <EmployeeDetailList
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
        <div className="overflow-hidden rounded-lg border bg-muted/40 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95 motion-safe:duration-200">
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
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-muted-foreground motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200">
                <Spinner />
                <span>{clockCopy.cameraOpening}</span>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {!cameraActive && previewUrl ? (
        <div className="flex items-center gap-3 rounded-md border bg-muted/40 p-3 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95 motion-safe:duration-200">
          <Image
            src={previewUrl}
            alt=""
            width={48}
            height={48}
            className="size-12 rounded-md object-cover"
            unoptimized
          />
          <div className="min-w-0 text-sm">
            <p className="font-medium">{clockCopy.photoReadyTitle}</p>
            <p className="truncate text-muted-foreground">{photo?.name}</p>
          </div>
        </div>
      ) : !cameraActive ? (
        <div className="flex items-center gap-3 rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:duration-200">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-background text-primary">
            <IconCamera className="size-5" />
          </span>
          <span className="min-w-0">{clockCopy.cameraNotOpen}</span>
        </div>
      ) : null}

      {error ? <ErrorAlert message={error} /> : null}

      {cameraState === "ready" || cameraState === "capturing" ? (
        <div className="grid gap-2 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:duration-200 sm:grid-cols-2">
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
        </div>
      ) : photo ? (
        <div className="grid gap-2 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:duration-200 sm:grid-cols-2">
          <Button
            type="button"
            variant="outline"
            size="touch"
            onClick={startCamera}
            disabled={
              isPending ||
              photoState === "submitting" ||
              cameraState === "starting"
            }
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
            size="touch"
            onClick={submitClockIn}
            disabled={isPending || photoState === "submitting"}
          >
            {photoState === "submitting" || isPending ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <IconCircleCheck data-icon="inline-start" />
            )}
            {clockCopy.clockInButton}
          </Button>
        </div>
      ) : cameraState === "starting" ? null : (
        <Button
          type="button"
          size="touch"
          className="w-full motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95 motion-safe:duration-200 sm:w-fit"
          onClick={startCamera}
          disabled={isPending || photoState === "submitting"}
        >
          <IconCamera data-icon="inline-start" />
          {clockCopy.openCamera}
        </Button>
      )}
    </EmployeePanel>
  );
}
