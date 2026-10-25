"use client";
import { useEffect } from "react";
import { createBrowserClient } from "@supabase/ssr";
/** Revalidate restored browser snapshots and sign out in every open tab. */
export function SessionGuard() {
  useEffect(() => {
    const client = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    );
    const { data } = client.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") window.location.replace("/login");
    });
    const restored = (event: PageTransitionEvent) => {
      if (event.persisted) {
        document.documentElement.style.visibility = "hidden";
        window.location.reload();
      }
    };
    const check = async () => {
      if (document.visibilityState !== "visible") return;
      const { data, error } = await client.auth.getUser();
      if (error || !data.user) window.location.replace("/login");
    };
    window.addEventListener("pageshow", restored);
    document.addEventListener("visibilitychange", check);
    const timer = window.setInterval(check, 60_000);
    return () => {
      data.subscription.unsubscribe();
      window.removeEventListener("pageshow", restored);
      document.removeEventListener("visibilitychange", check);
      window.clearInterval(timer);
    };
  }, []);
  return null;
}
