"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { modules, canViewModule } from "@/lib/modules";
import { AppControls, MobileNavigation } from "./mobile-app";
import { AccountMenu } from "./account-menu";
import {
  LayoutDashboard,
  Users,
  Clock3,
  CalendarDays,
  Wallet,
  Building2,
  FileChartColumn,
  Settings,
  ChevronDown,
  Menu,
  LogOut,
  Fingerprint,
  ShieldCheck,
  ArrowUpRight,
  BriefcaseBusiness,
} from "lucide-react";
const navigation = [
  {
    label: "WORKSPACE",
    items: [
      ["Overview", "/", "dashboard"],
      ["Employees", "/manage/employees", "people"],
      ["Attendance", "/manage/attendance", "clock"],
      ["Leave management", "/manage/leave", "calendar"],
      ["Payroll", "/manage/payroll", "wallet"],
      ["Reports & analytics", "/reports", "reports"],
    ],
  },
  {
    label: "ORGANIZATION",
    items: [
      ["Branches", "/manage/branches", "building"],
      ["Departments", "/manage/departments", "briefcase"],
      ["Devices & integration", "/manage/devices", "fingerprint"],
      ["Settings", "/settings", "settings"],
    ],
  },
];
const icons: Record<string, typeof Users> = {
  dashboard: LayoutDashboard,
  people: Users,
  clock: Clock3,
  calendar: CalendarDays,
  wallet: Wallet,
  reports: FileChartColumn,
  building: Building2,
  briefcase: BriefcaseBusiness,
  fingerprint: Fingerprint,
  settings: Settings,
};
export function Shell({
  children,
  companies,
  companyId,
  role,
  email,
  connected,
}: {
  children: React.ReactNode;
  companies: { id: string; name: string }[];
  companyId?: string;
  role?: string;
  email?: string;
  connected: boolean;
}) {
  const path = usePathname(),
    router = useRouter();
  const [open, setOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        document.querySelector<HTMLButtonElement>(".mobile-menu")?.focus();
      }
    };
    document.addEventListener("keydown", close);
    const media = window.matchMedia("(max-width: 800px)");
    const resize = () => {
      if (!media.matches) setOpen(false);
    };
    media.addEventListener("change", resize);
    const previous = document.body.style.overflow;
    if (media.matches) document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", close);
      media.removeEventListener("change", resize);
      document.body.style.overflow = previous;
    };
  }, [open]);
  return (
    <div className="app-shell">
      {open && (
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label="Close navigation"
          onClick={() => setOpen(false)}
        />
      )}
      <aside
        id="workspace-sidebar"
        className={open ? "sidebar open" : "sidebar"}
      >
        <Link href="/" className="brand">
          <img src="/logo.png" alt="Maamul HR" width={187} height={65} />
        </Link>
        <div className="workspace-select">
          <div className="company-mark">
            <Building2 size={19} />
          </div>
          <div>
            <strong>
              {companies.find((c) => c.id === companyId)?.name ??
                "Your organization"}
            </strong>
            <span>{connected ? "Company workspace" : "Setup workspace"}</span>
          </div>
          <ChevronDown size={14} />
          <select
            aria-label="Select company"
            value={companyId ?? ""}
            onChange={(e) => {
              document.cookie = `company_id=${e.target.value};path=/;SameSite=Lax`;
              router.refresh();
            }}
          >
            <option value="" disabled>
              Select company
            </option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        {navigation.map((group) => (
          <div className="nav-group" key={group.label}>
            <p>{group.label}</p>
            {group.items
              .filter(([, href]) =>
                href.startsWith("/manage/")
                  ? canViewModule(role, href.split("/")[2])
                  : href === "/settings"
                    ? ["super_admin", "company_admin"].includes(role ?? "") ||
                      !companyId
                    : true,
              )
              .map(([label, href, icon]) => {
                const Icon = icons[icon];
                return (
                  <Link
                    onClick={() => setOpen(false)}
                    className={`nav-item ${(href === "/" ? path === "/" : path.startsWith(href)) ? "active" : ""}`}
                    href={href}
                    prefetch={false}
                    onMouseEnter={() => router.prefetch(href)}
                    onFocus={() => router.prefetch(href)}
                    key={href}
                  >
                    <Icon size={19} />
                    <span>{label}</span>
                    {label === "Devices & integration" && (
                      <span className="nav-dot" />
                    )}
                  </Link>
                );
              })}
          </div>
        ))}
        <div className="sidebar-bottom">
          <div className="sidebar-app-controls">
            <AppControls />
          </div>
          <div className="secure-note">
            <ShieldCheck size={21} />
            <strong>Your people. Protected.</strong>
            <p>Private records with company-level access controls.</p>
            <Link href="/settings">
              Manage workspace <ArrowUpRight size={13} />
            </Link>
          </div>
          <div className="user">
            <span className="avatar">
              {email?.slice(0, 2).toUpperCase() ?? "MH"}
            </span>
            <div>
              <strong>{email ?? "Maamul HR"}</strong>
              <span>{role?.replaceAll("_", " ") ?? "Not connected"}</span>
            </div>
            {email && (
              <form action="/auth/signout" method="post">
                <button aria-label="Sign out">
                  <LogOut size={17} />
                </button>
              </form>
            )}
          </div>
        </div>
      </aside>
      <div className="main-wrap">
        <header className="topbar">
          <button
            className="mobile-menu"
            onClick={() => setOpen(!open)}
            aria-label="Toggle navigation"
            aria-expanded={open}
            aria-controls="workspace-sidebar"
          >
            <Menu />
          </button>
          <div className="breadcrumb">
            Workspace <span>/</span>{" "}
            <strong>
              {path === "/"
                ? "Overview"
                : path.split("/").at(-1)?.replaceAll("-", " ")}
            </strong>
          </div>
          <div className="topbar-right">
            <div className="workspace-shortcuts">
              <button
                className="button button-outline"
                aria-expanded={shortcutsOpen}
                aria-controls="workspace-shortcuts"
                onClick={() => setShortcutsOpen(!shortcutsOpen)}
              >
                All modules <ChevronDown size={16} />
              </button>
              {shortcutsOpen && (
                <nav
                  id="workspace-shortcuts"
                  aria-label="All workspace modules"
                >
                  {Object.entries(modules)
                    .filter(([key]) => canViewModule(role, key))
                    .map(([key, module]) => (
                      <Link
                        key={key}
                        href={`/manage/${key}`}
                        prefetch={false}
                        onClick={() => {
                          setShortcutsOpen(false);
                          setOpen(false);
                        }}
                      >
                        {module.title}
                      </Link>
                    ))}
                </nav>
              )}
            </div>
            <AccountMenu email={email} role={role} />
          </div>
        </header>
        <main>{children}</main>
        <footer>
          © {new Date().getUTCFullYear()} Maamul HR{" "}
          <span>People first. Every day.</span>
        </footer>
      </div>
      <MobileNavigation role={role} />
    </div>
  );
}
