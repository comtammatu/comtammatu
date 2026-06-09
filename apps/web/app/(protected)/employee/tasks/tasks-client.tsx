"use client";

import { useEffect, useState, useTransition } from "react";
import { Checkbox } from "@comtammatu/ui/components/checkbox";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemGroup,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { toast } from "@comtammatu/ui/components/sonner";
import type { TodayChecklistItem } from "../_lib/today-work-state";
import { toggleChecklistItem } from "../clock/actions";

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
    <ItemGroup className="gap-2">
      {localItems.map((item) => {
        const checkboxId = `shift-task-${item.id}`;
        return (
          <Item key={item.id} variant="outline" className="sm:flex-nowrap">
            <ItemContent>
              <ItemTitle className={item.done ? "text-muted-foreground" : ""}>
                <label htmlFor={checkboxId}>{item.title}</label>
              </ItemTitle>
            </ItemContent>
            <ItemActions className="ml-auto">
              <Checkbox
                id={checkboxId}
                checked={item.done}
                disabled={disabled || isPending}
                onCheckedChange={(checked) => {
                  handleToggle(item.id, checked === true);
                }}
                aria-label={item.done ? "Đánh dấu chưa làm" : "Đánh dấu xong"}
              />
            </ItemActions>
          </Item>
        );
      })}
    </ItemGroup>
  );
}
