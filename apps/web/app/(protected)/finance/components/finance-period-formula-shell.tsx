"use client";

import type { ReactNode } from "react";
import { ChevronDown as IconChevronDown } from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@comtammatu/ui/components/collapsible";
import { messages } from "@lib/messages";

const copy = messages.finance.basic.formula;

/**
 * Below xl: result summary stays visible; formula detail is optional.
 * xl+: formula detail is always shown (desktop equation layout).
 */
export function FinancePeriodFormulaShell({
  summary,
  details,
}: {
  summary: ReactNode;
  details: ReactNode;
}) {
  return (
    <>
      <div className="grid gap-3 xl:hidden">
        {summary}
        <Collapsible>
          <CollapsibleTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="group h-auto w-full justify-between gap-2 px-0 py-1.5 font-medium text-foreground"
              />
            }
          >
            <span>{copy.showDetails}</span>
            <IconChevronDown
              className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[panel-open]:rotate-180"
              aria-hidden
            />
          </CollapsibleTrigger>
          <CollapsibleContent className="grid gap-4 pt-2">
            {details}
          </CollapsibleContent>
        </Collapsible>
      </div>
      <div className="hidden gap-4 xl:grid">{details}</div>
    </>
  );
}
