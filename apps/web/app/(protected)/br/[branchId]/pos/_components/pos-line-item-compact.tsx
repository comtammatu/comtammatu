import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { cn } from "@comtammatu/ui";
import { formatPortionQuantity } from "@comtammatu/shared/format";
import { POS_VI } from "@comtammatu/shared/messages";
import { Badge } from "@comtammatu/ui/components/badge";

interface PosLineItemCompactProps {
  quantity: number;
  title: string;
  total: string;
  options: string | null;
  modifiers?: readonly string[];
  sides?: readonly string[];
  discount?: string | null;
  note: string | null;
  isPriority?: boolean;
  afterTitle?: ReactNode;
  className?: string;
  quantityClassName?: string;
  titleClassName?: string;
  totalClassName?: string;
  optionsClassName?: string;
  discountClassName?: string;
  noteClassName?: string;
}

type LineChangeTone = "quantity" | "content" | null;

function useLineChangeFeedback({
  quantity,
  title,
  total,
  options,
  modifiers,
  sides,
  discount,
  note,
  isPriority,
}: Pick<
  PosLineItemCompactProps,
  | "quantity"
  | "title"
  | "total"
  | "options"
  | "modifiers"
  | "sides"
  | "discount"
  | "note"
  | "isPriority"
>): { tone: LineChangeTone; quantityDelta: number | null } {
  const signature = useMemo(
    () =>
      JSON.stringify({
        quantity,
        title,
        total,
        options,
        modifiers,
        sides,
        discount,
        note,
        isPriority,
      }),
    [
      discount,
      isPriority,
      modifiers,
      note,
      options,
      quantity,
      sides,
      title,
      total,
    ],
  );
  const previousRef = useRef<{ signature: string; quantity: number } | null>(
    null,
  );
  const [feedback, setFeedback] = useState<{
    tone: LineChangeTone;
    quantityDelta: number | null;
  }>({ tone: null, quantityDelta: null });

  useEffect(() => {
    const previous = previousRef.current;
    previousRef.current = { signature, quantity };

    if (!previous || previous.signature === signature) return;

    const quantityDelta = quantity - previous.quantity;
    setFeedback({
      tone: quantityDelta !== 0 ? "quantity" : "content",
      quantityDelta: quantityDelta !== 0 ? quantityDelta : null,
    });
    const timeout = window.setTimeout(
      () => setFeedback({ tone: null, quantityDelta: null }),
      1200,
    );
    return () => window.clearTimeout(timeout);
  }, [quantity, signature]);

  return feedback;
}

function getLineChangeToneClass(tone: LineChangeTone): string | false {
  if (tone === "quantity") {
    return "bg-info/10 ring-2 ring-inset ring-info/20 motion-safe:animate-pulse";
  }
  if (tone === "content") {
    return "bg-info/10 ring-2 ring-inset ring-info/20";
  }
  return false;
}

function DetailLine({
  label,
  values,
  className,
}: {
  label: string;
  values: readonly string[];
  className?: string;
}) {
  if (values.length === 0) return null;

  return (
    <p className={cn("min-w-0 break-words text-sm leading-snug", className)}>
      <span className="font-semibold text-foreground">{label}: </span>
      <span>{values.join(", ")}</span>
    </p>
  );
}

export function PosLineItemCompact({
  quantity,
  title,
  total,
  options,
  modifiers = [],
  sides = [],
  discount,
  note,
  isPriority,
  afterTitle,
  className,
  quantityClassName,
  titleClassName,
  totalClassName,
  optionsClassName,
  discountClassName,
  noteClassName,
}: PosLineItemCompactProps) {
  const { tone, quantityDelta } = useLineChangeFeedback({
    quantity,
    title,
    total,
    options,
    modifiers,
    sides,
    discount,
    note,
    isPriority,
  });
  const hasStructuredOptions = modifiers.length > 0 || sides.length > 0;

  return (
    <div
      className={cn(
        "flex w-full min-w-0 max-w-full gap-3 rounded-md p-1 transition-colors duration-150",
        getLineChangeToneClass(tone),
        className,
      )}
    >
      <div className="flex w-12 shrink-0 flex-col items-stretch gap-1">
        <Badge
          variant="outline"
          className={cn(
            "justify-center rounded-md px-2 py-1 font-mono text-base font-bold leading-none tabular-nums",
            quantityClassName,
          )}
        >
          {formatPortionQuantity(quantity)}
        </Badge>
        {quantityDelta !== null ? (
          <Badge
            variant={quantityDelta > 0 ? "info" : "destructive"}
            className="justify-center px-1 py-0 font-mono text-xs font-bold tabular-nums"
          >
            {quantityDelta > 0 ? `+${String(quantityDelta)}` : quantityDelta}
          </Badge>
        ) : null}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 max-w-full flex-wrap items-start gap-x-2 gap-y-1">
          <p
            className={cn(
              "min-w-0 flex-1 break-words text-base font-semibold leading-snug text-foreground",
              titleClassName,
            )}
          >
            {title}
          </p>
          {isPriority ? (
            <Badge variant="warning" className="shrink-0 text-xs font-semibold">
              {POS_VI.priorityBadge}
            </Badge>
          ) : null}
          {afterTitle ? <span className="shrink-0">{afterTitle}</span> : null}
        </div>
        <div className="mt-1 flex flex-col gap-1 text-muted-foreground">
          <DetailLine
            label={POS_VI.options}
            values={modifiers}
            className={optionsClassName}
          />
          <DetailLine
            label={POS_VI.sides}
            values={sides}
            className={optionsClassName}
          />
          {!hasStructuredOptions && options ? (
            <p
              className={cn(
                "min-w-0 break-words text-sm leading-snug",
                optionsClassName,
              )}
            >
              {options}
            </p>
          ) : null}
          {discount ? (
            <p
              className={cn(
                "min-w-0 break-words text-sm font-medium leading-snug text-success",
                discountClassName,
              )}
            >
              {discount}
            </p>
          ) : null}
          {note ? (
            <p
              className={cn(
                "max-h-20 min-w-0 overflow-y-auto break-words pr-1 text-sm italic leading-snug",
                noteClassName,
              )}
            >
              <span className="font-semibold not-italic text-foreground">
                {POS_VI.notePrefix}
              </span>
              {note}
            </p>
          ) : null}
        </div>
      </div>
      <p
        className={cn(
          "shrink-0 whitespace-nowrap text-right text-base font-bold leading-snug text-primary tabular-nums",
          totalClassName,
        )}
      >
        {total}
      </p>
    </div>
  );
}
