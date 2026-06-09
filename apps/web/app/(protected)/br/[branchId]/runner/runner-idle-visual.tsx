"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { DotLottieReact, type DotLottie } from "@lottiefiles/dotlottie-react";
import { cn } from "@comtammatu/ui";

export type RunnerIdleState = "empty" | "done";

const RUNNER_MASCOT = {
  src: "/brand/mascot/be-suon-tuoi-runner.png",
  width: 384,
  height: 512,
  alt: "",
} as const;
const RUNNER_MASCOT_ANIMATION_SRC =
  "/brand/mascot/be-suon-tuoi-runner-idle.json";
const RUNNER_MASCOT_ANIMATION_SEGMENTS: Record<
  RunnerIdleState,
  [number, number]
> = {
  empty: [0, 119],
  done: [120, 239],
};

export function RunnerIdleVisual({ state }: { state: RunnerIdleState }) {
  const canAnimate = usePrefersMotion();
  const [animationFailed, setAnimationFailed] = useState(false);
  const [dotLottie, setDotLottie] = useState<DotLottie | null>(null);

  useEffect(() => {
    setAnimationFailed(false);
  }, [state]);

  useEffect(() => {
    if (!dotLottie) return;

    const handleAnimationError = () => {
      setAnimationFailed(true);
    };

    dotLottie.addEventListener("loadError", handleAnimationError);
    dotLottie.addEventListener("renderError", handleAnimationError);

    return () => {
      dotLottie.removeEventListener("loadError", handleAnimationError);
      dotLottie.removeEventListener("renderError", handleAnimationError);
    };
  }, [dotLottie]);

  const showStaticMascot = !canAnimate || animationFailed;

  return (
    <div
      aria-hidden="true"
      className="relative flex h-64 w-64 shrink-0 items-center justify-center md:h-72 md:w-72"
      data-runner-idle-state={state}
    >
      {canAnimate ? (
        <>
          <span
            className={cn(
              "absolute inset-6 rounded-full blur-2xl motion-safe:animate-pulse",
              state === "done" ? "bg-warning/10" : "bg-warning/15",
            )}
          />
          <span className="absolute bottom-4 h-20 w-40 rounded-full bg-warning/10 blur-xl" />
          <span className="absolute bottom-24 left-20 h-20 w-2 rounded-full bg-warning/25 blur-sm motion-safe:animate-pulse" />
          <span className="absolute bottom-28 h-20 w-2 rounded-full bg-warning/20 blur-sm motion-safe:animate-pulse" />
          <span className="absolute right-20 bottom-24 h-20 w-2 rounded-full bg-warning/25 blur-sm motion-safe:animate-pulse" />
        </>
      ) : null}

      <div
        className={cn(
          "relative z-10 flex h-56 w-44 items-center justify-center md:h-64 md:w-48",
          canAnimate && showStaticMascot && "motion-safe:animate-bounce",
        )}
      >
        {showStaticMascot ? (
          <Image
            src={RUNNER_MASCOT.src}
            width={RUNNER_MASCOT.width}
            height={RUNNER_MASCOT.height}
            alt={RUNNER_MASCOT.alt}
            priority
            className="h-full w-auto shrink-0 object-contain drop-shadow-lg"
          />
        ) : (
          <DotLottieReact
            key={state}
            src={RUNNER_MASCOT_ANIMATION_SRC}
            segment={RUNNER_MASCOT_ANIMATION_SEGMENTS[state]}
            autoplay
            loop
            speed={state === "done" ? 0.85 : 0.7}
            dotLottieRefCallback={setDotLottie}
            className={cn(
              "h-full w-full shrink-0 drop-shadow-lg",
              state === "done" && "motion-safe:animate-pulse",
            )}
          />
        )}
      </div>
    </div>
  );
}

function usePrefersMotion(): boolean {
  const [canAnimate, setCanAnimate] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: no-preference)");
    const syncMotionPreference = () => {
      setCanAnimate(query.matches);
    };

    syncMotionPreference();
    query.addEventListener("change", syncMotionPreference);

    return () => {
      query.removeEventListener("change", syncMotionPreference);
    };
  }, []);

  return canAnimate;
}
