"use client";

import { useState, useTransition } from "react";
import { formatDateTimeVN } from "@comtammatu/shared/datetime";
import { useTenantTimezone } from "@/_lib/timezone-context";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@comtammatu/ui/components/card";
import { Button } from "@comtammatu/ui/components/button";
import { Input } from "@comtammatu/ui/components/input";
import { Label } from "@comtammatu/ui/components/label";
import { Switch } from "@comtammatu/ui/components/switch";
import { Badge } from "@comtammatu/ui/components/badge";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { toast } from "@comtammatu/ui/components/sonner";
import { cn } from "@comtammatu/ui";
import { Clock6 as IconClockHour6, Key as IconKey } from "lucide-react";
import {
  configureExpressWindow,
  rotateOverrideCode,
} from "@/inventory/variance-actions";

export type BranchRow = {
  id: number;
  name: string;
  branchKind: string;
  timezone: string;
  window: {
    enabled: boolean;
    startTime: string;
    endTime: string;
    updatedAt: string | null;
  };
};

interface Props {
  initial: BranchRow[];
}

export function ExpressWindowsClient({ initial }: Props) {
  return (
    <div className="container mx-auto max-w-3xl space-y-4 py-6">
      <div className="flex items-center gap-2">
        <IconClockHour6 className="size-6 text-info" />
        <h1 className="text-2xl font-semibold">
          Express window & Override code (theo chi nhánh)
        </h1>
      </div>

      {initial.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Chưa có chi nhánh nào đang hoạt động.
        </p>
      ) : (
        <ul className="space-y-4">
          {initial.map((branch) => (
            <BranchSettingsCard key={branch.id} branch={branch} />
          ))}
        </ul>
      )}
    </div>
  );
}

function BranchSettingsCard({ branch }: { branch: BranchRow }) {
  return (
    <li>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {branch.name}
            <Badge variant="outline" className="text-xs">
              {branch.branchKind}
            </Badge>
            <Badge variant="secondary" className="text-xs">
              {branch.timezone}
            </Badge>
          </CardTitle>
          <CardDescription>
            Cấu hình Express auto-approve window và rotate mã override tier-2.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <ExpressWindowSection
            branchId={branch.id}
            initial={branch.window}
          />
          <div className="border-t" />
          <OverrideCodeSection branchId={branch.id} />
        </CardContent>
      </Card>
    </li>
  );
}

function ExpressWindowSection({
  branchId,
  initial,
}: {
  branchId: number;
  initial: BranchRow["window"];
}) {
  const tz = useTenantTimezone();
  const [enabled, setEnabled] = useState(initial.enabled);
  const [startTime, setStartTime] = useState(initial.startTime.slice(0, 5));
  const [endTime, setEndTime] = useState(initial.endTime.slice(0, 5));
  const [isSaving, startSave] = useTransition();

  const dirty =
    enabled !== initial.enabled ||
    startTime !== initial.startTime.slice(0, 5) ||
    endTime !== initial.endTime.slice(0, 5);

  function handleSave() {
    if (startTime >= endTime) {
      toast.error("Giờ bắt đầu phải trước giờ kết thúc");
      return;
    }
    startSave(async () => {
      const res = await configureExpressWindow({
        branchId,
        enabled,
        startTime,
        endTime,
      });
      if (!res.success) {
        toast.error(res.error ?? "Không lưu được");
        return;
      }
      toast.success(`Đã lưu Express window cho CN #${branchId}`);
    });
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <IconClockHour6 className="size-4" />
        <h3 className="text-sm font-semibold">Express window</h3>
      </div>
      <div className="flex items-center gap-3">
        <Switch
          id={`win-enabled-${branchId}`}
          checked={enabled}
          onCheckedChange={setEnabled}
          disabled={isSaving}
        />
        <Label htmlFor={`win-enabled-${branchId}`} className="text-sm">
          {enabled ? "Đang bật" : "Đã tắt"}
        </Label>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor={`win-start-${branchId}`} className="text-xs">
            Giờ bắt đầu
          </Label>
          <Input
            id={`win-start-${branchId}`}
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            disabled={!enabled || isSaving}
          />
        </div>
        <div>
          <Label htmlFor={`win-end-${branchId}`} className="text-xs">
            Giờ kết thúc
          </Label>
          <Input
            id={`win-end-${branchId}`}
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            disabled={!enabled || isSaving}
          />
        </div>
      </div>
      {initial.updatedAt ? (
        <p className="text-xs text-muted-foreground">
          Cập nhật lần cuối: {formatDateTimeVN(initial.updatedAt, tz)}
        </p>
      ) : null}
      <div className="flex justify-end">
        <Button size="sm" onClick={handleSave} disabled={!dirty || isSaving}>
          {isSaving ? <Spinner /> : "Lưu window"}
        </Button>
      </div>
    </section>
  );
}

function OverrideCodeSection({ branchId }: { branchId: number }) {
  const [newCode, setNewCode] = useState("");
  const [confirmCode, setConfirmCode] = useState("");
  const [isRotating, startRotate] = useTransition();

  const tooShort = newCode.length > 0 && newCode.length < 6;
  const mismatch =
    newCode.length >= 6 && confirmCode.length > 0 && newCode !== confirmCode;
  const canSubmit =
    newCode.length >= 6 && newCode === confirmCode && !isRotating;

  function handleRotate() {
    if (!canSubmit) return;
    startRotate(async () => {
      const res = await rotateOverrideCode({ branchId, newCode });
      if (!res.success) {
        toast.error(res.error ?? "Không rotate được");
        return;
      }
      toast.success(
        `Đã rotate mã override cho CN #${branchId}. Chuyển mã mới cho QLV qua kênh riêng.`,
      );
      setNewCode("");
      setConfirmCode("");
    });
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <IconKey className="size-4" />
        <h3 className="text-sm font-semibold">Mã override (tier 2)</h3>
      </div>
      <p className="text-xs text-muted-foreground">
        Mã được bcrypt hash — server không lưu plaintext. Sau khi rotate, Admin phải
        truyền mã mới cho QLV qua kênh riêng (Zalo/gọi điện, KHÔNG email/chat công ty).
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor={`code-new-${branchId}`} className="text-xs">
            Mã mới (≥6 ký tự)
          </Label>
          <Input
            id={`code-new-${branchId}`}
            type="password"
            value={newCode}
            onChange={(e) => setNewCode(e.target.value)}
            disabled={isRotating}
            placeholder="••••••"
            autoComplete="new-password"
          />
          {tooShort ? (
            <p className="text-xs text-destructive">Tối thiểu 6 ký tự</p>
          ) : null}
        </div>
        <div>
          <Label htmlFor={`code-confirm-${branchId}`} className="text-xs">
            Nhập lại mã mới
          </Label>
          <Input
            id={`code-confirm-${branchId}`}
            type="password"
            value={confirmCode}
            onChange={(e) => setConfirmCode(e.target.value)}
            disabled={isRotating}
            placeholder="••••••"
            autoComplete="new-password"
          />
          {mismatch ? (
            <p className="text-xs text-destructive">Mã nhập lại không khớp</p>
          ) : null}
        </div>
      </div>
      <div className={cn("flex justify-end")}>
        <Button
          size="sm"
          variant="destructive"
          onClick={handleRotate}
          disabled={!canSubmit}
        >
          {isRotating ? <Spinner /> : "Rotate mã"}
        </Button>
      </div>
    </section>
  );
}
