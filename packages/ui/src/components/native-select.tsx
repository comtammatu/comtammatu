import * as React from "react";

import { cn } from "../lib/utils";
import { ChevronDown as IconChevronDown } from "lucide-react";

type NativeSelectSize = "xs" | "sm" | "default" | "touch";
type NativeSelectWidth = "fit" | "full";

const nativeSelectWidthClasses: Record<NativeSelectWidth, string> = {
  fit: "w-fit",
  full: "w-full",
};

type NativeSelectProps = Omit<React.ComponentProps<"select">, "size"> & {
  size?: NativeSelectSize;
  width?: NativeSelectWidth;
};

function NativeSelect({
  className,
  size = "default",
  width = "fit",
  ...props
}: NativeSelectProps) {
  return (
    <div
      className={cn(
        "group/native-select relative has-[select:disabled]:opacity-50",
        nativeSelectWidthClasses[width],
        className,
      )}
      data-slot="native-select-wrapper"
      data-size={size}
      data-width={width}
    >
      <select
        data-slot="native-select"
        data-size={size}
        className="h-10 w-full min-w-0 appearance-none rounded-md border border-input bg-input/20 py-1.5 pr-8 pl-3 text-sm transition-colors outline-none select-none selection:bg-primary selection:text-primary-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:pointer-events-none disabled:cursor-not-allowed aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20 data-[size=xs]:h-7 data-[size=xs]:px-2 data-[size=xs]:pr-7 data-[size=xs]:text-xs data-[size=sm]:h-8 data-[size=sm]:px-2.5 data-[size=sm]:pr-8 data-[size=sm]:text-xs data-[size=touch]:min-h-11 data-[size=touch]:px-4 data-[size=touch]:pr-10 dark:bg-input/30 dark:hover:bg-input/50 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40"
        {...props}
      />
      <IconChevronDown
        className="pointer-events-none absolute top-1/2 right-1.5 size-3.5 -translate-y-1/2 text-muted-foreground select-none group-data-[size=xs]/native-select:size-3 group-data-[size=sm]/native-select:size-3 group-data-[size=touch]/native-select:right-2.5 group-data-[size=touch]/native-select:size-4"
        aria-hidden="true"
        data-slot="native-select-icon"
      />
    </div>
  );
}

function NativeSelectOption({
  className,
  ...props
}: React.ComponentProps<"option">) {
  return (
    <option
      data-slot="native-select-option"
      className={cn("bg-[Canvas] text-[CanvasText]", className)}
      {...props}
    />
  );
}

function NativeSelectOptGroup({
  className,
  ...props
}: React.ComponentProps<"optgroup">) {
  return (
    <optgroup
      data-slot="native-select-optgroup"
      className={cn("bg-[Canvas] text-[CanvasText]", className)}
      {...props}
    />
  );
}

export { NativeSelect, NativeSelectOptGroup, NativeSelectOption };
