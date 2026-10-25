"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { Button } from "@/components/ui/button";
import { newPasswordSchema } from "@/lib/account-validation";
export default function ResetPassword() {
  const [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [done, setDone] = useState(false),
    [message, setMessage] = useState("Checking your reset session…");
  useEffect(() => {
    let active = true;
    const db = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    );
    db.auth
      .getUser()
      .then(({ data, error }) => {
        if (active) {
          setReady(!error && !!data.user);
          setMessage(
            error || !data.user
              ? "This reset link is invalid or expired. Request a new link."
              : "",
          );
        }
      })
      .catch(() => {
        if (active)
          setMessage("Unable to verify the reset session. Request a new link.");
      });
    return () => {
      active = false;
    };
  }, []);
  return (
    <div className="auth-card panel">
      <div className="eyebrow">MAAMUL HR</div>
      <h1>Choose a new password</h1>
      {ready && !done && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const parsed = newPasswordSchema.safeParse(f.get("password"));
            if (!parsed.success) {
              setMessage("Use a password with 12–128 characters.");
              return;
            }
            if (parsed.data !== f.get("confirm")) {
              setMessage("Passwords do not match.");
              return;
            }
            setBusy(true);
            try {
              const db = createBrowserClient(
                process.env.NEXT_PUBLIC_SUPABASE_URL!,
                process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
              );
              const verified = await db.auth.getUser();
              if (verified.error || !verified.data.user)
                throw Error("Reset session expired. Request a new link.");
              const { error } = await db.auth.updateUser({
                password: parsed.data,
              });
              if (error)
                throw Error(
                  "Password could not be updated. Use a different strong password or request a new link.",
                );
              await db.auth.signOut();
              setDone(true);
              setMessage(
                "Password updated. Sign in with your email or login name and new password.",
              );
            } catch (e) {
              setMessage(
                e instanceof Error ? e.message : "Password update failed.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            New password
            <input
              name="password"
              type="password"
              minLength={12}
              maxLength={128}
              autoComplete="new-password"
              required
              disabled={busy}
            />
          </label>
          <label>
            Confirm password
            <input
              name="confirm"
              type="password"
              minLength={12}
              maxLength={128}
              autoComplete="new-password"
              required
              disabled={busy}
            />
          </label>
          <Button disabled={busy}>
            {busy ? "Saving…" : "Save new password"}
          </Button>
        </form>
      )}
      {message && (
        <p role="status" className="alert">
          {message}
        </p>
      )}
      <p>
        <Link href={done ? "/login" : "/forgot-password"}>
          {done ? "Sign in" : "Request a new reset link"}
        </Link>
      </p>
    </div>
  );
}
