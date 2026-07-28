import { createClient } from "@comtammatu/database/supabase/server";
import {
  extractClaimsFromAccessToken,
  getDefaultRedirect,
} from "@comtammatu/shared/auth";
import { NotFoundPanel } from "@/components/not-found-panel";

async function resolveNotFoundRecovery(): Promise<{
  homeHref: string;
  preferLogin: boolean;
}> {
  try {
    const supabase = await createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) {
      return { homeHref: "/login", preferLogin: true };
    }
    const claims = extractClaimsFromAccessToken(session.access_token);
    if (!claims) {
      return { homeHref: "/login", preferLogin: true };
    }
    return { homeHref: getDefaultRedirect(claims), preferLogin: false };
  } catch {
    return { homeHref: "/login", preferLogin: true };
  }
}

export default async function RootNotFound() {
  const { homeHref, preferLogin } = await resolveNotFoundRecovery();

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="flex min-h-dvh items-center justify-center p-4"
    >
      <div className="w-full max-w-xl">
        <NotFoundPanel homeHref={homeHref} preferLogin={preferLogin} />
      </div>
    </main>
  );
}
