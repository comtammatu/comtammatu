import * as React from "react";

import { cn } from "../lib/utils";
import { Input } from "./input";

type DatePickerProps = Omit<React.ComponentProps<typeof Input>, "type"> & {
  label?: React.ReactNode;
  description?: React.ReactNode;
  touch?: boolean;
};

function DatePicker({
  id,
  label,
  description,
  touch = false,
  className,
  ...props
}: DatePickerProps) {
  const generatedId = React.useId();
  const descriptionId = React.useId();
  const inputId = id ?? generatedId;
  const describedBy =
    [props["aria-describedby"], description ? descriptionId : null]
      .filter(Boolean)
      .join(" ") || undefined;

  return (
    <div data-slot="date-picker" className="flex flex-col gap-1.5">
      {label ? (
        <label htmlFor={inputId} className="text-xs font-medium">
          {label}
        </label>
      ) : null}
      <Input
        {...props}
        id={inputId}
        type="date"
        aria-describedby={describedBy}
        className={cn(touch && "min-h-12 px-3 text-sm", className)}
      />
      {description ? (
        <span id={descriptionId} className="text-2xs text-muted-foreground">
          {description}
        </span>
      ) : null}
    </div>
  );
}

export { DatePicker };
