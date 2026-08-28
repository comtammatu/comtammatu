import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { cn } from "@comtammatu/ui";
import { formatPortionQuantity } from "@comtammatu/shared/format";
import { POS_VI } from "@comtammatu/shared/messages";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Minus as IconMinus, Plus as IconPlus } from "lucide-react";

interface PosLineItemCompactProps {
  quantity: number;
  title: string;
  total: string;
  options: string | null;
  modifiers?: readonly string[];
  sides?: readonly string[];
  discount?: string | null;
  originalTotal?: string | null;
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
  onIncreaseQuantity?: () => void;
  onDecreaseQuantity?: () => void;
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
  originalTotal,
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
  | "originalTotal"
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
        originalTotal,
        note,
        isPriority,
      }),
    [
      discount,
      isPriority,
      modifiers,
      note,
      options,
      originalTotal,
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

export function PosLineItemCompact({
  quantity,
  title,
  total,
  options,
  modifiers = [],
  sides = [],
  discount,
  originalTotal,
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
  onIncreaseQuantity,
  onDecreaseQuantity,
}: PosLineItemCompactProps) {
  const { tone, quantityDelta } = useLineChangeFeedback({
    quantity,
    title,
    total,
    options,
    modifiers,
    sides,
    discount,
    originalTotal,
    note,
    isPriority,
  });
  const hasStructuredOptions = modifiers.length > 0 || sides.length > 0;
  const allOptionTags = [...modifiers, ...sides];

  return (
    <div
      className={cn(
        "flex w-full min-w-0 max-w-full items-start gap-2 rounded-md p-1 transition-colors duration-150",
        getLineChangeToneClass(tone),
        className,
      )}
    >
      {onIncreaseQuantity && onDecreaseQuantity ? (
        <div
          className="flex h-8 shrink-0 items-center gap-1"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          <Button
            type="button"
            variant="outline"
            size="icon-touch"
            className="size-8 shrink-0 rounded-md text-muted-foreground hover:bg-background hover:text-foreground active:scale-90 touch-manipulation"
            aria-label={`Bớt 1 phần ${title}`}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onDecreaseQuantity();
            }}
          >
            <IconMinus className="size-4" />
          </Button>
          <span className="min-w-5 shrink-0 px-0.5 text-center font-mono text-sm font-semibold tabular-nums text-foreground">
            {formatPortionQuantity(quantity)}
          </span>
          <Button
            type="button"
            variant="outline"
            size="icon-touch"
            className="size-8 shrink-0 rounded-md text-muted-foreground hover:bg-background hover:text-foreground active:scale-90 touch-manipulation"
            aria-label={`Thêm 1 phần ${title}`}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onIncreaseQuantity();
            }}
          >
            <IconPlus className="size-4" />
          </Button>
        </div>
      ) : (
        <div className="flex shrink-0 items-center">
          <Badge
            variant="outline"
            className={cn(
              "h-7 min-w-7 justify-center rounded-md px-1.5 font-mono text-sm font-bold leading-none tabular-nums",
              quantityClassName,
            )}
          >
            {formatPortionQuantity(quantity)}
          </Badge>
          {quantityDelta !== null ? (
            <Badge
              variant={quantityDelta > 0 ? "info" : "destructive"}
              className="ml-1 h-5 justify-center px-1 py-0 font-mono text-2xs font-bold tabular-nums"
            >
              {quantityDelta > 0 ? `+${String(quantityDelta)}` : quantityDelta}
            </Badge>
          ) : null}
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex min-w-0 items-start justify-between gap-2">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
            <span
              className={cn(
                "min-w-0 break-words text-sm font-semibold leading-snug text-foreground sm:text-base",
                titleClassName,
              )}
            >
              {title}
            </span>
            {isPriority ? (
              <Badge variant="warning" className="h-5 shrink-0 px-1.5 py-0 text-2xs font-semibold">
                {POS_VI.priorityBadge}
              </Badge>
            ) : null}
            {afterTitle ? <span className="shrink-0">{afterTitle}</span> : null}
          </div>
          <div className="flex shrink-0 items-baseline gap-1 text-right">
            {originalTotal ? (
              <span className="font-mono text-xs tabular-nums text-muted-foreground line-through">
                {originalTotal}
              </span>
            ) : null}
            <span
              className={cn(
                "font-mono text-sm font-bold leading-snug text-primary tabular-nums sm:text-base",
                totalClassName,
              )}
            >
              {total}
            </span>
          </div>
        </div>

        {hasStructuredOptions ? (
          <div className={cn("mt-0.5 flex flex-wrap items-center gap-1", optionsClassName)}>
            {allOptionTags.map((opt, index) => (
              <span
                key={index}
                className="inline-flex max-w-full items-center truncate rounded-md bg-muted/50 px-1.5 py-0.5 text-xs font-normal leading-tight text-muted-foreground"
              >
                {opt}
              </span>
            ))}
          </div>
        ) : options ? (
          <p
            className={cn(
              "mt-0.5 min-w-0 break-words text-xs leading-snug text-muted-foreground",
              optionsClassName,
            )}
          >
            {options}
          </p>
        ) : null}

        {discount ? (
          <p
            className={cn(
              "mt-0.5 min-w-0 break-words font-mono text-xs font-medium leading-snug text-success",
              discountClassName,
            )}
          >
            {discount}
          </p>
        ) : null}

        {note ? (
          <p
            className={cn(
              "mt-0.5 max-h-20 min-w-0 overflow-y-auto break-words pr-1 text-sm italic leading-snug text-muted-foreground",
              noteClassName,
            )}
          >
            <span className="font-semibold not-italic text-foreground/80">
              {POS_VI.notePrefix}
            </span>
            {note}
          </p>
        ) : null}
      </div>
    </div>
  );
}
