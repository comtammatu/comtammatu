"use client";

import { useEffect, useState, useTransition } from "react";
import { ClipboardList as IconChecklist } from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@comtammatu/ui/components/dialog";
import { Label } from "@comtammatu/ui/components/label";
import { toast } from "@comtammatu/ui/components/sonner";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { Textarea } from "@comtammatu/ui/components/textarea";
import { ACTIONS_VI, ERRORS_VI } from "@comtammatu/shared/messages";
import { messages } from "@lib/messages";
import { saveBranchChecklist } from "./attendance-actions";

const DEFAULT_CHECKLIST = [
  "Chuẩn bị khu vực làm việc",
  "Kiểm tra công cụ cần dùng",
  "Hoàn tất việc được giao",
  "Vệ sinh và bàn giao cuối ca",
] as const;

interface AttendanceConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  branch: {
    id: number;
    name: string;
    checklistItems: string[];
  };
}

export function AttendanceConfigDialog({
  open,
  onOpenChange,
  branch,
}: AttendanceConfigDialogProps) {
  const [checklistPending, startChecklistTransition] = useTransition();
  const [checklistText, setChecklistText] = useState("");

  useEffect(() => {
    setChecklistText(
      (branch.checklistItems.length > 0
        ? branch.checklistItems
        : DEFAULT_CHECKLIST
      ).join("\n"),
    );
  }, [branch.id, branch.checklistItems]);

  function handleSaveChecklist() {
    startChecklistTransition(async () => {
      const formData = new FormData();
      formData.set("branchId", String(branch.id));
      formData.set("items", checklistText);
      const result = await saveBranchChecklist(null, formData);
      if (!result.success) {
        toast.error(result.error ?? ERRORS_VI.fallback);
        return;
      }
      toast.success(messages.settings.attendance.checklistSaved);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {messages.settings.attendance.title(branch.name)}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <IconChecklist className="size-4" />
              {messages.settings.attendance.checklistTitle}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="shift-checklist">
                {messages.settings.attendance.checklistLabel}
              </Label>
              <Textarea
                id="shift-checklist"
                value={checklistText}
                onChange={(event) => setChecklistText(event.target.value)}
                rows={6}
              />
              <p className="text-xs text-muted-foreground">
                {messages.settings.attendance.checklistDescription}
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              onClick={handleSaveChecklist}
              disabled={checklistPending}
            >
              {checklistPending ? <Spinner data-icon="inline-start" /> : null}
              {messages.settings.attendance.saveChecklist}
            </Button>
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
