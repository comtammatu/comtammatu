"use client";

import { ClipboardList as IconChecklist } from "lucide-react";
import { messages } from "@lib/messages";
import { BranchActionItem } from "../_components/branch-action-item";

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
    <BranchActionItem
      href="/hr"
      ariaLabel={`${messages.settings.branch.attendanceChecklistTitle} ${branch.name}`}
      icon={<IconChecklist />}
      iconTone="info"
      title={messages.settings.branch.attendanceChecklistTitle}
      description={messages.settings.branch.attendanceChecklistDescription}
      ctaLabel={messages.settings.branch.attendanceChecklistAction}
    />
  );
}
