"use client";

import { useEffect, useId, useRef, useState } from "react";
import Image from "next/image";
import { Button } from "@comtammatu/ui/components/button";
import { Input } from "@comtammatu/ui/components/input";
import { Field, FieldError, FieldLabel } from "@comtammatu/ui/components/field";
import {
  OWNER_SHELL_BREAKPOINT,
  useIsMobile,
} from "@comtammatu/ui/hooks/use-mobile";
import { messages } from "@lib/messages";
import { INGREDIENT_IMAGE_INPUT_MAX_BYTES } from "@lib/inventory/ingredient-image";

const copy = messages.inventory.ingredientImage;

export function IngredientImageInput({
  value,
  onChange,
  disabled,
}: {
  value: string | File | null;
  onChange: (value: File | null) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const touch = useIsMobile(OWNER_SHELL_BREAKPOINT);
  useEffect(() => {
    if (!(value instanceof File)) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(value);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [value]);
  const source = typeof value === "string" ? value : preview;
  return (
    <Field data-invalid={Boolean(error)} className="min-w-0">
      <FieldLabel htmlFor={id}>{copy.label}</FieldLabel>
      {source ? (
        <div>
          <Image
            unoptimized
            src={source}
            alt={copy.label}
            width={120}
            height={120}
            className="size-28 rounded-md object-cover"
          />
        </div>
      ) : null}
      <Input
        ref={input}
        id={id}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        disabled={disabled}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          if (
            !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
            file.size === 0 ||
            file.size > INGREDIENT_IMAGE_INPUT_MAX_BYTES
          ) {
            setError(copy.invalid);
            return;
          }
          setError(null);
          onChange(file);
        }}
      />
      <div className="flex min-w-0 flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size={touch ? "touch" : "default"}
          disabled={disabled}
          onClick={() => input.current?.click()}
        >
          {copy.choose}
        </Button>
        {value ? (
          <Button
            type="button"
            variant="ghost"
            size={touch ? "touch" : "default"}
            disabled={disabled}
            onClick={() => {
              setError(null);
              onChange(null);
            }}
          >
            {copy.remove}
          </Button>
        ) : null}
      </div>
      {error ? <FieldError id={`${id}-error`}>{error}</FieldError> : null}
    </Field>
  );
}
