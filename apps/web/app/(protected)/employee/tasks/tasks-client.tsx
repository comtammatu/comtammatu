"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ClipboardList as IconCount } from "lucide-react";
import { cn } from "@comtammatu/ui";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Checkbox } from "@comtammatu/ui/components/checkbox";
import { Label } from "@comtammatu/ui/components/label";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { toast } from "@comtammatu/ui/components/sonner";
import { messages } from "@lib/messages";
import type { TodayChecklistItem } from "../_lib/today-work-state";
import { toggleChecklistItem } from "../clock/actions";

const taskCopy = messages.employee.tasks;
const homeCopy = messages.employee.home;
const CHECKLIST_PHASES = ["start_of_shift", "end_of_shift"] as const;

interface TasksClientProps {
  items: TodayChecklistItem[];
  disabled?: boolean;
  countHref?: string;
}

function sortPhaseItems(items: TodayChecklistItem[]) {
  return [...items].sort((left, right) => {
    if (left.done !== right.done) return left.done ? 1 : -1;
    if (left.isRequired !== right.isRequired) return left.isRequired ? -1 : 1;
    return left.sortOrder - right.sortOrder;
  });
}

export function TasksClient({
  items,
  disabled = false,
  countHref = "/employee/count",
}: TasksClientProps) {
  const router = useRouter();
  const [localItems, setLocalItems] = useState(items);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setLocalItems(items);
  }, [items]);

  function handleToggle(itemId: number, done: boolean) {
    const previous = localItems;
    if (disabled) return;

    setLocalItems((current) =>
      current.map((item) => (item.id === itemId ? { ...item, done } : item)),
    );

    startTransition(async () => {
      const result = await toggleChecklistItem({ itemId, done });
      if (!result.success) {
        setLocalItems(previous);
        toast.error(result.error ?? taskCopy.updateError);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {CHECKLIST_PHASES.map((phase) => {
        const phaseItems = localItems.filter((item) => item.phase === phase);
        if (phaseItems.length === 0) return null;
        const sortedPhaseItems = sortPhaseItems(phaseItems);
        const phaseDone = phaseItems.filter((item) => item.done).length;
        const phaseRequiredRemaining = phaseItems.filter(
          (item) => item.isRequired && !item.done,
        ).length;
        const headingId = `shift-task-phase-${phase}`;

        return (
          <section
            key={phase}
            className="flex flex-col gap-3"
            aria-labelledby={headingId}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p id={headingId} className="text-sm font-medium">
                {taskCopy.phaseLabels[phase]}
              </p>
              <div className="flex flex-wrap gap-1.5">
                <Badge
                  variant={
                    phaseDone === phaseItems.length ? "success" : "secondary"
                  }
                >
                  {phaseDone}/{phaseItems.length} {taskCopy.done}
                </Badge>
                {phaseRequiredRemaining > 0 ? (
                  <Badge variant="warning">
                    {phaseRequiredRemaining} {taskCopy.requiredRemaining}
                  </Badge>
                ) : null}
              </div>
            </div>
            <ItemGroup className="gap-2">
              {sortedPhaseItems.map((item) => {
                const checkboxId = `shift-task-${item.id}`;
                const isCountTask = item.taskKind === "inventory_count";
                return (
                  <Item
                    key={item.id}
                    variant="outline"
                    className={cn(
                      "items-start bg-card transition-[transform,background-color,border-color,box-shadow] duration-150",
                      item.done
                        ? "border-success/30 bg-success/5"
                        : "hover:bg-muted/50",
                      disabled && "bg-muted/40",
                    )}
                  >
                    {isCountTask ? (
                      <ItemMedia
                        variant="icon"
                        className={cn(
                          "rounded-md bg-muted p-2 text-muted-foreground",
                          item.done && "bg-success/10 text-success",
                        )}
                      >
                        <IconCount />
                      </ItemMedia>
                    ) : (
                      <div className="flex shrink-0 pt-0.5">
                        <Checkbox
                          id={checkboxId}
                          checked={item.done}
                          disabled={disabled || isPending}
                          onCheckedChange={(checked) => {
                            handleToggle(item.id, checked === true);
                          }}
                          aria-label={
                            item.done ? taskCopy.markTodo : taskCopy.markDone
                          }
                        />
                      </div>
                    )}
                    <ItemContent className="min-w-0 gap-2">
                      <ItemTitle
                        className={cn(
                          "line-clamp-none w-full max-w-full items-start text-sm leading-5",
                          item.done && "text-muted-foreground",
                        )}
                      >
                        {isCountTask ? (
                          <span className="block min-w-0 max-w-full whitespace-normal break-words">
                            {item.title}
                          </span>
                        ) : (
                          <Label
                            className="block min-w-0 max-w-full cursor-pointer whitespace-normal break-words font-normal text-sm leading-5"
                            htmlFor={checkboxId}
                          >
                            {item.title}
                          </Label>
                        )}
                      </ItemTitle>
                      {item.doneDefinition ? (
                        <ItemDescription className="line-clamp-none max-w-full whitespace-normal break-words text-xs leading-5">
                          {item.doneDefinition}
                        </ItemDescription>
                      ) : null}
                      <div
                        className="flex w-full flex-wrap items-center gap-1.5"
                        data-shift-task-meta
                      >
                        {item.isRequired ? (
                          <Badge variant="outline">{taskCopy.required}</Badge>
                        ) : null}
                        <Badge variant={item.done ? "success" : "secondary"}>
                          {item.done ? taskCopy.done : taskCopy.todo}
                        </Badge>
                      </div>
                      {isCountTask ? (
                        <Button
                          asChild
                          size="touch"
                          className="w-full sm:w-fit"
                          variant={item.done ? "outline" : "default"}
                        >
                          <Link href={countHref}>
                            <IconCount data-icon="inline-start" />
                            {homeCopy.countCta}
                          </Link>
                        </Button>
                      ) : null}
                    </ItemContent>
                  </Item>
                );
              })}
            </ItemGroup>
          </section>
        );
      })}

    </div>
  );
}
