"use client";
import { useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { Button } from "@/components/ui/button";
import { inspectPublicSupabaseConfig } from "@/lib/supabase/config";
export default function Login() {
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <div className="auth-card panel">
      <div className="eyebrow">WELCOME TO MAAMUL</div>
      <h1>Sign in to your workspace</h1>
      <p>Use your company’s registered email and password.</p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            if (
              !inspectPublicSupabaseConfig(
                process.env.NEXT_PUBLIC_SUPABASE_URL,
                process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
              ).valid
            )
              throw new Error("Configure Supabase first. See README.md.");
            const f = new FormData(e.currentTarget);
            const db = createBrowserClient(
              process.env.NEXT_PUBLIC_SUPABASE_URL!,
              process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
            );
            const { error } = await db.auth.signInWithPassword({
              email: String(f.get("email")),
              password: String(f.get("password")),
            });
            if (error) throw error;
            window.location.assign("/");
          } catch (e) {
            setMessage(e instanceof Error ? e.message : "Sign-in failed");
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Email
          <input name="email" type="email" autoComplete="username" required />
        </label>
        <label>
          Password
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
            minLength={8}
          />
        </label>
        {message && (
          <p className="alert error" role="alert">
            {message}
          </p>
        )}
        <Button disabled={busy}>{busy ? "Signing in…" : "Sign in"}</Button>
      </form>
      <p className="muted">
        Ask your company administrator to invite you through Supabase Auth.
      </p>
    </div>
  );
}
