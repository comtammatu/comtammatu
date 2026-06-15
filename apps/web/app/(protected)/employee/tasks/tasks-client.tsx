"use client";

import { useEffect, useState, useTransition } from "react";
import { cn } from "@comtammatu/ui";
import { Badge } from "@comtammatu/ui/components/badge";
import { Checkbox } from "@comtammatu/ui/components/checkbox";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemGroup,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { toast } from "@comtammatu/ui/components/sonner";
import { messages } from "@lib/messages";
import type { TodayChecklistItem } from "../_lib/today-work-state";
import { toggleChecklistItem } from "../clock/actions";

const taskCopy = messages.employee.tasks;
const CHECKLIST_PHASES = [
  "start_of_shift",
  "during_shift",
  "end_of_shift",
] as const;
const CHECKLIST_PHASE_LABELS = {
  start_of_shift: "Đầu ca",
  during_shift: "Trong ca",
  end_of_shift: "Cuối ca",
} as const;

interface TasksClientProps {
  items: TodayChecklistItem[];
  disabled?: boolean;
}

export function TasksClient({ items, disabled = false }: TasksClientProps) {
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
        toast.error(result.error ?? "Không thể cập nhật việc trong ca.");
      }
    });
  }

  return (
    <div className="space-y-4">
      {CHECKLIST_PHASES.map((phase) => {
        const phaseItems = localItems.filter((item) => item.phase === phase);
        if (phaseItems.length === 0) return null;

        return (
          <div key={phase} className="space-y-2">
            <div className="text-sm font-medium">
              {CHECKLIST_PHASE_LABELS[phase]}
            </div>
            <ItemGroup className="gap-2">
              {phaseItems.map((item) => {
                const checkboxId = `shift-task-${item.id}`;
                return (
                  <Item
                    key={item.id}
                    variant="outline"
                    className={cn(
                      "min-h-16 items-center bg-card transition-[transform,background-color,border-color,box-shadow] duration-150 active:translate-y-px motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:duration-200 motion-safe:hover:-translate-y-px sm:flex-nowrap",
                      item.done
                        ? "border-success/30 bg-success/5"
                        : "hover:bg-muted/50",
                      disabled && "bg-muted/40",
                    )}
                  >
                    <ItemContent>
                      <ItemTitle
                        className={cn(
                          "w-full text-sm leading-5",
                          item.done && "text-muted-foreground",
                        )}
                      >
                        <label
                          className="w-full cursor-pointer"
                          htmlFor={checkboxId}
                        >
                          {item.title}
                        </label>
                      </ItemTitle>
                      {item.doneDefinition ? (
                        <div className="mt-1 text-xs text-muted-foreground">
                          {item.doneDefinition}
                        </div>
                      ) : null}
                    </ItemContent>
                      <ItemActions className="ml-auto shrink-0">
                        {item.isRequired ? (
                        <Badge variant="outline">{taskCopy.required}</Badge>
                        ) : null}
                      <Badge variant={item.done ? "success" : "secondary"}>
                        {item.done ? taskCopy.done : taskCopy.todo}
                      </Badge>
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
                    </ItemActions>
                  </Item>
                );
              })}
            </ItemGroup>
          </div>
        );
      })}
    </div>
  );
}
