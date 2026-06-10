"use client";

import Link from "next/link";
import {
  ArrowRight as IconArrowRight,
  ClipboardList as IconChecklist,
} from "lucide-react";
import { cn } from "@comtammatu/ui";
import { Card, CardContent } from "@comtammatu/ui/components/card";
import { messages } from "@lib/messages";

interface AttendanceSettingsCardProps {
  branch: {
    id: number;
    name: string;
  };
}

export function AttendanceSettingsCard({
  branch,
}: AttendanceSettingsCardProps) {
  return (
    <Card className="h-full transition-[box-shadow,border-color] hover:shadow-sm">
      <CardContent flush className="h-full">
        <Link
          href="/hr"
          aria-label={`${messages.settings.branch.attendanceChecklistTitle} ${branch.name}`}
          className="group flex h-full w-full flex-col justify-between gap-4 p-4 text-left"
        >
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div
                className={cn(
                  "flex size-10 items-center justify-center rounded-md",
                  "bg-info/10 text-info",
                )}
              >
                <IconChecklist className="size-5" />
              </div>
            </div>
            <div className="min-w-0">
              <p className="font-heading text-base font-semibold tracking-tight">
                {messages.settings.branch.attendanceChecklistTitle}
              </p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {messages.settings.branch.attendanceChecklistDescription}
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1 text-sm font-medium text-primary">
            {messages.settings.branch.attendanceChecklistAction}
            <IconArrowRight className="size-4" />
          </span>
        </Link>
      </CardContent>
    </Card>
  );
}
