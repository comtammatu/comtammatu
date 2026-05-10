"use client";

import { useEffect, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Key as IconKey,
  MapPin as IconMapPin,
  Copy as IconCopy,
  RefreshCw as IconRefresh,
  LocateFixed as IconCurrentLocation,
} from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { Spinner } from "@comtammatu/ui/components/spinner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@comtammatu/ui/components/dialog";
import { FieldGroup } from "@comtammatu/ui/components/field";
import { toast } from "@comtammatu/ui/components/sonner";
import { ACTIONS_VI, ERRORS_VI } from "@comtammatu/shared/messages";
import { TextField, valuesToFormData } from "@/components/form";
import { messages } from "@lib/messages";
import {
  updateBranchCoordinates,
  generateAttendanceSecret,
  getTodayCode,
} from "./attendance-actions";

const coordsSchema = z.object({
  latitude: z
    .string()
    .trim()
    .min(1, { error: "Vĩ độ không được trống" })
    .refine(
      (v) => {
        const n = Number(v);
        return Number.isFinite(n) && n >= -90 && n <= 90;
      },
      { error: "Vĩ độ phải trong khoảng -90 đến 90" },
    ),
  longitude: z
    .string()
    .trim()
    .min(1, { error: "Kinh độ không được trống" })
    .refine(
      (v) => {
        const n = Number(v);
        return Number.isFinite(n) && n >= -180 && n <= 180;
      },
      { error: "Kinh độ phải trong khoảng -180 đến 180" },
    ),
});

type CoordsFormValues = z.infer<typeof coordsSchema>;

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
  const [coordsPending, startCoordsTransition] = useTransition();
  const [secretPending, startSecretTransition] = useTransition();
  const [coordsError, setCoordsError] = useState<string | null>(null);
  const [todayCode, setTodayCode] = useState<string | null>(null);
  const [todayDate, setTodayDate] = useState<string | null>(null);
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  const form = useForm<CoordsFormValues>({
    resolver: zodResolver(coordsSchema),
    defaultValues: {
      latitude: branch.latitude?.toString() ?? "",
      longitude: branch.longitude?.toString() ?? "",
    },
  });

  useEffect(() => {
    form.reset({
      latitude: branch.latitude?.toString() ?? "",
      longitude: branch.longitude?.toString() ?? "",
    });
    setGeoError(null);
    setCoordsError(null);
  }, [branch.id, branch.latitude, branch.longitude, form]);

  useEffect(() => {
    if (!open) {
      setTodayCode(null);
      setTodayDate(null);
    }
  }, [open]);

  function handleGetLocation() {
    if (!navigator.geolocation) {
      setGeoError(messages.settings.attendance.gpsUnsupported);
      return;
    }
    setGeoLoading(true);
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        form.setValue("latitude", position.coords.latitude.toFixed(7), {
          shouldValidate: true,
        });
        form.setValue("longitude", position.coords.longitude.toFixed(7), {
          shouldValidate: true,
        });
        setGeoLoading(false);
      },
      (err) => {
        setGeoLoading(false);
        setGeoError(
          err.code === 1
            ? messages.settings.attendance.gpsDenied
            : messages.settings.attendance.gpsUnavailable,
        );
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  }

  function onValidCoords(values: CoordsFormValues) {
    startCoordsTransition(async () => {
      setCoordsError(null);
      const fd = valuesToFormData(values);
      fd.set("branchId", String(branch.id));
      const result = await updateBranchCoordinates(null, fd);
      if (!result.success) {
        setCoordsError(result.error ?? ERRORS_VI.fallback);
        return;
      }
      toast.success(messages.settings.attendance.coordinatesUpdated);
    });
  }

  function handleGenerateSecret() {
    startSecretTransition(async () => {
      const result = await generateAttendanceSecret(branch.id);
      if (result.success && result.data) {
        setTodayCode(result.data.code);
        setTodayDate(result.data.date);
        toast.success(messages.settings.attendance.secretGenerated);
      } else {
        toast.error(result.error ?? ERRORS_VI.fallback);
      }
    });
  }

  function handleShowCode() {
    startSecretTransition(async () => {
      const result = await getTodayCode(branch.id);
      if (result.success && result.data) {
        setTodayCode(result.data.code);
        setTodayDate(result.data.date);
      } else {
        toast.error(result.error ?? ERRORS_VI.fallback);
      }
    });
  }

  function handleCopyCode() {
    if (todayCode) {
      void navigator.clipboard.writeText(todayCode);
      toast.success(messages.settings.attendance.codeCopied);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>
            {messages.settings.attendance.title(branch.name)}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* GPS Coordinates */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <IconMapPin className="size-4" />
              {messages.settings.attendance.gpsTitle}
            </div>
            <form onSubmit={form.handleSubmit(onValidCoords)} noValidate>
              <FieldGroup>
                <div className="grid grid-cols-2 gap-3">
                  <TextField
                    control={form.control}
                    name="latitude"
                    label={messages.settings.attendance.latitudeLabel}
                    type="number"
                    step="0.0000001"
                    placeholder="10.7769"
                    required
                  />
                  <TextField
                    control={form.control}
                    name="longitude"
                    label={messages.settings.attendance.longitudeLabel}
                    type="number"
                    step="0.0000001"
                    placeholder="106.7009"
                    required
                  />
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
                    <Spinner className="mr-2" />
                  ) : (
                    <IconCurrentLocation className="mr-2 size-4" />
                  )}
                  {messages.settings.attendance.currentLocation}
                </Button>

                {geoError && (
                  <p className="text-sm text-destructive" role="alert">
                    {geoError}
                  </p>
                )}
                {coordsError && (
                  <p className="text-sm text-destructive" role="alert">
                    {coordsError}
                  </p>
                )}

                <Button type="submit" size="sm" disabled={coordsPending}>
                  {coordsPending && <Spinner className="mr-2" />}
                  {messages.settings.attendance.saveCoordinates}
                </Button>
              </FieldGroup>
            </form>
          </div>

          {/* Attendance Secret */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <IconKey className="size-4" />
              {messages.settings.attendance.secretTitle}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleGenerateSecret}
                disabled={secretPending}
              >
                {secretPending ? (
                  <Spinner className="mr-2" />
                ) : (
                  <IconRefresh className="mr-2 size-4" />
                )}
                {branch.hasSecret
                  ? messages.settings.attendance.generateNewSecret
                  : messages.settings.attendance.generateSecret}
              </Button>

              {branch.hasSecret && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleShowCode}
                  disabled={secretPending}
                >
                  {messages.settings.attendance.showTodayCode}
                </Button>
              )}
            </div>

            {todayCode && (
              <Item variant="muted" className="items-center sm:flex-nowrap">
                <ItemContent>
                  <ItemTitle>
                    {messages.settings.attendance.codeTitle(todayDate)}
                  </ItemTitle>
                  <span className="font-mono text-2xl font-bold tracking-widest">
                    {todayCode.toUpperCase()}
                  </span>
                  <ItemDescription>
                    {messages.settings.attendance.codeDescription}
                  </ItemDescription>
                </ItemContent>
                <ItemActions className="ml-auto">
                  <Button
                    variant="ghost"
                    size="icon-lg"
                    onClick={handleCopyCode}
                  >
                    <IconCopy className="size-4" />
                    <span className="sr-only">
                      {messages.settings.attendance.copyCode}
                    </span>
                  </Button>
                </ItemActions>
              </Item>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {ACTIONS_VI.close}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
