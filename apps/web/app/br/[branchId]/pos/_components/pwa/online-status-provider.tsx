"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
  prompt(): Promise<void>;
}

interface PosPwaContextValue {
  isOnline: boolean;
  installPrompt: BeforeInstallPromptEvent | null;
  clearInstallPrompt: () => void;
}

const PosPwaContext = createContext<PosPwaContextValue | null>(null);

export function PosPwaProvider({ children }: { children: ReactNode }) {
  // Hydration-safe default: assume online on server + first paint, sync from
  // navigator.onLine in the mount effect. Avoids SSR/CSR text mismatch when
  // device boots offline.
  const [isOnline, setIsOnline] = useState(true);
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    setIsOnline(navigator.onLine);
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    const handleBeforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const handleInstalled = () => setInstallPrompt(null);
    window.addEventListener("beforeinstallprompt", handleBeforeInstall);
    window.addEventListener("appinstalled", handleInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  const clearInstallPrompt = useCallback(() => {
    setInstallPrompt(null);
  }, []);

  const value = useMemo<PosPwaContextValue>(
    () => ({ isOnline, installPrompt, clearInstallPrompt }),
    [isOnline, installPrompt, clearInstallPrompt],
  );

  return (
    <PosPwaContext.Provider value={value}>{children}</PosPwaContext.Provider>
  );
}

export function useIsOnline(): boolean {
  const ctx = useContext(PosPwaContext);
  // Bill receipt and other consumers may render in Storybook / tests without
  // the provider. Default to online so guard logic does not over-trip.
  if (ctx == null) return true;
  return ctx.isOnline;
}

interface InstallPromptHandle {
  available: boolean;
  prompt: () => Promise<void>;
}

export function useInstallPrompt(): InstallPromptHandle | null {
  const ctx = useContext(PosPwaContext);
  if (ctx == null) return null;
  const installEvent = ctx.installPrompt;
  return {
    available: installEvent != null,
    prompt: async () => {
      if (installEvent == null) return;
      try {
        await installEvent.prompt();
        await installEvent.userChoice;
      } finally {
        ctx.clearInstallPrompt();
      }
    },
  };
}
