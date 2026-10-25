"use client";
import Link from "next/link";
import { useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { Button } from "@/components/ui/button";
export default function ForgotPassword() {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  return (
    <div className="auth-card panel">
      <div className="eyebrow">MAAMUL HR</div>
      <h1>Reset your password</h1>
      <p>
        Enter your account email. We will send a password reset link if the
        account exists.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const email = String(
            new FormData(e.currentTarget).get("email"),
          ).trim();
          setBusy(true);
          setMessage("");
          try {
            const db = createBrowserClient(
              process.env.NEXT_PUBLIC_SUPABASE_URL!,
              process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
            );
            const { error } = await db.auth.resetPasswordForEmail(email, {
              redirectTo: window.location.origin + "/auth/callback",
            });
            setMessage(
              error
                ? "The reset request could not be completed. Please try again later."
                : "If this email has an account, a reset link has been sent. Check your inbox and spam folder. Open the link in this browser.",
            );
          } catch {
            setMessage(
              "The reset request could not be completed. Please try again later.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Email
          <input
            name="email"
            type="email"
            autoComplete="email"
            required
            disabled={busy}
          />
        </label>
        <Button disabled={busy}>{busy ? "Sending…" : "Send reset link"}</Button>
      </form>
      {message && (
        <p role="status" className="alert">
          {message}
        </p>
      )}
      <p>
        <Link href="/login">Back to sign in</Link>
      </p>
    </div>
  );
}
