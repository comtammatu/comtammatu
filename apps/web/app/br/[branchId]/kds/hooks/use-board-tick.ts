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

const TickContext = createContext<number>(0);

export function TickProvider({
  children,
  initialNow,
}: PropsWithChildren<{ initialNow: number }>) {
  const [now, setNow] = useState(initialNow);

  useEffect(() => {
    setNow(Date.now());
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
  return useContext(TickContext);
}
