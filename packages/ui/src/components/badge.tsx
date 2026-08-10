import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../lib/utils";

const badgeVariants = cva(
  "group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border border-transparent px-2 py-0.5 text-2xs font-medium whitespace-nowrap transition-[background-color,border-color,color,box-shadow] duration-[var(--motion-base)] ease-[var(--ease-move)] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-foreground has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/20 [&>svg]:pointer-events-none [&>svg]:size-2.5!",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground [a]:hover:bg-primary",
        secondary:
          "bg-secondary text-secondary-foreground [a]:hover:bg-secondary",
        destructive:
          "bg-destructive/10 text-destructive border-destructive/20 dark:bg-destructive/10 [a]:hover:bg-destructive/20",
        outline:
          "border-border/60 bg-input/10 text-foreground [a]:hover:bg-muted [a]:hover:text-muted-foreground",
        ghost:
          "hover:bg-muted hover:text-muted-foreground dark:hover:bg-muted/50",
        link: "text-primary underline-offset-4 hover:underline",
        success:
          "bg-success/10 text-success border-success/20 dark:bg-success/20 [a]:hover:bg-success/20",
        warning:
          "bg-warning/10 text-warning border-warning/20 dark:bg-warning/20 [a]:hover:bg-warning/20",
        info: "bg-info/10 text-info border-info/20 dark:bg-info/20 [a]:hover:bg-info/20",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

type BadgeProps = useRender.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants>;

function Badge({
  className,
  variant = "default",
  render,
  ...props
}: BadgeProps) {
  const badgeProps = {
    "data-slot": "badge",
    "data-variant": variant,
    className: cn(badgeVariants({ variant }), className),
  };

  return useRender({
    defaultTagName: "span",
    render,
    props: mergeProps<"span">(badgeProps, props),
  });
}

export { Badge, badgeVariants, type BadgeProps };
