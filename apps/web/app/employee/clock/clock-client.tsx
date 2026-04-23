"use client";

import { useState, useCallback, useTransition, useRef } from "react";
import {
  IconMapPin,
  IconCircleCheck,
  IconCircleX,
  IconClock,
  IconKeyboard,
  IconCamera,
} from "@tabler/icons-react";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Card, CardContent } from "@comtammatu/ui/components/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@comtammatu/ui/components/empty";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { Input } from "@comtammatu/ui/components/input";
import { Label } from "@comtammatu/ui/components/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { cn } from "@comtammatu/ui";
import { clockIn, clockOut } from "./actions";

/* ─── Types ─── */

interface Branch {
  id: number;
  name: string;
  lat: number;
  lng: number;
}

interface InitialStatus {
  clockedIn: boolean;
  clockedOut: boolean;
  checkInTime: string | null;
  checkOutTime: string | null;
  branchName: string | null;
}

type ClockState =
  | "idle"
  | "checking_gps"
  | "gps_passed"
  | "scanning_code"
  | "entering_code"
  | "verifying"
  | "success"
  | "gps_failed"
  | "code_invalid"
  | "error";

interface ClockClientProps {
  initialStatus: InitialStatus;
  branches: Branch[];
  defaultBranchId: number | null;
}

function getStateRingClassName(state: ClockState) {
  if (state === "checking_gps" || state === "verifying") return "bg-warning/12";
  if (state === "gps_passed" || state === "success") return "bg-success/12";
  if (state === "gps_failed" || state === "code_invalid" || state === "error") {
    return "bg-destructive/12";
  }
  if (state === "scanning_code" || state === "entering_code") {
    return "bg-info/12";
  }
  return "bg-muted";
}

function getStateIconClassName(state: ClockState) {
  if (state === "checking_gps" || state === "verifying") return "text-warning";
  if (state === "gps_passed" || state === "success") return "text-success";
  if (state === "gps_failed" || state === "code_invalid" || state === "error") {
    return "text-destructive";
  }
  if (state === "scanning_code" || state === "entering_code") {
    return "text-info";
  }
  return "text-muted-foreground";
}

/* ─── Helpers ─── */

function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Ho_Chi_Minh",
  });
}

/* ─── Component ─── */

export function ClockClient({
  initialStatus,
  branches,
  defaultBranchId,
}: ClockClientProps) {
  const [state, setState] = useState<ClockState>("idle");
  const [status, setStatus] = useState(initialStatus);
  const [error, setError] = useState<string | null>(null);
  const [gpsDistance, setGpsDistance] = useState<number | null>(null);
  const [userCoords, setUserCoords] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [manualCode, setManualCode] = useState("");
  const [selectedBranchId, setSelectedBranchId] = useState<number | null>(
    () => {
      // Prefer the user's assigned branch, but only if it exists in the GPS-enabled list
      if (
        defaultBranchId != null &&
        branches.some((b) => b.id === defaultBranchId)
      ) {
        return defaultBranchId;
      }
      return branches[0]?.id ?? null;
    },
  );
  const [isPending, startTransition] = useTransition();
  const scannerRef = useRef<HTMLDivElement>(null);
  const html5QrRef = useRef<unknown>(null);

  const selectedBranch = branches.find((b) => b.id === selectedBranchId);

  // ── GPS Check ──
  const checkGps = useCallback(() => {
    if (!selectedBranch) {
      setError("Vui lòng chọn chi nhánh");
      return;
    }

    setState("checking_gps");
    setError(null);

    if (!navigator.geolocation) {
      setState("gps_failed");
      setError("Trình duyệt không hỗ trợ GPS");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setUserCoords({ lat: latitude, lng: longitude });

        const dist = haversineMeters(
          latitude,
          longitude,
          selectedBranch.lat,
          selectedBranch.lng,
        );
        setGpsDistance(Math.round(dist));

        if (dist <= 200) {
          setState("gps_passed");
        } else {
          setState("gps_failed");
          setError(
            `Bạn đang cách chi nhánh ${Math.round(dist)}m. Phải ở trong 200m.`,
          );
        }
      },
      (err) => {
        setState("gps_failed");
        if (err.code === 1) {
          setError("Bạn đã từ chối quyền GPS. Vui lòng bật GPS và thử lại.");
        } else if (err.code === 2) {
          setError("Không xác định được vị trí. Vui lòng thử lại.");
        } else {
          setError("GPS quá chậm. Vui lòng thử lại.");
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  }, [selectedBranch]);

  // ── QR Scan ──
  const startQrScan = useCallback(async () => {
    setState("scanning_code");
    setError(null);

    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      const scannerId = "qr-reader";

      // Ensure the scanner div exists
      if (!scannerRef.current) return;

      const scanner = new Html5Qrcode(scannerId);
      html5QrRef.current = scanner;

      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText: string) => {
          // QR code scanned — extract 6-digit hex code
          const code = decodedText.trim().slice(0, 6);
          if (/^[0-9a-f]{6}$/i.test(code)) {
            void scanner.stop().catch(() => {});
            html5QrRef.current = null;
            submitClockIn(code);
          }
        },
        () => {
          // Ignore scan failures (camera actively scanning)
        },
      );
    } catch {
      setState("gps_passed");
      setError("Không thể mở camera. Vui lòng nhập mã thủ công.");
    }
  }, []);

  const stopQrScan = useCallback(() => {
    const scanner = html5QrRef.current as { stop: () => Promise<void> } | null;
    if (scanner) {
      void scanner.stop().catch(() => {});
      html5QrRef.current = null;
    }
    setState("gps_passed");
  }, []);

  // ── Submit IconClock In ──
  const submitClockIn = useCallback(
    (code: string) => {
      if (!selectedBranchId || !userCoords) return;

      setState("verifying");
      setError(null);

      startTransition(async () => {
        const result = await clockIn({
          branchId: selectedBranchId,
          lat: userCoords.lat,
          lng: userCoords.lng,
          code,
        });

        if (result.success && result.data) {
          setState("success");
          setStatus({
            clockedIn: true,
            clockedOut: false,
            checkInTime: result.data.checkInTime,
            checkOutTime: null,
            branchName: selectedBranch?.name ?? null,
          });
          // Haptic feedback
          if (navigator.vibrate) {
            navigator.vibrate(200);
          }
        } else {
          setState("code_invalid");
          setError(result.error ?? "Chấm công thất bại");
        }
      });
    },
    [selectedBranchId, userCoords, selectedBranch],
  );

  // ── Submit IconClock Out ──
  const handleClockOut = useCallback(() => {
    startTransition(async () => {
      const result = await clockOut();
      if (result.success && result.data) {
        setStatus((prev) => ({
          ...prev,
          clockedIn: false,
          clockedOut: true,
          checkOutTime: result.data?.checkOutTime ?? null,
        }));
        if (navigator.vibrate) {
          navigator.vibrate(200);
        }
      } else {
        setError(result.error ?? "Chấm công ra thất bại");
      }
    });
  }, []);

  // ── Already completed today ──
  if (status.clockedOut) {
    return (
      <div className="flex flex-col items-center gap-6 py-8">
        <div className="flex size-24 items-center justify-center rounded-full bg-success/12">
          <IconCircleCheck className="size-12 text-success" />
        </div>
        <div className="text-center">
          <h2 className="text-lg font-semibold">Đã hoàn thành chấm công</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Hôm nay bạn đã chấm công đầy đủ
          </p>
        </div>
        <Card className="w-full max-w-xs">
          <CardContent className="flex flex-col gap-2 text-sm">
            {status.branchName && (
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Chi nhánh</span>
                <span className="font-medium">{status.branchName}</span>
              </div>
            )}
            {status.checkInTime && (
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Giờ vào</span>
                <span className="font-mono font-medium">
                  {formatTime(status.checkInTime)}
                </span>
              </div>
            )}
            {status.checkOutTime && (
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Giờ ra</span>
                <span className="font-mono font-medium">
                  {formatTime(status.checkOutTime)}
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Currently clocked in (show clock-out) ──
  if (status.clockedIn) {
    return (
      <div className="flex flex-col items-center gap-6 py-8">
        <div className="flex size-24 items-center justify-center rounded-full bg-info/12">
          <IconClock className="size-12 text-info" />
        </div>
        <div className="text-center">
          <h2 className="text-lg font-semibold">Đang làm việc</h2>
          {status.branchName && (
            <p className="mt-1 text-sm text-muted-foreground">
              {status.branchName}
            </p>
          )}
          {status.checkInTime && (
            <p className="mt-1 text-sm text-muted-foreground">
              Vào lúc {formatTime(status.checkInTime)}
            </p>
          )}
        </div>

        <Button
          size="lg"
          variant="destructive"
          className="w-full max-w-xs"
          onClick={handleClockOut}
          disabled={isPending}
        >
          {isPending ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <IconClock data-icon="inline-start" />
          )}
          Chấm công ra
        </Button>

        {error && (
          <p className="text-center text-sm text-destructive">{error}</p>
        )}
      </div>
    );
  }

  // ── No branches configured with GPS — clock-in cannot proceed ──
  if (branches.length === 0) {
    return (
      <Empty>
        <EmptyMedia variant="icon">
          <IconCircleX />
        </EmptyMedia>
        <EmptyHeader>
          <EmptyTitle>Chưa thể chấm công</EmptyTitle>
          <EmptyDescription>
            Chi nhánh chưa được thiết lập toạ độ GPS. Liên hệ quản lý để cấu
            hình vị trí chi nhánh trong mục Thiết lập.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  // ── IconClock-in flow ──
  return (
    <div className="flex flex-col items-center gap-6 py-4">
      {/* Status ring */}
      <div
        className={cn(
          "flex size-24 items-center justify-center rounded-full transition-colors",
          getStateRingClassName(state),
        )}
      >
        {state === "idle" && (
          <IconMapPin className="size-10 text-muted-foreground" />
        )}
        {state === "checking_gps" && (
          <Spinner className={cn("size-10", getStateIconClassName(state))} />
        )}
        {state === "gps_passed" && (
          <IconCircleCheck
            className={cn("size-10", getStateIconClassName(state))}
          />
        )}
        {state === "gps_failed" && (
          <IconCircleX className={cn("size-10", getStateIconClassName(state))} />
        )}
        {(state === "scanning_code" || state === "entering_code") && (
          <IconCamera className={cn("size-10", getStateIconClassName(state))} />
        )}
        {state === "verifying" && (
          <Spinner className={cn("size-10", getStateIconClassName(state))} />
        )}
        {state === "success" && (
          <IconCircleCheck
            className={cn("size-10", getStateIconClassName(state))}
          />
        )}
        {(state === "code_invalid" || state === "error") && (
          <IconCircleX className={cn("size-10", getStateIconClassName(state))} />
        )}
      </div>

      {/* GPS distance indicator */}
      {gpsDistance != null && (
        <Badge variant={gpsDistance <= 200 ? "success" : "destructive"}>
          <IconMapPin data-icon="inline-start" />
          {gpsDistance}m
        </Badge>
      )}

      {/* Branch selection */}
      {branches.length > 1 &&
        state !== "scanning_code" &&
        state !== "verifying" &&
        state !== "success" && (
          <div className="flex w-full max-w-xs flex-col gap-2">
            <Label>Chi nhánh</Label>
            <Select
              value={selectedBranchId?.toString() ?? ""}
              onValueChange={(v) => {
                setSelectedBranchId(Number(v));
                setState("idle");
                setGpsDistance(null);
                setError(null);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Chọn chi nhánh" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={b.id.toString()}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        )}

      {/* QR Scanner area */}
      {state === "scanning_code" && (
        <div className="flex w-full max-w-xs flex-col gap-3">
          <div
            ref={scannerRef}
            id="qr-reader"
            className="overflow-hidden rounded-lg"
          />
          <Button
            variant="outline"
            className="w-full"
            onClick={stopQrScan}
            size="sm"
          >
            Hủy quét
          </Button>
        </div>
      )}

      {/* Manual code entry */}
      {state === "entering_code" && (
        <div className="flex w-full max-w-xs flex-col gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="manual-code">Nhập mã chấm công (6 ký tự)</Label>
            <Input
              id="manual-code"
              placeholder="abc123"
              maxLength={6}
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              className="text-center font-mono text-lg"
              autoFocus
            />
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => {
                setState("gps_passed");
                setManualCode("");
                setError(null);
              }}
            >
              Quay lại
            </Button>
            <Button
              className="flex-1"
              disabled={manualCode.length !== 6 || isPending}
              onClick={() => submitClockIn(manualCode)}
            >
              {isPending && <Spinner data-icon="inline-start" />}
              Xác nhận
            </Button>
          </div>
        </div>
      )}

      {/* Error message */}
      {error && (
        <p className="max-w-xs text-center text-sm text-destructive">{error}</p>
      )}

      {/* Primary action button */}
      {state === "idle" && (
        <Button size="lg" className="w-full max-w-xs" onClick={checkGps}>
          <IconMapPin data-icon="inline-start" />
          Bắt đầu chấm công
        </Button>
      )}

      {(state === "gps_failed" ||
        state === "code_invalid" ||
        state === "error") && (
        <Button
          size="lg"
          className="w-full max-w-xs"
          onClick={() => {
            setError(null);
            if (state === "gps_failed") {
              checkGps();
            } else {
              setState("gps_passed");
            }
          }}
        >
          Thử lại
        </Button>
      )}

      {state === "gps_passed" && (
        <div className="flex w-full max-w-xs flex-col gap-3">
          <Button size="lg" className="w-full" onClick={startQrScan}>
            <IconCamera data-icon="inline-start" />
            Quét mã QR
          </Button>
          <Button
            type="button"
            variant="link"
            size="lg"
            className="w-full"
            onClick={() => {
              setState("entering_code");
              setManualCode("");
              setError(null);
            }}
          >
            <IconKeyboard data-icon="inline-start" />
            Nhập mã thủ công
          </Button>
        </div>
      )}

      {state === "verifying" && (
        <p className="text-sm text-muted-foreground">Đang xác minh...</p>
      )}

      {state === "success" && (
        <div className="text-center">
          <h2 className="text-lg font-semibold text-success">
            Chấm công thành công!
          </h2>
          {status.checkInTime && (
            <p className="mt-1 text-sm text-muted-foreground">
              Vào lúc {formatTime(status.checkInTime)}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
