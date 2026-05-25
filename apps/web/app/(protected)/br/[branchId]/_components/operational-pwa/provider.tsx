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

interface OperationalPwaContextValue {
  isOnline: boolean;
  isStandalone: boolean;
  isIos: boolean;
  installPrompt: BeforeInstallPromptEvent | null;
  clearInstallPrompt: () => void;
}

const OperationalPwaContext =
  createContext<OperationalPwaContextValue | null>(null);

function isIosLikePlatform(): boolean {
  const navigatorWithTouchPoints = navigator as Navigator & {
    maxTouchPoints?: number;
  };
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" &&
      (navigatorWithTouchPoints.maxTouchPoints ?? 0) > 1)
  );
}

function isRunningStandalone(): boolean {
  const navigatorWithStandalone = navigator as Navigator & {
    standalone?: boolean;
  };
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    navigatorWithStandalone.standalone === true
  );
}

export function OperationalPwaProvider({ children }: { children: ReactNode }) {
  // Hydration-safe default: assume online on server + first paint, sync from
  // navigator.onLine in the mount effect. Avoids SSR/CSR text mismatch when
  // device boots offline.
  const [isOnline, setIsOnline] = useState(true);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    setIsOnline(navigator.onLine);
    setIsIos(isIosLikePlatform());
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
    const displayModeQuery = window.matchMedia("(display-mode: standalone)");
    const handleDisplayModeChange = () => {
      setIsStandalone(isRunningStandalone());
    };

    handleDisplayModeChange();
    displayModeQuery.addEventListener("change", handleDisplayModeChange);
    return () => {
      displayModeQuery.removeEventListener("change", handleDisplayModeChange);
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

  const value = useMemo<OperationalPwaContextValue>(
    () => ({
      isOnline,
      isStandalone,
      isIos,
      installPrompt,
      clearInstallPrompt,
    }),
    [isOnline, isStandalone, isIos, installPrompt, clearInstallPrompt],
  );

  return (
    <OperationalPwaContext.Provider value={value}>
      {children}
    </OperationalPwaContext.Provider>
  );
}

export function useIsOnline(): boolean {
  const ctx = useContext(OperationalPwaContext);
  // Consumers may render in Storybook / tests without the provider. Default to
  // online so guard logic does not over-trip outside the route shell.
  if (ctx == null) return true;
  return ctx.isOnline;
}

export function useIsStandalone(): boolean {
  const ctx = useContext(OperationalPwaContext);
  if (ctx == null) return false;
  return ctx.isStandalone;
}

export function useIsIosPwaInstall(): boolean {
  const ctx = useContext(OperationalPwaContext);
  if (ctx == null) return false;
  return ctx.isIos && !ctx.isStandalone;
}

interface InstallPromptHandle {
  available: boolean;
  prompt: () => Promise<void>;
}

export function useInstallPrompt(): InstallPromptHandle | null {
  const ctx = useContext(OperationalPwaContext);
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
