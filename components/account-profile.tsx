"use client";
import { useState } from "react";
import Link from "next/link";
import { Button } from "./ui/button";
export function AccountProfile({
  email,
  username,
  displayName,
}: {
  email: string;
  username: string;
  displayName: string;
}) {
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <section className="panel settings-card">
      <h1>Your account</h1>
      <p>
        Email for sign-in and password recovery: <strong>{email}</strong>
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          setBusy(true);
          try {
            const r = await fetch("/api/account", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                username: f.get("username"),
                display_name: f.get("display_name"),
              }),
            });
            const result = await r.json();
            if (!r.ok) throw Error(result.error);
            setMessage(
              "Saved. You can now sign in with your login name or email.",
            );
          } catch (e) {
            setMessage(e instanceof Error ? e.message : "Save failed");
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Display name
          <input
            name="display_name"
            defaultValue={displayName}
            required
            maxLength={100}
          />
        </label>
        <label>
          Login name
          <input
            name="username"
            defaultValue={username}
            autoComplete="username"
            required
            minLength={3}
            maxLength={32}
            pattern="[a-zA-Z0-9][a-zA-Z0-9_.\-]{2,31}"
          />
        </label>
        <p>
          Use a unique name, for example zakaria. No spaces. Your email still
          works if you forget this name.
        </p>
        <Button disabled={busy}>
          {busy ? "Saving…" : "Save account name"}
        </Button>
      </form>
      {message && (
        <p role="status" className="alert">
          {message}
        </p>
      )}
      <p>
        <Link href="/forgot-password">Reset password by email</Link>
      </p>
    </section>
  );
}
