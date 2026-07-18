"use client";

import * as React from "react";
import { Accordion as AccordionPrimitive } from "@base-ui/react/accordion";
import { ChevronDown as IconChevronDown } from "lucide-react";

import { cn } from "../lib/utils";

function Accordion({
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Root>) {
  return <AccordionPrimitive.Root data-slot="accordion" {...props} />;
}

function AccordionItem({
  className,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Item>) {
  return (
    <AccordionPrimitive.Item
      data-slot="accordion-item"
      className={cn(
        "mb-2 rounded-lg border border-border bg-card px-4 transition-colors duration-200 last:mb-0 data-open:bg-secondary/15",
        className,
      )}
      {...props}
    />
  );
}

function AccordionTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Trigger>) {
  return (
    <AccordionPrimitive.Header className="flex">
      <AccordionPrimitive.Trigger
        data-slot="accordion-trigger"
        className={cn(
          "flex flex-1 items-center justify-between gap-3 rounded-md py-3 text-left font-heading text-sm font-semibold transition-colors outline-none hover:text-primary focus-visible:text-primary focus-visible:ring-2 focus-visible:ring-foreground disabled:pointer-events-none disabled:opacity-50 data-panel-open:[&>svg]:rotate-180",
          className,
        )}
        {...props}
      >
        {children}
        <IconChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform duration-[var(--motion-fast)]" />
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  );
}

function AccordionContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Panel>) {
  return (
    <AccordionPrimitive.Panel
      data-slot="accordion-content"
      className="overflow-hidden text-xs/relaxed data-[starting-style]:animate-accordion-down data-[ending-style]:animate-accordion-up"
      {...props}
    >
      <div className={cn("pb-3", className)}>{children}</div>
    </AccordionPrimitive.Panel>
  );
}

export { Accordion, AccordionContent, AccordionItem, AccordionTrigger };
