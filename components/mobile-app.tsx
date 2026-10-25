"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  Download,
  Moon,
  Sun,
  X,
  LayoutDashboard,
  Users,
  Clock3,
  Wallet,
  FileChartColumn,
} from "lucide-react";
import { canViewModule } from "@/lib/modules";
type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};

export function AppControls() {
  const [dark, setDark] = useState(false);
  const [install, setInstall] = useState<InstallEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [help, setHelp] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    function sync() {
      let saved: string | null = null;
      try {
        saved = localStorage.getItem("maamul-theme");
      } catch {}
      const value = saved === "dark" || (!saved && media.matches);
      document.documentElement.dataset.theme = value ? "dark" : "light";
      document.documentElement.style.colorScheme = value ? "dark" : "light";
      setDark(value);
    }
    sync();
    media.addEventListener("change", sync);
    window.addEventListener("storage", sync);
    const standalone = window.matchMedia("(display-mode: standalone)");
    const updateInstalled = () =>
      setInstalled(
        standalone.matches ||
          !!(navigator as Navigator & { standalone?: boolean }).standalone,
      );
    updateInstalled();
    standalone.addEventListener("change", updateInstalled);
    const capture = (event: Event) => {
      event.preventDefault();
      setInstall(event as InstallEvent);
    };
    const completed = () => {
      setInstalled(true);
      setInstall(null);
      setHelp(false);
    };
    window.addEventListener("beforeinstallprompt", capture);
    window.addEventListener("appinstalled", completed);
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator)
      navigator.serviceWorker
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
        .catch(() => {});
    return () => {
      media.removeEventListener("change", sync);
      window.removeEventListener("storage", sync);
      standalone.removeEventListener("change", updateInstalled);
      window.removeEventListener("beforeinstallprompt", capture);
      window.removeEventListener("appinstalled", completed);
    };
  }, []);
  return (
    <div className="app-controls">
      <button
        type="button"
        className="app-control"
        aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
        title={dark ? "Light mode" : "Dark mode"}
        aria-pressed={dark}
        onClick={() => {
          const next = !dark;
          setDark(next);
          document.documentElement.dataset.theme = next ? "dark" : "light";
          document.documentElement.style.colorScheme = next ? "dark" : "light";
          try {
            localStorage.setItem("maamul-theme", next ? "dark" : "light");
          } catch {}
        }}
      >
        {dark ? <Sun size={20} /> : <Moon size={20} />}
        <span>{dark ? "Light mode" : "Dark mode"}</span>
      </button>
      {!installed && (
        <button
          type="button"
          className="app-control install-control"
          onClick={async () => {
            if (!install) {
              setHelp(true);
              return;
            }
            try {
              await install.prompt();
              await install.userChoice;
            } catch {
              setHelp(true);
            } finally {
              setInstall(null);
            }
          }}
          aria-label="Install Maamul HR"
        >
          <Download size={19} />
          <span>Install app</span>
        </button>
      )}
      {help &&
        createPortal(
          <div className="app-shell app-modal-root">
            <div className="modal-backdrop" onClick={() => setHelp(false)}>
              <section
                className="modal install-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="install-title"
                onClick={(event) => event.stopPropagation()}
                onKeyDown={(event) => {
                  if (event.key === "Escape") setHelp(false);
                }}
              >
                <div className="modal-head">
                  <h2 id="install-title">Install Maamul HR</h2>
                  <button
                    aria-label="Close installation help"
                    onClick={() => setHelp(false)}
                    autoFocus
                  >
                    <X />
                  </button>
                </div>
                <p>
                  <strong>Android / Chrome:</strong> Open the browser menu and
                  select “Install app” or “Add to Home screen”.
                </p>
                <p>
                  <strong>iPhone / Safari:</strong> Tap Share, then “Add to Home
                  Screen” and “Add”.
                </p>
                <p>
                  The online app needs an HTTPS address for installation on your
                  phone. Employee and payroll data still require an internet
                  connection and sign-in.
                </p>
                <button
                  className="button button-primary"
                  onClick={() => setHelp(false)}
                >
                  Got it
                </button>
              </section>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

export function MobileNavigation({ role }: { role?: string }) {
  const path = usePathname();
  if (path.startsWith("/login")) return null;
  const links = [
    { title: "Home", href: "/", icon: LayoutDashboard, area: null },
    {
      title: "Employee",
      href: "/manage/employees",
      icon: Users,
      area: "hr" as const,
    },
    {
      title: "Attendance",
      href: "/manage/attendance",
      icon: Clock3,
      area: "attendance" as const,
    },
    {
      title: "Payroll",
      href: "/manage/payroll",
      icon: Wallet,
      area: "finance" as const,
    },
    { title: "Reports", href: "/reports", icon: FileChartColumn, area: null },
  ].filter((link) =>
    link.href.startsWith("/manage/")
      ? canViewModule(role, link.href.split("/")[2])
      : true,
  );
  return (
    <nav className="mobile-bottom-nav" aria-label="Mobile navigation">
      {links.map(({ title, href, icon: Icon }) => {
        const active =
          href === "/"
            ? path === "/"
            : path.startsWith(href) ||
              (title === "Employee" && path.startsWith("/employees/"));
        return (
          <Link
            key={href}
            href={href}
            prefetch={false}
            className={active ? "active" : ""}
            aria-current={active ? "page" : undefined}
          >
            <Icon size={22} />
            <span>{title}</span>
          </Link>
        );
      })}
    </nav>
  );
}
