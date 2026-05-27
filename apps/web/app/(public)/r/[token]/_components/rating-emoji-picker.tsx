"use client";

import type { Control, FieldPath, FieldValues } from "react-hook-form";
import { useController } from "react-hook-form";
import { cn } from "@comtammatu/ui";
import { Field, FieldError, FieldLabel } from "@comtammatu/ui/components/field";

const RATING_OPTIONS = [
  { value: 1, emoji: "😡", label: "Rất tệ" },
  { value: 2, emoji: "😞", label: "Tệ" },
  { value: 3, emoji: "😐", label: "Bình thường" },
  { value: 4, emoji: "🙂", label: "Tốt" },
  { value: 5, emoji: "🤩", label: "Xuất sắc" },
] as const;

export interface RatingEmojiPickerProps<TFieldValues extends FieldValues> {
  control: Control<TFieldValues>;
  name: FieldPath<TFieldValues>;
  label?: string;
  required?: boolean;
}

export function RatingEmojiPicker<TFieldValues extends FieldValues>({
  control,
  name,
  label = "Đánh giá",
  required,
}: RatingEmojiPickerProps<TFieldValues>) {
  const { field, fieldState } = useController({ control, name });
  const hasError = !!fieldState.error;

  return (
    <Field data-invalid={hasError}>
      <FieldLabel>
        {label}
        {required ? " *" : null}
      </FieldLabel>
      <div
        role="radiogroup"
        aria-label={label}
        aria-required={required}
        className="flex gap-2"
      >
        {RATING_OPTIONS.map((opt) => {
          const isSelected = field.value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={isSelected}
              aria-label={opt.label}
              onClick={() => field.onChange(opt.value)}
              onBlur={field.onBlur}
              className={cn(
                "flex flex-1 flex-col items-center rounded-lg border-2 p-2 text-2xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                isSelected
                  ? "border-primary bg-primary/10"
                  : "border-border hover:border-primary/50 hover:bg-accent",
              )}
            >
              <span aria-hidden="true">{opt.emoji}</span>
              <span className="mt-1 text-xs text-muted-foreground">
                {opt.label}
              </span>
            </button>
          );
        })}
      </div>
      {fieldState.error ? <FieldError errors={[fieldState.error]} /> : null}
    </Field>
  );
}
