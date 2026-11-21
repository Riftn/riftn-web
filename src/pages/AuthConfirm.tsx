import { SignInWaitFrame } from "@/components/app/login/SignInWaitFrame";
import { translateCopy as _translateCopy } from '@/i18n/copy';
import { useTranslation as _useCopy } from 'react-i18next';
import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { sameOriginPath } from "@/lib/safe-redirect";

const SUPA_LOGIN_PENDING_KEY = "dehub_supa_login_pending";
// Freshness twin of the pending flag (see AuthProvider): lets a page that
// reloads mid-login recognise "a resume should be on screen right now" and
// open the login sheet from first paint instead of flashing the feed.
const SUPA_LOGIN_PENDING_AT_KEY = "dehub_supa_login_pending_at";

/**
 * Branded confirmation landing for auth emails.
 *
 * Auth emails send users to `https://riftn.com/auth/confirm?token_hash=…&type=…`
 * instead of the raw Supabase verify URL. We verify the OTP client-side
 * (verifyOtp with token_hash) and then bounce into the app.
 *
 * The email proof is consumed only in the browser where it is opened.
 */
export default function AuthConfirm() {
  const { t: _copy } = _useCopy();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [state, setState] = useState<"verifying" | "error">("verifying");
  const [error, setError] = useState<string>("");
  const hasVerifiedRef = useRef(false);

  useEffect(() => {
    if (hasVerifiedRef.current) return;

    const tokenHash = params.get("token_hash");
    const type = params.get("type") as
      | "signup"
      | "magiclink"
      | "recovery"
      | "invite"
      | "email_change"
      | "email"
      | null;
    const next = params.get("next") || "/app";

    if (!tokenHash || !type) {
      setError(_translateCopy("copy.79bb2578e09b", { defaultValue: "This link is missing information. Try requesting a new one." }));
      setState("error");
      return;
    }

    hasVerifiedRef.current = true;

    (async () => {
      // Ensure this device also runs the wallet phase (see AuthProvider auth
      // state listener) — SIGNED_IN only fires proceedToWalletPhase when the
      // pending flag is set.
      try { localStorage.setItem(SUPA_LOGIN_PENDING_KEY, "1"); } catch { /* ignore */ }
      try { localStorage.setItem(SUPA_LOGIN_PENDING_AT_KEY, String(Date.now())); } catch { /* ignore */ }

      const { error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: type as any,
      });
      if (error) {
        try { localStorage.removeItem(SUPA_LOGIN_PENDING_KEY); } catch { /* ignore */ }
        // Supabase words this in English; the sentence below says the same.
        setError(_translateCopy("copy.5998ac369aec", { defaultValue: "This link is invalid or has expired." }));
        setState("error");
        return;
      }

      navigate(sameOriginPath(next), { replace: true });
    })();
  }, [params, navigate]);

  if (state === "verifying") {
    return <SignInWaitFrame label={_copy("copy.afc99407f777", { defaultValue: "Signing you in…" })} />;
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-[hsl(var(--paper,0_0%_100%))]">
      <div className="max-w-md w-full text-center space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">
          {_copy("copy.c43eaf46d577", { defaultValue: "Link problem" })}
        </h1>
        <p className="text-sm text-muted-foreground">{error}</p>
        {(
          <button
            onClick={() => navigate("/app")}
            className="inline-flex items-center rounded-xl px-4 py-2 text-sm font-medium bg-foreground text-background"
          >{_copy("copy.2e69c1cda2b3", { defaultValue: "Back to Riftn" })}</button>
        )}
      </div>
    </div>
  );
}
