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
  Keyboard as IconKeyboard,
  ListChecks as IconListChecks,
  QrCode as IconQrCode,
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
import { Input } from "@comtammatu/ui/components/input";
import { Label } from "@comtammatu/ui/components/label";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { ACTIONS_VI } from "@comtammatu/shared/messages";
import { formatVNTime } from "@comtammatu/shared/time";
import { EmployeeDetailList, EmployeePanel } from "../components/employee-page";
import type { TodayWorkState } from "../_lib/today-work-state";
import { clockInWithPhoto, clockOutWithCode } from "./actions";

interface ClockClientProps {
  state: TodayWorkState;
}

type PhotoState = "idle" | "ready" | "submitting" | "success" | "error";
type CameraState = "idle" | "starting" | "ready" | "capturing" | "error";
type CheckoutState =
  | "idle"
  | "manual"
  | "scanning"
  | "submitting"
  | "success"
  | "error";

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
  const [manualCode, setManualCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const videoRef = useRef<HTMLVideoElement>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const scannerRef = useRef<HTMLDivElement>(null);
  const html5QrRef = useRef<unknown>(null);

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

  const stopQrScan = useCallback((resetState = true) => {
    const scanner = html5QrRef.current as { stop: () => Promise<void> } | null;
    if (scanner) {
      void scanner.stop().catch(() => {});
      html5QrRef.current = null;
    }
    if (resetState) setCheckoutState("idle");
  }, []);

  useEffect(() => () => stopQrScan(false), [stopQrScan]);

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
        router.push("/employee/tasks");
        router.refresh();
      } else {
        setPhotoState("error");
        setError(result.error ?? "Chấm công vào thất bại.");
      }
    });
  }, [photo, router, stopCamera]);

  const submitCheckout = useCallback(
    (code: string) => {
      setCheckoutState("submitting");
      setError(null);
      startTransition(async () => {
        const result = await clockOutWithCode({ code });
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
    },
    [router],
  );

  const startQrScan = useCallback(async () => {
    setCheckoutState("scanning");
    setError(null);

    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      const scannerId = "qr-reader";
      if (!scannerRef.current) return;

      const scanner = new Html5Qrcode(scannerId);
      html5QrRef.current = scanner;

      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        (decodedText: string) => {
          const code = decodedText.trim().slice(0, 6);
          if (/^[0-9a-f]{6}$/i.test(code)) {
            void scanner.stop().catch(() => {});
            html5QrRef.current = null;
            submitCheckout(code);
          }
        },
        () => {},
      );
    } catch {
      setCheckoutState("manual");
      setError("Không thể mở camera quét mã. Nhập mã kết ca thủ công.");
    }
  }, [submitCheckout]);

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
        title="Kết ca làm"
        description="Quét QR hoặc nhập mã kết ca tại chi nhánh."
        tone="success"
        badge={{ children: "Sẵn sàng kết ca", variant: "success" }}
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
          ]}
        />

        {checkoutState === "scanning" ? (
          <div className="flex flex-col gap-3">
            <div
              ref={scannerRef}
              id="qr-reader"
              className="overflow-hidden rounded-lg border"
            />
            <Button variant="outline" onClick={() => stopQrScan()} size="sm">
              Hủy quét
            </Button>
          </div>
        ) : null}

        {checkoutState === "manual" || checkoutState === "error" ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="checkout-code">Mã kết ca</Label>
              <Input
                id="checkout-code"
                placeholder="abc123"
                maxLength={6}
                value={manualCode}
                onChange={(event) => setManualCode(event.target.value)}
                className="text-center font-mono text-lg"
                autoFocus
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setManualCode("");
                  setError(null);
                  setCheckoutState("idle");
                }}
              >
                {ACTIONS_VI.back}
              </Button>
              <Button
                disabled={manualCode.length !== 6 || isPending}
                onClick={() => submitCheckout(manualCode)}
              >
                {isPending ? <Spinner data-icon="inline-start" /> : null}
                {ACTIONS_VI.confirm}
              </Button>
            </div>
          </div>
        ) : null}

        {error ? <ErrorAlert message={error} /> : null}

        {checkoutState === "idle" ? (
          <div className="grid gap-2 sm:grid-cols-2">
            <Button size="touch" onClick={startQrScan}>
              <IconQrCode data-icon="inline-start" />
              Quét mã QR
            </Button>
            <Button
              type="button"
              variant="outline"
              size="touch"
              onClick={() => {
                setCheckoutState("manual");
                setManualCode("");
                setError(null);
              }}
            >
              <IconKeyboard data-icon="inline-start" />
              Nhập mã
            </Button>
          </div>
        ) : null}

        {checkoutState === "submitting" ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner />
            Đang kết ca...
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
            !photo ||
            isPending ||
            cameraActive ||
            photoState === "submitting"
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
