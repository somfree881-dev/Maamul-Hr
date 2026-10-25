"use client";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { Settings, LogOut, LogIn } from "lucide-react";

export function AccountMenu({
  email,
  role,
}: {
  email?: string;
  role?: string;
}) {
  const menu = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (menu.current && !menu.current.contains(event.target as Node))
        menu.current.open = false;
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);
  return (
    <details
      className="account-menu"
      ref={menu}
      onKeyDown={(event) => {
        if (event.key === "Escape" && menu.current) {
          menu.current.open = false;
          menu.current.querySelector("summary")?.focus();
        }
      }}
      onBlur={(event) => {
        if (
          event.relatedTarget &&
          !event.currentTarget.contains(event.relatedTarget as Node)
        )
          event.currentTarget.open = false;
      }}
    >
      <summary
        className="avatar small account-trigger"
        aria-label="Open account menu"
        title="Your account"
      >
        {email?.slice(0, 2).toUpperCase() ?? "MH"}
      </summary>
      <div className="account-dropdown">
        <div className="account-identity">
          <strong>{email ?? "Maamul HR"}</strong>
          <span>
            {role?.replaceAll("_", " ") ?? "Sign in to your workspace"}
          </span>
        </div>
        {email ? (
          <>
            <Link
              href="/settings"
              onClick={() => {
                if (menu.current) menu.current.open = false;
              }}
            >
              <Settings size={18} /> Account & settings
            </Link>
            <form action="/auth/signout" method="post">
              <button type="submit">
                <LogOut size={18} /> Sign out
              </button>
            </form>
          </>
        ) : (
          <Link
            href="/login"
            onClick={() => {
              if (menu.current) menu.current.open = false;
            }}
          >
            <LogIn size={18} /> Sign in
          </Link>
        )}
      </div>
    </details>
  );
}
