"use client";

import { useCallback, useRef, useState, useTransition } from "react";
import {
  Camera as IconCamera,
  CircleCheck as IconCircleCheck,
  CircleX as IconCircleX,
  Clock as IconClock,
  Keyboard as IconKeyboard,
  MapPin as IconMapPin,
} from "lucide-react";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@comtammatu/ui/components/alert";
import type { BadgeProps } from "@comtammatu/ui/components/badge";
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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { ACTIONS_VI, BRANCH_VI } from "@comtammatu/shared/messages";
import { EmployeeDetailList, EmployeePanel } from "../components/employee-page";
import { clockIn, clockOut } from "./actions";

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

const STATE_LABELS: Record<ClockState, string> = {
  idle: "Sẵn sàng",
  checking_gps: "Đang kiểm tra GPS",
  gps_passed: "GPS hợp lệ",
  scanning_code: "Đang quét QR",
  entering_code: "Nhập mã",
  verifying: "Đang xác minh",
  success: "Thành công",
  gps_failed: "GPS chưa hợp lệ",
  code_invalid: "Mã chưa đúng",
  error: "Có lỗi",
};

const STATE_TONES: Record<ClockState, BadgeProps["variant"]> = {
  idle: "secondary",
  checking_gps: "warning",
  gps_passed: "success",
  scanning_code: "info",
  entering_code: "info",
  verifying: "warning",
  success: "success",
  gps_failed: "destructive",
  code_invalid: "destructive",
  error: "destructive",
};

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

function ErrorAlert({ message }: { message: string }) {
  return (
    <Alert variant="destructive">
      <IconCircleX />
      <AlertTitle>Chưa thể tiếp tục</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}

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
      if (
        defaultBranchId != null &&
        branches.some((branch) => branch.id === defaultBranchId)
      ) {
        return defaultBranchId;
      }
      return branches[0]?.id ?? null;
    },
  );
  const [isPending, startTransition] = useTransition();
  const scannerRef = useRef<HTMLDivElement>(null);
  const html5QrRef = useRef<unknown>(null);

  const selectedBranch = branches.find(
    (branch) => branch.id === selectedBranchId,
  );

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

        const distance = haversineMeters(
          latitude,
          longitude,
          selectedBranch.lat,
          selectedBranch.lng,
        );
        setGpsDistance(Math.round(distance));

        if (distance <= 200) {
          setState("gps_passed");
        } else {
          setState("gps_failed");
          setError(
            `Bạn đang cách chi nhánh ${Math.round(distance)}m. Phải ở trong 200m.`,
          );
        }
      },
      (gpsError) => {
        setState("gps_failed");
        if (gpsError.code === 1) {
          setError("Bạn đã từ chối quyền GPS. Vui lòng bật GPS và thử lại.");
        } else if (gpsError.code === 2) {
          setError("Không xác định được vị trí. Vui lòng thử lại.");
        } else {
          setError("GPS quá chậm. Vui lòng thử lại.");
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  }, [selectedBranch]);

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
          if (navigator.vibrate) navigator.vibrate(200);
        } else {
          setState("code_invalid");
          setError(result.error ?? "Chấm công thất bại");
        }
      });
    },
    [selectedBranchId, userCoords, selectedBranch],
  );

  const startQrScan = useCallback(async () => {
    setState("scanning_code");
    setError(null);

    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      const scannerId = "qr-reader";
      if (!scannerRef.current) return;

      const scanner = new Html5Qrcode(scannerId);
      html5QrRef.current = scanner;

      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText: string) => {
          const code = decodedText.trim().slice(0, 6);
          if (/^[0-9a-f]{6}$/i.test(code)) {
            void scanner.stop().catch(() => {});
            html5QrRef.current = null;
            submitClockIn(code);
          }
        },
        () => {},
      );
    } catch {
      setState("gps_passed");
      setError("Không thể mở camera. Vui lòng nhập mã thủ công.");
    }
  }, [submitClockIn]);

  const stopQrScan = useCallback(() => {
    const scanner = html5QrRef.current as { stop: () => Promise<void> } | null;
    if (scanner) {
      void scanner.stop().catch(() => {});
      html5QrRef.current = null;
    }
    setState("gps_passed");
  }, []);

  const handleClockOut = useCallback(() => {
    setError(null);
    startTransition(async () => {
      const result = await clockOut();
      if (result.success && result.data) {
        setStatus((prev) => ({
          ...prev,
          clockedIn: false,
          clockedOut: true,
          checkOutTime: result.data?.checkOutTime ?? null,
        }));
        if (navigator.vibrate) navigator.vibrate(200);
      } else {
        setError(result.error ?? "Chấm công ra thất bại");
      }
    });
  }, []);

  if (status.clockedOut) {
    return (
      <EmployeePanel
        icon={IconCircleCheck}
        title="Đã hoàn thành chấm công"
        description="Hôm nay bạn đã có đủ giờ vào và giờ ra."
        tone="success"
        badge={{ children: "Hoàn thành", variant: "success" }}
      >
        <EmployeeDetailList
          rows={[
            {
              label: BRANCH_VI.long,
              value: status.branchName ?? "Chưa ghi nhận",
              muted: !status.branchName,
            },
            {
              label: "Giờ vào",
              value: status.checkInTime ? formatTime(status.checkInTime) : "—",
            },
            {
              label: "Giờ ra",
              value: status.checkOutTime
                ? formatTime(status.checkOutTime)
                : "—",
            },
          ]}
        />
      </EmployeePanel>
    );
  }

  if (status.clockedIn) {
    return (
      <EmployeePanel
        icon={IconClock}
        title="Đang làm việc"
        description={
          status.branchName ?? "Chi nhánh đã ghi nhận chấm công vào."
        }
        tone="info"
        badge={{ children: "Đang mở", variant: "info" }}
      >
        <EmployeeDetailList
          rows={[
            {
              label: "Giờ vào",
              value: status.checkInTime ? formatTime(status.checkInTime) : "—",
            },
            { label: "Giờ ra", value: "—", muted: true },
          ]}
        />
        <div className="flex">
          <Button
            size="lg"
            variant="destructive"
            className="w-full sm:w-fit"
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
        </div>
        {error ? <ErrorAlert message={error} /> : null}
      </EmployeePanel>
    );
  }

  if (branches.length === 0) {
    return (
      <Empty>
        <EmptyMedia variant="icon">
          <IconCircleX />
        </EmptyMedia>
        <EmptyHeader>
          <EmptyTitle>Chưa thể chấm công</EmptyTitle>
          <EmptyDescription>
            Chi nhánh chưa được thiết lập tọa độ GPS. Liên hệ quản lý để cấu
            hình vị trí chi nhánh trong mục Thiết lập.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <EmployeePanel
      icon={IconMapPin}
      title="Chấm công vào"
      description="Kiểm tra GPS trước, sau đó quét QR hoặc nhập mã chi nhánh."
      tone="info"
      badge={{ children: STATE_LABELS[state], variant: STATE_TONES[state] }}
    >
      {branches.length > 1 &&
      state !== "scanning_code" &&
      state !== "verifying" &&
      state !== "success" ? (
        <div className="flex flex-col gap-2">
          <Label>{BRANCH_VI.long}</Label>
          <Select
            value={selectedBranchId?.toString() ?? ""}
            onValueChange={(value) => {
              setSelectedBranchId(Number(value));
              setState("idle");
              setGpsDistance(null);
              setError(null);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder={BRANCH_VI.select} />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {branches.map((branch) => (
                  <SelectItem key={branch.id} value={branch.id.toString()}>
                    {branch.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
      ) : null}

      <EmployeeDetailList
        rows={[
          {
            label: BRANCH_VI.long,
            value: selectedBranch?.name ?? "Chưa chọn",
            muted: !selectedBranch,
          },
          {
            label: "Khoảng cách GPS",
            value: gpsDistance == null ? "Chưa kiểm tra" : `${gpsDistance}m`,
            muted: gpsDistance == null,
          },
        ]}
      />

      {state === "scanning_code" ? (
        <div className="flex flex-col gap-3">
          <div
            ref={scannerRef}
            id="qr-reader"
            className="overflow-hidden rounded-lg border"
          />
          <Button variant="outline" onClick={stopQrScan} size="sm">
            Hủy quét
          </Button>
        </div>
      ) : null}

      {state === "entering_code" ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="manual-code">Mã chấm công</Label>
            <Input
              id="manual-code"
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
                setState("gps_passed");
                setManualCode("");
                setError(null);
              }}
            >
              {ACTIONS_VI.back}
            </Button>
            <Button
              disabled={manualCode.length !== 6 || isPending}
              onClick={() => submitClockIn(manualCode)}
            >
              {isPending ? <Spinner data-icon="inline-start" /> : null}
              {ACTIONS_VI.confirm}
            </Button>
          </div>
        </div>
      ) : null}

      {error ? <ErrorAlert message={error} /> : null}

      {state === "idle" ? (
        <Button size="lg" className="w-full sm:w-fit" onClick={checkGps}>
          <IconMapPin data-icon="inline-start" />
          Bắt đầu chấm công
        </Button>
      ) : null}

      {state === "gps_failed" ||
      state === "code_invalid" ||
      state === "error" ? (
        <Button
          size="lg"
          className="w-full sm:w-fit"
          onClick={() => {
            setError(null);
            if (state === "gps_failed") {
              checkGps();
            } else {
              setState("gps_passed");
            }
          }}
        >
          {ACTIONS_VI.retry}
        </Button>
      ) : null}

      {state === "gps_passed" ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <Button size="lg" onClick={startQrScan}>
            <IconCamera data-icon="inline-start" />
            Quét mã QR
          </Button>
          <Button
            type="button"
            variant="outline"
            size="lg"
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
      ) : null}

      {state === "checking_gps" || state === "verifying" ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner />
          {state === "checking_gps"
            ? "Đang kiểm tra GPS..."
            : "Đang xác minh..."}
        </div>
      ) : null}

      {state === "success" ? (
        <div className="flex items-center gap-2 text-sm text-success">
          <IconCircleCheck className="size-4" />
          Chấm công thành công.
        </div>
      ) : null}
    </EmployeePanel>
  );
}
