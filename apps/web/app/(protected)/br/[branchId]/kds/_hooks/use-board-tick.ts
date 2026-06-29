"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type PropsWithChildren,
  createElement,
} from "react";

const TICK_INTERVAL_MS = 15_000;

const TickContext = createContext<number | null>(null);

interface TickProviderProps extends PropsWithChildren {
  initialNowMs: number;
}

export function TickProvider({ children, initialNowMs }: TickProviderProps) {
  const [now, setNow] = useState(initialNowMs);

  useEffect(() => {
    const id = window.setInterval(() => {
      setNow(Date.now());
    }, TICK_INTERVAL_MS);
    return () => {
      window.clearInterval(id);
    };
  }, []);

  return createElement(TickContext.Provider, { value: now }, children);
}

export function useBoardTick(): number {
  const now = useContext(TickContext);
  if (now === null) {
    throw new Error("useBoardTick must be used within TickProvider");
  }
  return now;
}
