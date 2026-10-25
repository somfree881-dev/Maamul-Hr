import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { Shell } from "@/components/shell";
import { configured } from "@/lib/supabase/server";
import { session } from "@/lib/auth";
import "./globals.css";
import "./dashboard.css";
import "./readability.css";
import "./mobile-theme.css";
import "./attendance-cards.css";
import "./salary-generator.css";
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f8fa" },
    { media: "(prefers-color-scheme: dark)", color: "#101b28" },
  ],
};
export const metadata: Metadata = {
  title: "Maamul HR | People & Payroll",
  description: "Secure multi-company human resources, attendance and payroll.",
  applicationName: "Maamul HR",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Maamul HR",
  },
  icons: { apple: "/icon" },
};
export const dynamic = "force-dynamic";
export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  let companies: { id: string; name: string }[] = [];
  let role: string | undefined,
    email: string | undefined,
    companyId: string | undefined;
  if (configured()) {
    try {
      const s = await session();
      const chosen = (await cookies()).get("company_id")?.value;
      const m =
        s.memberships.find((x) => x.company_id === chosen) ?? s.membership;
      companies = s.memberships.map((x) => ({
        id: x.company_id,
        name: (x.companies as unknown as { name: string })?.name ?? "Company",
      }));
      role = m?.role;
      companyId = m?.company_id;
      email = s.user.email;
    } catch {
      /* Login page remains available. */
    }
  }
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('maamul-theme');var d=t==='dark'||(!t&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=d?'dark':'light';document.documentElement.style.colorScheme=d?'dark':'light'}catch(e){document.documentElement.dataset.theme=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}`,
          }}
        />
        <Shell
          companies={companies}
          companyId={companyId}
          role={role}
          email={email}
          connected={!!email}
        >
          {children}
        </Shell>
      </body>
    </html>
  );
}
