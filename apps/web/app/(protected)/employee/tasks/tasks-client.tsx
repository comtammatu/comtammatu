"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { CheckCircle2 as IconDone, Circle as IconTodo } from "lucide-react";
import { Badge } from "@comtammatu/ui/components/badge";
import { Checkbox } from "@comtammatu/ui/components/checkbox";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { toast } from "@comtammatu/ui/components/sonner";
import type { TodayChecklistItem } from "../_lib/today-work-state";
import { toggleChecklistItem } from "../clock/actions";

interface TasksClientProps {
  items: TodayChecklistItem[];
}

export function TasksClient({ items }: TasksClientProps) {
  const [localItems, setLocalItems] = useState(items);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setLocalItems(items);
  }, [items]);

  const doneCount = useMemo(
    () => localItems.filter((item) => item.done).length,
    [localItems],
  );

  function handleToggle(itemId: number, done: boolean) {
    const previous = localItems;
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
            <ItemMedia variant="icon">
              {item.done ? (
                <IconDone className="size-4 text-success" />
              ) : (
                <IconTodo className="size-4 text-muted-foreground" />
              )}
            </ItemMedia>
            <ItemContent>
              <ItemTitle className={item.done ? "text-muted-foreground" : ""}>
                <label htmlFor={checkboxId}>{item.title}</label>
              </ItemTitle>
            </ItemContent>
            <ItemActions className="ml-auto">
              <Badge variant={item.done ? "success" : "outline"}>
                {item.done ? "Xong" : "Chưa làm"}
              </Badge>
              <Checkbox
                id={checkboxId}
                checked={item.done}
                disabled={isPending}
                onCheckedChange={(checked) => {
                  handleToggle(item.id, checked === true);
                }}
                aria-label={item.done ? "Đánh dấu chưa làm" : "Đánh dấu xong"}
              />
            </ItemActions>
          </Item>
        );
      })}
      <div className="text-sm text-muted-foreground">
        {doneCount}/{localItems.length} việc đã xong
      </div>
    </ItemGroup>
  );
}

