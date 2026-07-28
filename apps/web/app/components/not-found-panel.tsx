import Link from "next/link";
import { ACTIONS_VI, ERRORS_VI } from "@comtammatu/shared/messages";
import { Button } from "@comtammatu/ui/components/button";
import { AppEmptyState } from "@/components/surface";

export type NotFoundPanelProps = {
  /** Role-aware default landing when the user still has a usable session. */
  homeHref?: string;
  homeLabel?: string;
  /**
   * When true (default), offer sign-out → /login so a stale or revoked session
   * after role/permission changes is not a dead end behind "go home".
   */
  allowSignInAgain?: boolean;
  /** Prefer login CTA when there is no authenticated session to recover. */
  preferLogin?: boolean;
};

export function NotFoundPanel({
  homeHref = "/",
  homeLabel = ACTIONS_VI.goDefaultHome,
  allowSignInAgain = true,
  preferLogin = false,
}: NotFoundPanelProps) {
  return (
    <AppEmptyState
      title={ERRORS_VI.pageNotFound}
      description={ERRORS_VI.pageNotFoundHint}
      role="status"
      aria-live="polite"
    >
      <div className="flex w-full max-w-sm flex-col gap-2 sm:max-w-none sm:flex-row sm:justify-center">
        {preferLogin ? (
          <Button
            size="touch"
            className="w-full sm:w-auto sm:min-w-40"
            render={<Link href="/login" replace />}
          >
            {ACTIONS_VI.signIn}
          </Button>
        ) : (
          <>
            {/* Sign-in-again is primary: stale JWT after role change can make
                "default home" loop back into another blocked/404 surface. */}
            {allowSignInAgain ? (
              <form
                action="/api/auth/signout"
                method="post"
                className="w-full sm:w-auto"
              >
                <Button type="submit" size="touch" className="w-full sm:min-w-40">
                  {ACTIONS_VI.signInAgain}
                </Button>
              </form>
            ) : null}
            <Button
              size="touch"
              variant="outline"
              className="w-full sm:w-auto sm:min-w-40"
              render={<Link href={homeHref} replace />}
            >
              {homeLabel}
            </Button>
          </>
        )}
      </div>
    </AppEmptyState>
  );
}
