"use client";

import Link from "next/link";
import {
  AlertTriangle as IconAlertTriangle,
  ClipboardCheck as IconClipboardCheck,
  FileWarning as IconFileWarning,
} from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import {
  OWNER_SHELL_BREAKPOINT,
  useIsMobile,
} from "@comtammatu/ui/hooks/use-mobile";
import { AppSection } from "@/components/surface";
import { messages } from "@lib/messages";
import type { HrAttentionSummary } from "./hr-attention";
import {
  type HrBranchScope,
  withHrBranchScope,
} from "@/lib/hr-scope";

export function HrAttentionStrip({
  summary,
  branchScope,
}: {
  summary: HrAttentionSummary;
  branchScope: HrBranchScope;
}) {
  const isTouchLayout = useIsMobile(OWNER_SHELL_BREAKPOINT);
  const actionSize = isTouchLayout ? "touch" : "default";
  const copy = messages.hr.attention;
  const hasWork =
    summary.pendingApprovals > 0 || summary.missingContractOrSalary > 0;

  if (!hasWork) return null;

  return (
    <AppSection title={copy.title} description={copy.description}>
      <ItemGroup className="gap-2">
        {summary.pendingApprovals > 0 ? (
          <Item variant="outline" className="bg-card">
            <IconClipboardCheck className="size-5 text-primary" />
            <ItemContent>
              <ItemTitle>{copy.approvals(summary.pendingApprovals)}</ItemTitle>
              <ItemDescription>
                {messages.hr.client.checkoutApprovalsHint}
              </ItemDescription>
            </ItemContent>
            <ItemActions>
              <Button
                size={actionSize}
                render={
                  <Link
                    href={withHrBranchScope(
                      "/hr/attendance?tab=approvals",
                      branchScope,
                    )}
                  />
                }
              >
                {copy.approvalsAction}
              </Button>
            </ItemActions>
          </Item>
        ) : null}
        {summary.missingContractOrSalary > 0 ? (
          <Item variant="outline" className="bg-card">
            <IconFileWarning className="size-5 text-destructive" />
            <ItemContent>
              <ItemTitle>
                {copy.missingContract(summary.missingContractOrSalary)}
              </ItemTitle>
              <ItemDescription>{copy.missingContractHint}</ItemDescription>
            </ItemContent>
            <ItemActions>
              <Button
                variant="outline"
                size={actionSize}
                render={
                  <Link
                    href={withHrBranchScope(
                      "/hr?salary=missing",
                      branchScope,
                    )}
                  />
                }
              >
                <IconAlertTriangle data-icon="inline-start" />
                {copy.missingContractAction}
              </Button>
            </ItemActions>
          </Item>
        ) : null}
      </ItemGroup>
    </AppSection>
  );
}
