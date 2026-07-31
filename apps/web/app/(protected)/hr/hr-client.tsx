"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ShieldCheck as IconShieldCheck,
  UserPlus as IconUserPlus,
} from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import { AppPage, AppPageHeader } from "@/components/surface";
import { messages } from "@lib/messages";
import { EmployeeFormDialog } from "./employee-form-dialog";
import { EmployeeTable } from "./employee-table";
import { HrAttentionStrip } from "./hr-attention-strip";
import type { HrAttentionSummary } from "./hr-attention";
import type { BranchOption, EmployeeRow } from "./_types";

interface HrClientProps {
  employees: EmployeeRow[];
  branches: BranchOption[];
  positionOptions: Array<{ value: string; label: string }>;
  attention: HrAttentionSummary;
  initialSalaryFilter?: "all" | "missing" | "recorded";
}

export function HrClient({
  employees,
  branches,
  positionOptions,
  attention,
  initialSalaryFilter = "all",
}: HrClientProps) {
  const [addOpen, setAddOpen] = useState(false);
  const copy = messages.hr.client;
  const workspaceCopy = messages.hr.workspace;

  return (
    <AppPage width="xwide">
      <AppPageHeader
        title={workspaceCopy.ownerTitle}
        description={workspaceCopy.ownerDescription}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="touch"
              render={<Link href="/hr/staff" />}
            >
              <IconShieldCheck data-icon="inline-start" />
              {copy.staffAccounts}
            </Button>
            <Button size="touch" onClick={() => setAddOpen(true)}>
              <IconUserPlus data-icon="inline-start" />
              {copy.addEmployee}
            </Button>
          </div>
        }
      />
      <HrAttentionStrip summary={attention} />
      <EmployeeTable
        employees={employees}
        branches={branches}
        positionOptions={positionOptions}
        canManage
        initialSalaryFilter={initialSalaryFilter}
      />
      <EmployeeFormDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        branches={branches}
        positionOptions={positionOptions}
      />
    </AppPage>
  );
}
