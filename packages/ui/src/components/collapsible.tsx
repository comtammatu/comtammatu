"use client";

import * as React from "react";
import { Collapsible as CollapsiblePrimitive } from "radix-ui";

function Collapsible({
  asChild = false,
  ...props
}: React.ComponentProps<typeof CollapsiblePrimitive.Root>) {
  if (asChild) {
    return <CollapsiblePrimitive.Root asChild {...props} />;
  }

  return <CollapsiblePrimitive.Root data-slot="collapsible" {...props} />;
}

function CollapsibleTrigger({
  ...props
}: React.ComponentProps<typeof CollapsiblePrimitive.CollapsibleTrigger>) {
  return (
    <CollapsiblePrimitive.CollapsibleTrigger
      data-slot="collapsible-trigger"
      {...props}
    />
  );
}

function CollapsibleContent({
  ...props
}: React.ComponentProps<typeof CollapsiblePrimitive.CollapsibleContent>) {
  return (
    <CollapsiblePrimitive.CollapsibleContent
      data-slot="collapsible-content"
      {...props}
    />
  );
}

export { Collapsible, CollapsibleTrigger, CollapsibleContent };
