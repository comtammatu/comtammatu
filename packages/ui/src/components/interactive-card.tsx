import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";

import { cn } from "../lib/utils";

const INTERACTIVE_CARD_BASE_CLASSNAME =
  "flex items-center gap-3 rounded-md border bg-card text-card-foreground outline-none transition hover:bg-accent/20 hover:shadow-effect-card-hover focus-visible:ring-[3px] focus-visible:ring-foreground active:scale-[0.99] disabled:pointer-events-none disabled:opacity-50";

const MIN_HEIGHT_CLASSNAME = {
  default: "",
  mobile: "min-h-18",
  tap: "min-h-16",
} as const;

const PADDING_CLASSNAME = {
  default: "px-4 py-3",
  compact: "px-3 py-2",
  none: "",
} as const;

type InteractiveCardProps = useRender.ComponentProps<"div"> & {
  minHeight?: keyof typeof MIN_HEIGHT_CLASSNAME;
  padding?: keyof typeof PADDING_CLASSNAME;
};

function InteractiveCard({
  className,
  minHeight,
  padding,
  render,
  ...props
}: InteractiveCardProps) {
  const resolvedMinHeight = minHeight ?? "default";
  const resolvedPadding = padding ?? "default";
  const cardProps = {
    "data-slot": "interactive-card",
    className: cn(
      INTERACTIVE_CARD_BASE_CLASSNAME,
      MIN_HEIGHT_CLASSNAME[resolvedMinHeight],
      PADDING_CLASSNAME[resolvedPadding],
      className,
    ),
  };

  return useRender({
    defaultTagName: "div",
    render,
    props: mergeProps<"div">(cardProps, props),
  });
}

export { InteractiveCard, type InteractiveCardProps };
