"use client";

import { useEffect, useState, useTransition } from "react";
import {
  ClipboardList as IconChecklist,
  Copy as IconCopy,
  Key as IconKey,
  RefreshCw as IconRefresh,
} from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@comtammatu/ui/components/dialog";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { Label } from "@comtammatu/ui/components/label";
import { toast } from "@comtammatu/ui/components/sonner";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { Textarea } from "@comtammatu/ui/components/textarea";
import { ACTIONS_VI, ERRORS_VI } from "@comtammatu/shared/messages";
import { messages } from "@lib/messages";
import {
  generateAttendanceSecret,
  getTodayCode,
  saveBranchChecklist,
} from "./attendance-actions";

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
    hasSecret: boolean;
    checklistItems: string[];
  };
}

export function AttendanceConfigDialog({
  open,
  onOpenChange,
  branch,
}: AttendanceConfigDialogProps) {
  const [checklistPending, startChecklistTransition] = useTransition();
  const [secretPending, startSecretTransition] = useTransition();
  const [checklistText, setChecklistText] = useState("");
  const [todayCode, setTodayCode] = useState<string | null>(null);
  const [todayDate, setTodayDate] = useState<string | null>(null);

  useEffect(() => {
    setChecklistText(
      (branch.checklistItems.length > 0
        ? branch.checklistItems
        : DEFAULT_CHECKLIST
      ).join("\n"),
    );
  }, [branch.id, branch.checklistItems]);

  useEffect(() => {
    if (!open) {
      setTodayCode(null);
      setTodayDate(null);
    }
  }, [open]);

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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {messages.settings.attendance.title(branch.name)}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <div className="space-y-3">
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
                  <Spinner data-icon="inline-start" />
                ) : (
                  <IconRefresh data-icon="inline-start" />
                )}
                {branch.hasSecret
                  ? messages.settings.attendance.generateNewSecret
                  : messages.settings.attendance.generateSecret}
              </Button>

              {branch.hasSecret ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleShowCode}
                  disabled={secretPending}
                >
                  {messages.settings.attendance.showTodayCode}
                </Button>
              ) : null}
            </div>

            {todayCode ? (
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
            ) : null}
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
