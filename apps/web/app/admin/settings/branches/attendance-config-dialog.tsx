"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { Key, MapPin, Loader2, Copy, RefreshCw, Locate } from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import { Input } from "@comtammatu/ui/components/input";
import { Label } from "@comtammatu/ui/components/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@comtammatu/ui/components/dialog";
import { toast } from "@comtammatu/ui/components/sonner";
import {
  updateBranchCoordinates,
  generateAttendanceSecret,
  getTodayCode,
} from "./attendance-actions";

interface AttendanceConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  branch: {
    id: number;
    name: string;
    latitude: number | null;
    longitude: number | null;
    hasSecret: boolean;
  };
}

export function AttendanceConfigDialog({
  open,
  onOpenChange,
  branch,
}: AttendanceConfigDialogProps) {
  const [coordsState, coordsAction, coordsPending] = useActionState(
    updateBranchCoordinates,
    null,
  );
  const [isPending, startTransition] = useTransition();
  const [todayCode, setTodayCode] = useState<string | null>(null);
  const [todayDate, setTodayDate] = useState<string | null>(null);
  const [lat, setLat] = useState(branch.latitude?.toString() ?? "");
  const [lng, setLng] = useState(branch.longitude?.toString() ?? "");
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  // Toast on coords save success
  useEffect(() => {
    if (coordsState?.success) {
      toast.success("Đã cập nhật tọa độ GPS");
    }
  }, [coordsState]);

  // Sync coords when branch changes
  useEffect(() => {
    setLat(branch.latitude?.toString() ?? "");
    setLng(branch.longitude?.toString() ?? "");
    setGeoError(null);
  }, [branch.id, branch.latitude, branch.longitude]);

  // Reset code when dialog opens/closes
  useEffect(() => {
    if (!open) {
      setTodayCode(null);
      setTodayDate(null);
    }
  }, [open]);

  function handleGetLocation() {
    if (!navigator.geolocation) {
      setGeoError("Trình duyệt không hỗ trợ GPS");
      return;
    }
    setGeoLoading(true);
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLat(position.coords.latitude.toFixed(7));
        setLng(position.coords.longitude.toFixed(7));
        setGeoLoading(false);
      },
      (err) => {
        setGeoLoading(false);
        setGeoError(
          err.code === 1
            ? "Bạn đã từ chối quyền GPS. Vui lòng bật và thử lại."
            : "Không xác định được vị trí. Vui lòng thử lại.",
        );
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  }

  function handleGenerateSecret() {
    startTransition(async () => {
      const result = await generateAttendanceSecret(branch.id);
      if (result.success && result.data) {
        setTodayCode(result.data.code);
        setTodayDate(result.data.date);
        toast.success("Đã tạo mã bí mật mới");
      } else {
        toast.error(result.error ?? "Lỗi");
      }
    });
  }

  function handleShowCode() {
    startTransition(async () => {
      const result = await getTodayCode(branch.id);
      if (result.success && result.data) {
        setTodayCode(result.data.code);
        setTodayDate(result.data.date);
      } else {
        toast.error(result.error ?? "Lỗi");
      }
    });
  }

  function handleCopyCode() {
    if (todayCode) {
      void navigator.clipboard.writeText(todayCode);
      toast.success("Đã sao chép mã");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cấu hình chấm công — {branch.name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* GPS Coordinates */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <MapPin className="size-4" />
              Tọa độ GPS
            </div>
            <form action={coordsAction} className="space-y-3">
              <input type="hidden" name="branchId" value={branch.id} />
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="latitude">Vĩ độ (Lat)</Label>
                  <Input
                    id="latitude"
                    name="latitude"
                    type="number"
                    step="0.0000001"
                    placeholder="10.7769"
                    value={lat}
                    onChange={(e) => setLat(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="longitude">Kinh độ (Lng)</Label>
                  <Input
                    id="longitude"
                    name="longitude"
                    type="number"
                    step="0.0000001"
                    placeholder="106.7009"
                    value={lng}
                    onChange={(e) => setLng(e.target.value)}
                    required
                  />
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full"
                onClick={handleGetLocation}
                disabled={geoLoading}
              >
                {geoLoading ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : (
                  <Locate className="mr-2 size-4" />
                )}
                Lấy vị trí hiện tại
              </Button>
              {geoError && (
                <p className="text-sm text-destructive">{geoError}</p>
              )}
              {coordsState?.error && (
                <p className="text-sm text-destructive">{coordsState.error}</p>
              )}
              <Button type="submit" size="sm" disabled={coordsPending}>
                {coordsPending && (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                )}
                Lưu tọa độ
              </Button>
            </form>
          </div>

          {/* Attendance Secret */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Key className="size-4" />
              Mã bí mật chấm công
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleGenerateSecret}
                disabled={isPending}
              >
                {isPending ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 size-4" />
                )}
                {branch.hasSecret ? "Tạo mã mới" : "Tạo mã bí mật"}
              </Button>

              {branch.hasSecret && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleShowCode}
                  disabled={isPending}
                >
                  Xem mã hôm nay
                </Button>
              )}
            </div>

            {todayCode && (
              <div className="rounded-lg border bg-muted/50 p-4">
                <p className="mb-1 text-xs text-muted-foreground">
                  Mã chấm công — {todayDate}
                </p>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-2xl font-bold tracking-widest">
                    {todayCode.toUpperCase()}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    onClick={handleCopyCode}
                  >
                    <Copy className="size-4" />
                  </Button>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  In mã này lên poster tại chi nhánh. Mã thay đổi mỗi ngày.
                </p>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Đóng
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
