/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: operator hub uses vietnamese */
"use client";

import { useTransition, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { toast } from "@comtammatu/ui/components/sonner";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { Button } from "@comtammatu/ui/components/button";
import { Trash2 } from "lucide-react";
import { cn } from "@comtammatu/ui";
import {
  Item,
  ItemContent,
  ItemTitle,
  ItemGroup,
} from "@comtammatu/ui/components/item";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@comtammatu/ui/components/drawer";
import { ScrollArea } from "@comtammatu/ui/components/scroll-area";
import { assignChecklistTemplate } from "./actions";
import { useSwipeReveal, type SwipeReveal } from "@lib/hooks/use-swipe-reveal";
import { useLongPress } from "@lib/hooks/use-long-press";

interface Employee {
  id: number;
  name: string;
  templateId: number | null;
}

interface Template {
  id: number;
  name: string;
}

function EmployeeRow({
  emp,
  templateName,
  isPending,
  handleAssign,
  onOpenDrawer,
  swipe,
}: {
  emp: Employee;
  templateName: string | null;
  isPending: boolean;
  handleAssign: (empId: number, tId: string) => void;
  onOpenDrawer: () => void;
  swipe: SwipeReveal;
}) {
  const isRevealed = swipe.isRevealed(String(emp.id));
  const swipeBindings = swipe.bindings(String(emp.id));

  const longPress = useLongPress({
    onLongPress: onOpenDrawer,
    onClick: () => {
      if (swipe.consumeSuppression(String(emp.id))) {
        swipe.clearReveal();
        return;
      }
      if (isRevealed) {
        swipe.clearReveal();
        return;
      }
      onOpenDrawer();
    },
  });

  const handlers = {
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
      swipeBindings.onPointerDown(e);
      longPress.onPointerDown(e);
    },
    onPointerMove: (e: ReactPointerEvent<HTMLElement>) => {
      swipeBindings.onPointerMove(e);
      longPress.onPointerMove(e);
    },
    onPointerUp: (e: ReactPointerEvent<HTMLElement>) => {
      swipeBindings.onPointerUp(e);
      longPress.onPointerUp();
    },
    onPointerCancel: (e: ReactPointerEvent<HTMLElement>) => {
      swipeBindings.onPointerCancel(e);
      longPress.onPointerCancel();
    },
    onContextMenu: longPress.onContextMenu,
  };

  return (
    <div className="relative overflow-hidden bg-destructive">
      <div className="absolute inset-y-0 right-0 flex w-20 items-center justify-end">
        <Button
          variant="destructive"
          className="h-full w-full rounded-none"
          disabled={isPending}
          onClick={() => {
            swipe.clearReveal();
            handleAssign(emp.id, "none");
          }}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>

      <div
        className={cn(
          "bg-background transition-transform duration-300 ease-out cursor-pointer",
          isRevealed ? "-translate-x-20" : "translate-x-0"
        )}
        {...handlers}
      >
        <Item
          variant="outline"
          className="flex flex-col p-4 pointer-events-none select-none"
        >
          <ItemContent className="min-w-0">
            <ItemTitle className="text-sm font-medium">{emp.name}</ItemTitle>
            <p className="text-sm text-muted-foreground mt-1">
              {templateName ?? <span className="italic">Chưa gán mẫu</span>}
            </p>
          </ItemContent>
        </Item>
      </div>
    </div>
  );
}

export function ChecklistAssignmentClient({
  branchId,
  employees,
  templates,
}: {
  branchId: number;
  employees: Employee[];
  templates: Template[];
}) {
  const [isPending, startTransition] = useTransition();
  const [activeEmpId, setActiveEmpId] = useState<number | null>(null);
  const swipe = useSwipeReveal({ revealWidth: 80 });

  function handleAssign(employeeId: number, templateIdValue: string) {
    startTransition(async () => {
      const templateId =
        templateIdValue === "none" ? null : Number(templateIdValue);

      const res = await assignChecklistTemplate({
        branchId,
        employeeId,
        templateId,
      });

      if (!res.success) {
        toast.error(res.error ?? "Không thể gán template");
      } else {
        toast.success("Đã phân công việc trong ca");
      }
    });
  }

  if (employees.length === 0) {
    return (
      <p className="text-sm text-muted-foreground p-4 text-center">
        Chưa có nhân sự nào tại chi nhánh này.
      </p>
    );
  }

  if (templates.length === 0) {
    return (
      <p className="text-sm text-muted-foreground p-4 text-center">
        Chưa có mẫu Việc trong ca (Checklist) nào được định nghĩa trên hệ thống.
        Vui lòng tạo mẫu ở mục Hành chính - Nhân sự (Office).
      </p>
    );
  }

  const activeEmp = employees.find((e) => e.id === activeEmpId);

  return (
    <>
      <ItemGroup className="flex flex-col gap-2 overflow-hidden sm:overflow-visible">
        {employees.map((emp) => {
          const templateName = emp.templateId
            ? templates.find((t) => t.id === emp.templateId)?.name
            : null;
          return (
            <EmployeeRow
              key={emp.id}
              emp={emp}
              templateName={templateName ?? null}
              isPending={isPending}
              handleAssign={handleAssign}
              onOpenDrawer={() => setActiveEmpId(emp.id)}
              swipe={swipe}
            />
          );
        })}
        {isPending && (
          <div className="fixed bottom-4 right-4 z-50 bg-background/80 backdrop-blur rounded-full p-2 border flex items-center justify-center">
            <Spinner className="size-4" />
          </div>
        )}
      </ItemGroup>

      <Drawer
        open={activeEmpId !== null}
        onOpenChange={(o) => !o && setActiveEmpId(null)}
      >
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Phân công việc: {activeEmp?.name}</DrawerTitle>
            <DrawerDescription>
              Chọn mẫu công việc cho nhân viên này
            </DrawerDescription>
          </DrawerHeader>
          <ScrollArea className="px-4" style={{ maxHeight: "60vh" }}>
            <div className="flex flex-col gap-2 pb-4">
              <Button
                variant={activeEmp?.templateId === null ? "default" : "outline"}
                className="justify-start h-auto py-3"
                onClick={() => {
                  if (activeEmp) handleAssign(activeEmp.id, "none");
                  setActiveEmpId(null);
                }}
              >
                <span className="italic">-- Bỏ gán (Không có mẫu) --</span>
              </Button>
              {templates.map((t) => (
                <Button
                  key={t.id}
                  variant={
                    activeEmp?.templateId === t.id ? "default" : "outline"
                  }
                  className="justify-start h-auto py-3"
                  onClick={() => {
                    if (activeEmp) handleAssign(activeEmp.id, String(t.id));
                    setActiveEmpId(null);
                  }}
                >
                  {t.name}
                </Button>
              ))}
            </div>
          </ScrollArea>
        </DrawerContent>
      </Drawer>
    </>
  );
}
