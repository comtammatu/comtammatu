"use client";

import type { ReactNode } from "react";
import { Button } from "@comtammatu/ui/components/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@comtammatu/ui/components/dialog";

interface PwaInstallHelpDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description: ReactNode;
  steps: readonly ReactNode[];
  closeLabel: string;
}

export function PwaInstallHelpDialog({
  open,
  onOpenChange,
  title,
  description,
  steps,
  closeLabel,
}: PwaInstallHelpDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <ol className="grid gap-2 text-sm leading-relaxed">
          {steps.map((step, index) => (
            <li key={index}>
              {index + 1}. {step}
            </li>
          ))}
        </ol>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              {closeLabel}
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
