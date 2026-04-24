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

const TickContext = createContext<number>(Date.now());

export function TickProvider({ children }: PropsWithChildren) {
  const [now, setNow] = useState(() => Date.now());

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
  return useContext(TickContext);
}
