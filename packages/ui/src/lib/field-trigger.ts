import { cva, type VariantProps } from "class-variance-authority";

// Field chrome shared by dropdown form triggers (SelectTrigger, Combobox,
// TagInput). A popover-opening control that belongs to a form must read as
// field chrome, not button chrome; keep resting fill, focus grammar, and
// aria-invalid grammar identical across the three.
export const fieldTriggerChrome =
  "rounded-md border border-input bg-input/20 outline-none transition-colors focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20 data-placeholder:text-muted-foreground dark:bg-input/30 dark:hover:bg-input/50 dark:aria-invalid:ring-destructive/20";

export const fieldTriggerSize = cva("", {
  variants: {
    size: {
      sm: "h-6",
      default: "h-7",
      field: "h-10 px-3",
      touch: "min-h-12 px-3 text-sm",
    },
  },
  defaultVariants: {
    size: "default",
  },
});

export type FieldTriggerSize = NonNullable<
  VariantProps<typeof fieldTriggerSize>["size"]
>;
