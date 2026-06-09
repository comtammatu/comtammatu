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
import { EmployeeDetailList, EmployeePanel } from "../components/employee-page";
import type { TodayWorkState } from "../_lib/today-work-state";
import { clockInWithPhoto, requestCheckoutApproval } from "./actions";

interface ClockClientProps {
  state: TodayWorkState;
}

type PhotoState = "idle" | "ready" | "submitting" | "success" | "error";
type CameraState = "idle" | "starting" | "ready" | "capturing" | "error";
type CheckoutState = "idle" | "submitting" | "success" | "error";

const MAX_CLIENT_PHOTO_EDGE = 1280;
const PHOTO_QUALITY = 0.82;

function formatTime(iso: string | null): string {
  return iso ? formatVNTime(iso) : "—";
}

function ErrorAlert({ message }: { message: string }) {
  return (
    <Alert variant="destructive">
      <IconCircleX />
      <AlertTitle>Chưa thể tiếp tục</AlertTitle>
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
      const result = await requestCheckoutApproval();
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
  }, [router]);

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
          <EmptyTitle>Chưa thể chấm công</EmptyTitle>
          <EmptyDescription>
            Tài khoản chưa được gắn chi nhánh. Liên hệ quản lý để cập nhật hồ
            sơ.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  if (state.status === "not_required") {
    return (
      <EmployeePanel
        icon={IconClock}
        title="Không bắt buộc chấm công"
        description="Hôm nay chưa có ca cần chấm công."
        tone="info"
        badge={{ children: "Không có ca", variant: "info" }}
      >
        <EmployeeDetailList
          rows={[
            {
              label: "Chi nhánh",
              value: state.branchName ?? "Chưa gắn",
              muted: !state.branchName,
            },
            {
              label: "Ca hôm nay",
              value: state.nextShift?.shiftName ?? "Chưa xếp ca",
              muted: !state.nextShift,
            },
          ]}
        />
        <Button
          asChild
          variant="outline"
          size="touch"
          className="w-full sm:w-fit"
        >
          <Link href="/employee/schedule">Xem lịch ca</Link>
        </Button>
      </EmployeePanel>
    );
  }

  if (state.status === "done") {
    return (
      <EmployeePanel
        icon={IconCircleCheck}
        title="Đã hoàn thành"
        description="Hôm nay đã có đủ giờ vào và giờ ra."
        tone="success"
        badge={{ children: "Hoàn thành", variant: "success" }}
      >
        <EmployeeDetailList
          rows={[
            {
              label: "Chi nhánh",
              value: state.branchName ?? "Chưa ghi nhận",
              muted: !state.branchName,
            },
            {
              label: "Giờ vào",
              value: formatTime(state.attendance?.checkIn ?? null),
            },
            {
              label: "Giờ ra",
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
        title="Chờ quản lý duyệt"
        description={`Yêu cầu kết ca đã gửi đến ${getCheckoutApprovalTargetLabel(
          state,
        )}.`}
        tone="warning"
        badge={{ children: "Chờ duyệt", variant: "warning" }}
      >
        <EmployeeDetailList
          rows={[
            {
              label: "Chi nhánh",
              value: state.branchName ?? "Chưa ghi nhận",
              muted: !state.branchName,
            },
            {
              label: "Giờ vào",
              value: formatTime(state.attendance?.checkIn ?? null),
            },
            {
              label: "Yêu cầu ra",
              value: formatTime(state.attendance?.checkoutRequestedAt ?? null),
            },
          ]}
        />
      </EmployeePanel>
    );
  }

  if (state.status === "working") {
    return (
      <EmployeePanel
        icon={IconListChecks}
        title="Việc trong ca"
        description="Hoàn thành checklist trước khi kết ca."
        tone="info"
        badge={{
          children: `${state.checklist.done}/${state.checklist.total} xong`,
          variant: "info",
        }}
      >
        <EmployeeDetailList
          rows={[
            {
              label: "Chi nhánh",
              value: state.branchName ?? "Chưa ghi nhận",
              muted: !state.branchName,
            },
            {
              label: "Giờ vào",
              value: formatTime(state.attendance?.checkIn ?? null),
            },
          ]}
        />
        <Button asChild size="touch" className="w-full sm:w-fit">
          <Link href="/employee/tasks">
            <IconListChecks data-icon="inline-start" />
            Việc trong ca
          </Link>
        </Button>
      </EmployeePanel>
    );
  }

  if (state.status === "ready_to_checkout") {
    return (
      <EmployeePanel
        icon={IconClock}
        title="Gửi duyệt kết ca"
        description={`Gửi kết ca cho ${state.approvalTargetLabel} duyệt.`}
        tone="success"
        badge={{ children: "Sẵn sàng gửi duyệt", variant: "success" }}
      >
        <EmployeeDetailList
          rows={[
            {
              label: "Chi nhánh",
              value: state.branchName ?? "Chưa ghi nhận",
              muted: !state.branchName,
            },
            {
              label: "Checklist",
              value: `${state.checklist.done}/${state.checklist.total} xong`,
            },
            {
              label: "Giờ vào",
              value: formatTime(state.attendance?.checkIn ?? null),
            },
          ]}
        />

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
          Gửi kết ca
        </Button>

        {checkoutState === "submitting" ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner />
            Đang gửi yêu cầu...
          </div>
        ) : null}
      </EmployeePanel>
    );
  }

  return (
    <EmployeePanel
      icon={IconCamera}
      title="Chấm công vào"
      description="Chụp ảnh để bắt đầu ca hôm nay."
      tone="info"
      badge={{
        children: photoState === "success" ? "Đã ghi nhận" : "Chưa vào ca",
        variant: photoState === "success" ? "success" : "info",
      }}
    >
      <EmployeeDetailList
        rows={[
          {
            label: "Chi nhánh",
            value: state.branchName ?? "Chưa gắn",
            muted: !state.branchName,
          },
          {
            label: "Ca hôm nay",
            value: state.nextShift?.shiftName ?? "Chưa xếp ca",
            muted: !state.nextShift,
          },
        ]}
      />

      <div
        className={
          cameraActive || !previewUrl
            ? "overflow-hidden rounded-lg border bg-muted/40"
            : "hidden"
        }
        aria-hidden={!cameraActive && Boolean(previewUrl)}
      >
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
              {cameraState === "starting" ? (
                <Spinner />
              ) : (
                <IconCamera className="size-6" />
              )}
              <span>
                {cameraState === "starting"
                  ? "Đang mở camera"
                  : "Camera chưa mở"}
              </span>
            </div>
          )}
        </div>
      </div>

      {!cameraActive && previewUrl ? (
        <div className="flex items-center gap-3 rounded-md border bg-muted/40 p-3">
          <Image
            src={previewUrl}
            alt=""
            width={48}
            height={48}
            className="size-12 rounded-md object-cover"
            unoptimized
          />
          <div className="min-w-0 text-sm">
            <p className="font-medium">Ảnh chấm công đã sẵn sàng</p>
            <p className="truncate text-muted-foreground">{photo?.name}</p>
          </div>
        </div>
      ) : null}

      {error ? <ErrorAlert message={error} /> : null}

      <div className="grid gap-2 sm:grid-cols-2">
        {cameraState === "ready" || cameraState === "capturing" ? (
          <>
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
              Chụp ảnh
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
          </>
        ) : (
          <Button
            type="button"
            variant={photo ? "outline" : "default"}
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
              ? "Đang mở camera"
              : photo
                ? "Chụp lại"
                : "Mở camera"}
          </Button>
        )}
        <Button
          type="button"
          size="touch"
          onClick={submitClockIn}
          disabled={
            !photo || isPending || cameraActive || photoState === "submitting"
          }
        >
          {photoState === "submitting" || isPending ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <IconCircleCheck data-icon="inline-start" />
          )}
          Chấm công vào
        </Button>
      </div>
    </EmployeePanel>
  );
}
