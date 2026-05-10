"use client"

import * as React from "react"
import { Slider as SliderPrimitive } from "radix-ui"

import { cn } from '../lib/utils'

type SliderSize = "sm" | "default" | "touch"

const sliderTrackSizes: Record<SliderSize, string> = {
  sm: "data-horizontal:h-0.5 data-vertical:w-0.5",
  default: "data-horizontal:h-1 data-vertical:w-1",
  touch: "data-horizontal:h-2 data-vertical:w-2",
}

const sliderThumbSizes: Record<SliderSize, string> = {
  sm: "size-2.5 after:-inset-2",
  default: "size-3 after:-inset-2",
  touch: "size-5 after:-inset-3",
}

function Slider({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  size = "default",
  ...props
}: React.ComponentProps<typeof SliderPrimitive.Root> & {
  size?: SliderSize
}) {
  const _values = React.useMemo(
    () =>
      Array.isArray(value)
        ? value
        : Array.isArray(defaultValue)
          ? defaultValue
          : [min, max],
    [value, defaultValue, min, max]
  )

  return (
    <SliderPrimitive.Root
      data-slot="slider"
      data-size={size}
      defaultValue={defaultValue}
      value={value}
      min={min}
      max={max}
      className={cn(
        "relative flex w-full touch-none items-center select-none data-disabled:opacity-50 data-vertical:h-full data-vertical:min-h-40 data-vertical:w-auto data-vertical:flex-col",
        className
      )}
      {...props}
    >
      <SliderPrimitive.Track
        data-slot="slider-track"
        className={cn(
          "relative grow overflow-hidden rounded-md bg-muted data-horizontal:w-full data-vertical:h-full",
          sliderTrackSizes[size],
        )}
      >
        <SliderPrimitive.Range
          data-slot="slider-range"
          className="absolute bg-primary select-none data-horizontal:h-full data-vertical:w-full"
        />
      </SliderPrimitive.Track>
      {Array.from({ length: _values.length }, (_, index) => (
        <SliderPrimitive.Thumb
          data-slot="slider-thumb"
          key={index}
          className={cn(
            "relative block shrink-0 rounded-md border border-ring bg-white ring-ring/30 transition-[color,box-shadow] select-none after:absolute hover:ring-2 focus-visible:ring-2 focus-visible:outline-hidden active:ring-2 disabled:pointer-events-none disabled:opacity-50",
            sliderThumbSizes[size],
          )}
        />
      ))}
    </SliderPrimitive.Root>
  )
}

export { Slider }
