"use client";

import { useState, useTransition } from "react";
import { Save as IconSave } from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import { Input } from "@comtammatu/ui/components/input";
import { Label } from "@comtammatu/ui/components/label";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { toast } from "@comtammatu/ui/components/sonner";
import { updateMyDependentsCount } from "./actions";

interface DependentsFormProps {
  initialCount: number;
}

export function DependentsForm({ initialCount }: DependentsFormProps) {
  const [count, setCount] = useState<string>(String(initialCount));
  const [isPending, startTransition] = useTransition();

  const numeric = Number(count);
  const isValid = Number.isInteger(numeric) && numeric >= 0 && numeric <= 20;
  const isDirty = numeric !== initialCount;

  function handleSubmit() {
    if (!isValid || !isDirty || isPending) return;
    startTransition(async () => {
      const result = await updateMyDependentsCount({ count: numeric });
      if (!result.success) {
        toast.error(result.error ?? "Không thể cập nhật");
        return;
      }
      toast.success("Đã cập nhật người phụ thuộc — kỳ lương sau sẽ áp dụng");
    });
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="dependents-count" className="text-xs">
          Số người phụ thuộc
        </Label>
        <Input
          id="dependents-count"
          type="number"
          min={0}
          max={20}
          step={1}
          value={count}
          onChange={(e) => setCount(e.target.value)}
          className="w-32 font-mono"
          disabled={isPending}
        />
      </div>
      <Button
        type="button"
        size="touch"
        className="w-full sm:w-fit"
        onClick={handleSubmit}
        disabled={!isValid || !isDirty || isPending}
      >
        {isPending ? (
          <Spinner data-icon="inline-start" />
        ) : (
          <IconSave data-icon="inline-start" />
        )}
        Lưu
      </Button>
      <p className="text-xs text-muted-foreground">
        Áp dụng cho kỳ lương kế tiếp · giảm trừ 4.4M ₫/người/tháng
      </p>
    </div>
  );
}
