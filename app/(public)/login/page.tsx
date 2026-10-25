"use client";
import { useState } from "react";
import Link from "next/link";
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
            const response = await fetch("/api/auth/login", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                identifier: f.get("identifier"),
                password: f.get("password"),
              }),
            });
            const result = await response.json();
            if (!response.ok) throw Error(result.error ?? "Sign-in failed");
            window.location.assign("/");
          } catch (e) {
            setMessage(e instanceof Error ? e.message : "Sign-in failed");
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Email or login name
          <input
            name="identifier"
            type="text"
            autoComplete="username"
            required
          />
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
      <p>
        <Link href="/forgot-password">Forgot password?</Link>
      </p>
    </div>
  );
}
