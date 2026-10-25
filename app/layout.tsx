import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./dashboard.css";
import "./readability.css";
import "./mobile-theme.css";
import "./attendance-cards.css";
import "./salary-generator.css";
import "./device-import.css";
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
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('maamul-theme');var d=t==='dark'||(!t&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=d?'dark':'light';document.documentElement.style.colorScheme=d?'dark':'light'}catch(e){document.documentElement.dataset.theme=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}`,
          }}
        />
        {children}
      </body>
    </html>
  );
}
