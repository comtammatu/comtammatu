import { NotificationBellServer } from "./notification-bell-server";

/**
 * Floating bell anchored top-right. Mounted once in the root layout so it is
 * available on every authenticated surface without plumbing props through
 * per-module headers. Hidden on mobile (bottom-safe) and on auth routes that
 * have no session (server component returns null).
 */
export async function NotificationBellFloating() {
  const bell = await NotificationBellServer();
  if (!bell) return null;
  return (
    <div className="pointer-events-none fixed right-4 top-3 z-40">
      <div className="pointer-events-auto rounded-full border border-border/60 bg-background/95 shadow-sm backdrop-blur">
        {bell}
      </div>
    </div>
  );
}
