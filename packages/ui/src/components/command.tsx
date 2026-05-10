"use client";

import * as React from "react";
import { Command as CommandPrimitive } from "cmdk";

import { cn } from "../lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./dialog";
import { InputGroup, InputGroupAddon } from "./input-group";
import { Check as IconCheck, Search as IconSearch } from "lucide-react";

const commandListMaxHeightClasses = {
  sm: "max-h-60",
  default: "max-h-72",
  lg: "max-h-80",
  xl: "max-h-96",
  none: "max-h-none",
} as const;

type CommandListMaxHeight = keyof typeof commandListMaxHeightClasses;

function Command({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive>) {
  return (
    <CommandPrimitive
      data-slot="command"
      className={cn(
        "flex size-full flex-col overflow-hidden rounded-xl bg-popover p-1 text-popover-foreground",
        className,
      )}
      {...props}
    />
  );
}

function CommandDialog({
  title = "Command Palette",
  description = "Search for a command to run...",
  children,
  className,
  showCloseButton = false,
  ...props
}: React.ComponentProps<typeof Dialog> & {
  title?: string;
  description?: string;
  className?: string;
  showCloseButton?: boolean;
}) {
  return (
    <Dialog {...props}>
      <DialogHeader className="sr-only">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <DialogContent
        placement="command"
        padding="none"
        scroll="hidden"
        className={className}
        showCloseButton={showCloseButton}
      >
        {children}
      </DialogContent>
    </Dialog>
  );
}

function CommandInput({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Input>) {
  return (
    <div data-slot="command-input-wrapper" className="p-1 pb-0">
      <InputGroup size="sm" className="bg-input/20 dark:bg-input/30">
        <CommandPrimitive.Input
          data-slot="input-group-control"
          className={cn(
            "w-full text-xs/relaxed outline-hidden disabled:cursor-not-allowed disabled:opacity-50",
            className,
          )}
          {...props}
        />
        <InputGroupAddon>
          <IconSearch className="size-3.5 shrink-0 opacity-50" />
        </InputGroupAddon>
      </InputGroup>
    </div>
  );
}

function CommandList({
  className,
  maxHeight = "default",
  ...props
}: React.ComponentProps<typeof CommandPrimitive.List> & {
  maxHeight?: CommandListMaxHeight;
}) {
  return (
    <CommandPrimitive.List
      data-slot="command-list"
      className={cn(
        "no-scrollbar scroll-py-1 overflow-x-hidden overflow-y-auto outline-none",
        commandListMaxHeightClasses[maxHeight],
        className,
      )}
      {...props}
    />
  );
}

function CommandEmpty({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Empty>) {
  return (
    <CommandPrimitive.Empty
      data-slot="command-empty"
      className={cn("py-6 text-center text-xs/relaxed", className)}
      {...props}
    />
  );
}

function CommandGroup({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Group>) {
  return (
    <CommandPrimitive.Group
      data-slot="command-group"
      className={cn(
        "overflow-hidden p-1 text-foreground **:[[cmdk-group-heading]]:px-2.5 **:[[cmdk-group-heading]]:py-1.5 **:[[cmdk-group-heading]]:text-xs **:[[cmdk-group-heading]]:font-medium **:[[cmdk-group-heading]]:text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

function CommandSeparator({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Separator>) {
  return (
    <CommandPrimitive.Separator
      data-slot="command-separator"
      className={cn("-mx-1 my-1 h-px bg-border/50", className)}
      {...props}
    />
  );
}

function CommandItem({
  className,
  children,
  checked,
  showCheck = checked !== undefined,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Item> & {
  checked?: boolean;
  showCheck?: boolean;
}) {
  return (
    <CommandPrimitive.Item
      data-slot="command-item"
      data-checked={checked ? "true" : undefined}
      className={cn(
        "group/command-item relative flex min-h-7 cursor-default items-center gap-2 rounded-md px-2.5 py-1.5 text-xs/relaxed outline-hidden select-none in-data-[slot=dialog-content]:rounded-md data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 data-selected:bg-muted data-selected:text-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5 data-selected:*:[svg]:text-foreground",
        className,
      )}
      {...props}
    >
      {children}
      {showCheck ? (
        <IconCheck
          aria-hidden="true"
          className={cn(
            "ml-auto opacity-0 group-has-data-[slot=command-shortcut]/command-item:hidden",
            checked && "opacity-100",
          )}
        />
      ) : null}
    </CommandPrimitive.Item>
  );
}

function CommandShortcut({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="command-shortcut"
      className={cn(
        "ml-auto text-[0.625rem] tracking-widest text-muted-foreground group-data-selected/command-item:text-foreground",
        className,
      )}
      {...props}
    />
  );
}

export {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
  CommandSeparator,
};
