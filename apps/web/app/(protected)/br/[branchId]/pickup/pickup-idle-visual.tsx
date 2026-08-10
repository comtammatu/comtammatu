import { cn } from "@comtammatu/ui";
import { BrandMascot } from "@/components/brand";

export type PickupIdleState = "empty" | "done";

export function PickupIdleVisual({ state }: { state: PickupIdleState }) {
  const mascotMood = state === "done" ? "waving" : "waiting";

  return (
    <div
      aria-hidden="true"
      className="relative flex h-48 w-48 shrink-0 items-center justify-center sm:h-56 sm:w-56 xl:h-64 xl:w-64"
      data-pickup-idle-state={state}
    >
      <span
        className={cn(
          "absolute inset-6 rounded-full blur-2xl",
          state === "done" ? "bg-warning/10" : "bg-warning/15",
        )}
      />
      <span className="absolute bottom-4 h-16 w-36 rounded-full bg-warning/10 blur-xl" />

      <div
        className="relative z-10 flex h-40 w-32 items-center justify-center sm:h-48 sm:w-36 xl:h-56 xl:w-44"
        data-pickup-idle-state={state}
      >
        <BrandMascot
          animated
          decorative
          mood={mascotMood}
          priority
          className="shrink-0 scale-75 drop-shadow-lg sm:scale-90 xl:scale-100"
        />
      </div>
    </div>
  );
}
