"use client";

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
type CheckoutState = "idle" | "manual" | "scanning" | "submitting" | "success" | "error";

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

async function loadImage(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function compressPhoto(file: File): Promise<File> {
  try {
    const image = await loadImage(file);
    const scale = Math.min(
      1,
      MAX_CLIENT_PHOTO_EDGE / Math.max(image.naturalWidth, image.naturalHeight),
    );
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(image, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/webp", PHOTO_QUALITY);
    });
    if (!blob) return file;
    return new File([blob], "attendance.webp", { type: "image/webp" });
  } catch {
    return file;
  }
}

export function ClockClient({ state }: ClockClientProps) {
  const router = useRouter();
  const [photoState, setPhotoState] = useState<PhotoState>("idle");
  const [checkoutState, setCheckoutState] = useState<CheckoutState>("idle");
  const [photo, setPhoto] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const photoInputRef = useRef<HTMLInputElement>(null);
  const scannerRef = useRef<HTMLDivElement>(null);
  const html5QrRef = useRef<unknown>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const stopQrScan = useCallback((resetState = true) => {
    const scanner = html5QrRef.current as { stop: () => Promise<void> } | null;
    if (scanner) {
      void scanner.stop().catch(() => {});
      html5QrRef.current = null;
    }
    if (resetState) setCheckoutState("idle");
  }, []);

  useEffect(() => () => stopQrScan(false), [stopQrScan]);

  const handlePhotoSelected = useCallback(
    (file: File | undefined) => {
      if (!file) return;
      setError(null);
      setPhotoState("idle");
      startTransition(async () => {
        const compressed = await compressPhoto(file);
        setPhoto(compressed);
        setPhotoState("ready");
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setPreviewUrl(URL.createObjectURL(compressed));
      });
    },
    [previewUrl],
  );

  const submitClockIn = useCallback(() => {
    if (!photo) {
      setError("Cần chụp hoặc chọn ảnh chấm công.");
      return;
    }

    setPhotoState("submitting");
    setError(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("photo", photo);
      const result = await clockInWithPhoto(null, formData);

      if (result.success) {
        setPhotoState("success");
        if (navigator.vibrate) navigator.vibrate(150);
        router.push("/employee/tasks");
        router.refresh();
      } else {
        setPhotoState("error");
        setError(result.error ?? "Chấm công vào thất bại.");
      }
    });
  }, [photo, router]);

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

      <input
        ref={photoInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="user"
        className="sr-only"
        onChange={(event) => handlePhotoSelected(event.target.files?.[0])}
      />

      {previewUrl ? (
        <div className="flex items-center gap-3 rounded-md border bg-muted/40 p-3">
          <img
            src={previewUrl}
            alt=""
            className="size-12 rounded-md object-cover"
          />
          <div className="min-w-0 text-sm">
            <p className="font-medium">Ảnh chấm công đã sẵn sàng</p>
            <p className="truncate text-muted-foreground">{photo?.name}</p>
          </div>
        </div>
      ) : null}

      {error ? <ErrorAlert message={error} /> : null}

      <div className="grid gap-2 sm:grid-cols-2">
        <Button
          type="button"
          variant={photo ? "outline" : "default"}
          size="touch"
          onClick={() => photoInputRef.current?.click()}
          disabled={isPending || photoState === "submitting"}
        >
          <IconCamera data-icon="inline-start" />
          {photo ? "Chụp lại" : "Chụp ảnh"}
        </Button>
        <Button
          type="button"
          size="touch"
          onClick={submitClockIn}
          disabled={!photo || isPending || photoState === "submitting"}
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
